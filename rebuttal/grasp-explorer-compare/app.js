import { applyProceduralSurfaces } from './procedural-surfaces.js';
import * as THREE from '../grasp-explorer-v2/vendor/three.module.js';
import { OrbitControls } from '../grasp-explorer-v2/vendor/OrbitControls.js';
import { GLTFLoader } from '../grasp-explorer-v2/vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../grasp-explorer-v2/vendor/meshopt_decoder.module.js';
import { createComparisonModel, sampleComparisonPath, comparisonMetrics, selectDiverseEntries, analyzeComparisonPaths } from './comparison.js';
import { renderDiversityLens, updateDiversityProgress, setDiversityView } from './diversity.js';
import { analyzePhysics, physicsFrameAt, selectFailureCases } from './physics.js';
import { computeReachabilityProof, createReachabilityVisual, readPrescreenMetadata, referenceReachabilityAnchor } from './reachability.js';

import { createEvaluationSession, compareEndpointRates, rateStatistics, formatRate, validateWamTrajectory, hasIncompleteGapMeasurements } from './wam-evaluation.js';

const $ = (id) => document.getElementById(id);
const rootURL = new URL('./', window.location.href);
const assetBase = new URL('./', import.meta.url).href;
const sharedRobot = new URL('assets/robot-20261111-light.glb.gz', assetBase).href;
const statusLabels = { unknown: 'Unknown', success: 'Success', planning_rejected: 'Planning rejected', physics_failed: 'Unsuccessful' };
const outcomeLabels = { success: "Success", ik_failed: 'IK-FAIL', prescreen_ik_failed: "IK-FAIL (pre-screening)", lift_ik_failed: "Lift-pose IK failed", lift_plan_failed: "Lift planning failed", reach_rejected: "Pre-Screen Reject", prescreen_rejected: "Prescreen rejected", physical_validation_failed: "Physical validation failed" };
const statusAliases = { rejected: 'planning_rejected', planning_reject: 'planning_rejected', physical_failure: 'physics_failed', failed: 'physics_failed' };
const kindLabels = { reachable: "Reachable", successful: "Reachable", diverse: "Reachable", unreachable: "Out of reach", prescreen_ik_failure: "Pre-screening IK-FAIL", too_far: "Out of reach", constrained: "Full-pose IK failed", obstructed: "Obstructed", pose_failure: "Grasp IK constrained" };
const palette = ['#078a85', '#407bb0', '#7371a7', '#45957d', '#5398af', '#a07f40', '#916b97', '#3e8396'];
const comparisonPalette = ['#007ac2', '#e55c19', '#9b3bba', '#00835d', '#cf305b', '#ad7900'];
const state = {
  evaluation: null, dexSource: 'planned',
  manifest: null, point: null, trial: null, trajectory: null,
  playing: false, time: 0, duration: 0, speed: 1, ready: false,
  pointToken: 0, trialToken: 0, cache: new Map(), loadErrors: new Map(),
  paths: [], markers: [], bindings: [], requiredDimensions: 0,
  robotMaterials: [],
  shellNodes: [], missingShellNodes: [],
  diagnosticMode: false, previousAxesChecked: null,
  experiment: null, prescreen: null, physics: null, physicsPlot: null,
  reachabilityMode: false, reachabilityProof: null, reachabilityVisual: null, reachLabels: [], reachabilityPointId: null,
  reachabilityAudit: null, failureCases: [],
  viewMode: 'single', comparisonModel: null,
  comparison: { source: 'planned', progress: 0.55, playing: false, candidates: [], entries: [], selectedIds: [], visuals: [], colors: new Map(), loading: false, analysis: null, allAnalysis: null },
  homePosition: new THREE.Vector3(4, -5, 3), homeTarget: new THREE.Vector3(0, 0, 0.8),
};

let scene, camera, renderer, controls, loader, robotRoot, objectRoot, sceneAsset;
let markerGroup, pathGroup, eeAxes, witnessAxes, requestedAxes, animationId, lastFrameTime = 0;
let comparisonGroup;
let needsRender = true;
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const tmpQuaternion = new THREE.Quaternion();
const poseQuaternionA = new THREE.Quaternion();
const poseQuaternionB = new THREE.Quaternion();
const tmpVector = new THREE.Vector3();
const tmpProjection = new THREE.Vector3();
const identityPose = [0, 0, 0, 0, 0, 0, 1];

let requestedMethod = 'dexonomy';
const embedded = new URLSearchParams(location.search).get('embed') === '1' && parent !== window;
if (embedded) document.querySelector('.model-toolbar').hidden = true;
window.addEventListener('message', event => {
  if (!embedded || event.origin !== location.origin || event.source !== parent || event.data?.type !== 'grasp-method') return;
  if (!['dexonomy', 'wam'].includes(event.data.model)) return;
  requestedMethod = event.data.model;
  if (state.ready && evaluationView().model !== requestedMethod) switchEvaluation(requestedMethod).catch(error => notice(errorMessage(error)));
});

function invalidate() { needsRender = true; }

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function resourceURL(path) {
  if (typeof path !== 'string' || !path.trim()) throw new Error("The data is missing a local file path.");
  if (path === 'assets/robot.glb' || path === sharedRobot) return sharedRobot;
  if (path === 'assets/scene.glb') return assetBase + 'assets/scene-20261111-light.glb.gz';
  if (path === 'assets/object.glb') return assetBase + 'assets/object-20261111.glb.gz';
  if (['scene-20261111-light.glb.gz', 'object-20261111.glb.gz'].some(name => path === assetBase + 'assets/' + name)) return path;
  const url = new URL(path, rootURL);
  if (url.origin !== rootURL.origin || !url.pathname.startsWith(rootURL.pathname)) {
    throw new Error(`Resources must be located in the local delivery directory:${path}`);
  }
  return url.href;
}

async function readJSON(path) {
  const response = await fetch(resourceURL(path), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}：HTTP ${response.status}`);
  if (path.endsWith('.gz')) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Some hosts send Content-Encoding and fetch has already decoded the body.
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new Error("Replay decompression requires a newer version of Chrome, Edge, Firefox, or Safari.");
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).json();
      } catch { throw new Error(`${path}Invalid playback compressed data.`); }
    }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error(`${path}Not a valid JSON.`); }
  }
  try { return await response.json(); }
  catch { throw new Error(`${path}Not a valid JSON.`); }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function setLoading(title, detail, isError = false) {
  $('loading-panel').hidden = false;
  $('loading-panel').classList.toggle('is-error', isError);
  $('loading-title').textContent = title;
  $('loading-detail').textContent = detail;
  $('loading-spinner').hidden = isError;
  $('retry-button').hidden = !isError;
}

function notice(message = '') {
  $('viewer-notice').textContent = message;
  $('viewer-notice').hidden = !message;
}

function announce(message) { $('announcer').textContent = message; }
function canonicalStatus(status) { return statusAliases[status] || status; }
const evaluationView = () => state.evaluation?.view();
const isWam = () => evaluationView()?.isWam === true;
const originalDex = () => evaluationView()?.isOriginalDexonomy === true;
function outcomeCode(trial) { return trial.outcome?.code || trial.status; }
function failureCase(trial) {
  const code = outcomeCode(trial);
  if (code === 'physical_validation_failed') return 2;
  if (['ik_failed', 'prescreen_ik_failed', 'lift_ik_failed', 'lift_plan_failed', 'reach_rejected', 'prescreen_rejected'].includes(code) || trial.status === 'planning_rejected') return 3;
  return null;
}
function outcomeLabel(trial) {
  if (isWam()) return trial.status === 'unknown' ? 'Unknown' : trial.outcome?.label || statusLabels[trial.status];
  const label = outcomeLabels[outcomeCode(trial)] || statusLabels[trial.status];
  const category = failureCase(trial);
  return category ? `Case ${category} · ${label}` : label;
}
function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '—';
}
function percentage(successes, attempts) {
  return attempts ? `${formatNumber(100 * successes / attempts, 1)}%` : '—';
}
function pointLabel(point) {
  return String(point.label || point.id).replace(new RegExp(`^${String(point.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[·.、:：—–-]\\s*`), '');
}
function statistics(point) {
  const successes = point.trials.filter((trial) => trial.status === 'success').length;
  const attempts = point.trials.length;
  const supplied = point.statistics || {};
  const mismatch = (supplied.successes !== undefined && supplied.successes !== successes)
    || (supplied.attempts !== undefined && supplied.attempts !== attempts);
  return { successes, attempts, mismatch };
}
function preferredTrial(point) {
  return point.trials.find((trial) => trial.id === point.defaultTrialId)
    || point.trials.find((trial) => trial.status === 'success' && trial.file)
    || point.trials.find((trial) => trial.file) || point.trials[0];
}
function formatPositionError(value) {
  return `${value > 0 && value < 0.0001 ? value.toExponential(2) : formatNumber(value, 5)} m`;
}
function trialKey(point, trial) { return state.evaluation?.cacheKey(point.id, trial.id) || `${point.id}/${trial.id}`; }
function trialColor(point, trial) {
  const index = point.trials.indexOf(trial);
  if (trial.status === 'planning_rejected') return ['#a87940', '#b5865f', '#9c7551'][index % 3];
  if (trial.status === 'physics_failed') return ['#a65049', '#bc755e', '#a06476'][index % 3];
  return palette[index % palette.length];
}

function finiteArray(value, length) {
  return Array.isArray(value) && (length === undefined || value.length === length)
    && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function normalizePose(value, label) {
  let pose = value;
  if (Array.isArray(value) && value.length === 2 && finiteArray(value[0], 3) && finiteArray(value[1], 4)) {
    pose = [...value[0], ...value[1]];
  }
  if (!finiteArray(pose, 7)) throw new Error(`${label}Must be a 7-dimensional pose of xyz + xyzw.`);
  const norm = Math.hypot(...pose.slice(3));
  if (norm < 1e-8) throw new Error(`${label}The quaternion of is not valid.`);
  return [...pose.slice(0, 3), ...pose.slice(3).map((v) => v / norm)];
}

function validatePositionIK(witness, pointId) {
  const label = `Stop${pointId}positionIK for`;
  if (!witness || !finiteArray(witness.joints) || !witness.joints.length) throw new Error(`${label}Missing valid joint status.`);
  for (const key of ['basePose', 'eePose', 'requestedGraspPose']) witness[key] = normalizePose(witness[key], `${label}.${key}`);
  if (!Number.isFinite(witness.positionErrorM) || witness.positionErrorM < 0
    || !Number.isFinite(witness.orientationErrorDeg) || witness.orientationErrorDeg < 0 || witness.orientationErrorDeg > 180.000001) {
    throw new Error(`${label}Missing valid position/rotation error.`);
  }
  if (witness.collisionFree !== true || witness.executed !== false) {
    throw new Error(`${label}You must explicitly mark collisionFree: true, executed: false.`);
  }
  return witness;
}

function validateManifest(data) {
  if (!data || typeof data !== 'object') throw new Error("invalid manifest.json content.");
  if (!Array.isArray(data.points) || !data.points.length) throw new Error("The experiment has not yet provided a record of the stops.");
  for (const required of ['scene', 'robot', 'object']) {
    if (!data[required]?.file) throw new Error(`manifest.json missing${required}.file。`);
    resourceURL(data[required].file);
  }
  if (!data.robot.kinematics) throw new Error("manifest.json Missing robot.kinematics.");
  resourceURL(data.robot.kinematics);
  data.object.initialPose = normalizePose(data.object.initialPose, 'object.initialPose');
  if (data.scene.shellNodes !== undefined && (!Array.isArray(data.scene.shellNodes)
    || !data.scene.shellNodes.every((name) => typeof name === 'string' && name.trim()))) {
    throw new Error("scene.shellNodes must be an exact array of node names for the room shell.");
  }
  const pointIds = new Set();
  for (const point of data.points) {
    if (!point.id || pointIds.has(String(point.id))) throw new Error("Stop id is missing or duplicated.");
    point.id = String(point.id);
    pointIds.add(point.id);
    if (!finiteArray(point.position, 3)) throw new Error(`Stop${point.id}Missing valid position.`);
    if (point.yaw !== undefined && !Number.isFinite(point.yaw)) throw new Error(`Stop${point.id}Invalid yaw for.`);
    if (!Array.isArray(point.trials)) throw new Error(`Stop${point.id}Missing trials.`);
    const trialIds = new Set();
    for (const trial of point.trials) {
      if (!trial.id || trialIds.has(String(trial.id))) throw new Error(`Stop${point.id}Missing or duplicate attempt id for.`);
      trial.id = String(trial.id);
      trialIds.add(trial.id);
      trial.status = canonicalStatus(trial.status);
      if (!statusLabels[trial.status]) throw new Error(`${point.id}/${trial.id}Result classification not recognized:${trial.status}`);
      if (trial.file) resourceURL(trial.file);
    }
    if (point.defaultTrialId !== undefined) {
      point.defaultTrialId = String(point.defaultTrialId);
      if (!trialIds.has(point.defaultTrialId)) throw new Error(`Stop${point.id}The defaultTrialId of does not correspond to a real attempt.`);
    }
    if (point.diagnostics?.positionIK !== undefined) validatePositionIK(point.diagnostics.positionIK, point.id);
  }
  return data;
}

function validateTrajectory(raw, file) {
  if (!raw || !Array.isArray(raw.timestamps) || !raw.timestamps.length) {
    throw new Error(`${file}Missing timestamps.`);
  }
  const count = raw.timestamps.length;
  if (!finiteArray(raw.timestamps) || raw.timestamps.some((t, i) => i && t <= raw.timestamps[i - 1])) {
    throw new Error(`${file}Timestamps must be strictly incremented.`);
  }
  const trajectory = { ...raw, file, frameCount: count };
  for (const name of ['joints', 'base', 'object', 'ee']) {
    if (raw[name] === undefined || raw[name] === null) continue;
    if (!Array.isArray(raw[name]) || raw[name].length !== count) {
      throw new Error(`${file}of${name}The number of frames does not match the timestamps.`);
    }
    if (name === 'joints') {
      const dimension = raw.joints[0]?.length;
      if (!Number.isInteger(dimension) || dimension < state.requiredDimensions
        || !raw.joints.every((row) => finiteArray(row, dimension))) {
        throw new Error(`${file}Invalid joint state, the model needs at least${state.requiredDimensions}dimension.`);
      }
      trajectory.dimensions = dimension;
    } else {
      trajectory[name] = raw[name].map((pose, index) => normalizePose(pose, `${name}[${index}]`));
    }
  }
  if (raw.basePose) trajectory.basePose = normalizePose(raw.basePose, 'basePose');
  trajectory.stages = Array.isArray(raw.stages) ? raw.stages.filter((stage) =>
    stage && Number.isFinite(stage.start) && Number.isFinite(stage.end) && stage.end >= stage.start) : [];
  trajectory.start = raw.timestamps[0];
  trajectory.duration = raw.timestamps[count - 1] - trajectory.start;
  return trajectory;
}

function getTrajectory(point, trial) {
  const key = trialKey(point, trial);
  if (!state.cache.has(key)) {
    const wam = isWam(), checkpoint = evaluationView()?.payload.model.checkpoint.sha256;
    state.cache.set(key, readJSON(trial.file).then(raw => {
      if (wam) validateWamTrajectory(raw, checkpoint);
      return validateTrajectory(raw, trial.file);
    }));
  }
  return state.cache.get(key);
}

function initializeGraphics() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9eff3');
  camera = new THREE.PerspectiveCamera(42, 1, 0.015, 150);
  camera.up.set(0, 0, 1);
  camera.position.copy(state.homePosition);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.domElement.setAttribute('tabindex', '0');
  renderer.domElement.setAttribute('aria-label', "3D scene: drag to orbit, scroll to zoom, right-drag to pan. Select poses in the left panel.");
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    setPlaying(false);
    setLoading("3D rendering interrupted", "WebGL context is missing.Click Reload to restore.", true);
  });
  $('canvas-host').append(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(state.homeTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 0.2;
  controls.maxDistance = 35;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.addEventListener('change', invalidate);
  controls.update();

  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6b7075, 2.5));
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e8, 3.1);
  key.position.set(3, -4, 7);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe1f2ff, 1.6);
  fill.position.set(-4, 1, 4);
  scene.add(fill);
  const grid = new THREE.GridHelper(20, 80, 0xc5d2dc, 0xd8e2e9);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.012;
  grid.material.transparent = true;
  grid.material.opacity = 0.6;
  scene.add(grid);
  markerGroup = new THREE.Group();
  pathGroup = new THREE.Group();
  comparisonGroup = new THREE.Group();
  robotRoot = new THREE.Group();
  objectRoot = new THREE.Group();
  eeAxes = new THREE.AxesHelper(0.11);
  eeAxes.visible = false;
  eeAxes.renderOrder = 5;
  eeAxes.material.depthTest = false;
  witnessAxes = new THREE.AxesHelper(0.13);
  witnessAxes.material.depthTest = false;
  witnessAxes.renderOrder = 8;
  witnessAxes.visible = false;
  requestedAxes = new THREE.Group();
  const axisColors = [0xe05b5b, 0x61a966, 0x4977d1];
  for (let axis = 0; axis < 3; axis++) {
    const end = new THREE.Vector3();
    end.setComponent(axis, 0.2);
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), end]);
    const material = new THREE.LineDashedMaterial({ color: axisColors[axis], dashSize: 0.015, gapSize: 0.009, depthTest: false });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    line.renderOrder = 9;
    requestedAxes.add(line);
  }
  requestedAxes.visible = false;
  scene.add(markerGroup, pathGroup, comparisonGroup, robotRoot, objectRoot, eeAxes, witnessAxes, requestedAxes);

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    return resourceURL(url);
  });
  loader = new GLTFLoader(manager);
  // Decode in parallel without blocking page interaction.
  if (typeof Worker !== 'undefined' && (navigator.hardwareConcurrency || 2) > 2) {
    try { MeshoptDecoder.useWorkers(2); } catch { MeshoptDecoder.useWorkers(0); }
  }
  loader.setMeshoptDecoder(MeshoptDecoder);
  const resize = () => {
    const rect = $('canvas-host').getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
    invalidate();
  };
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe($('canvas-host'));
    const analysisResize = new ResizeObserver(updateAnalysisLayout);
    for (const id of ['diversity-lens', 'physics-lens', 'reachability-lens', 'd-pose-lens']) analysisResize.observe($(id));
  }
  else window.addEventListener('resize', resize);
  resize();
  let downPosition = null;
  renderer.domElement.addEventListener('pointerdown', (event) => { downPosition = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (event.button !== 0 || !downPosition || Math.hypot(event.clientX - downPosition[0], event.clientY - downPosition[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets = [...state.markers.map((marker) => marker.hit), ...state.paths.filter((path) => path.mesh.visible).map((path) => path.mesh)];
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (hit?.object.userData.point) selectPoint(hit.object.userData.point);
    else if (hit?.object.userData.trial && state.viewMode === 'single') selectTrial(hit.object.userData.trial);
  });
  animationId = requestAnimationFrame(animate);
}

async function loadModel(path) {
  try {
    const url = resourceURL(path);
    const warmed = window.__graspAssetWarmup?.get(url);
    const bytes = warmed ? await warmed : await fetch(url).then(response => {
      if (!response.ok) throw new Error(`Model download: HTTP ${response.status}`);
      return response.arrayBuffer();
    });
    const header = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
    let localBytes;
    if (header[0] === 0x1f && header[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Please use a browser with gzip decompression support.');
      localBytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    } else {
      // ArrayBuffers shared by the parent page belong to another JavaScript realm.
      localBytes = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).slice().buffer;
    }
    const gltf = await loader.parseAsync(localBytes, new URL('./', url).href);
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
    return gltf.scene;
  } catch (error) {
    throw new Error(`${path}Loading failed:${errorMessage(error)}`);
  }
}

function bindJoints(model, kinematics) {
  if (!Array.isArray(kinematics.joints) || !kinematics.joints.length) throw new Error("robot.json Missing joint definition.");
  const bindings = [];
  const missing = [];
  for (const joint of kinematics.joints) {
    if (joint.type === 'fixed') continue;
    const object = model.getObjectByName(joint.node || joint.name);
    if (!object) { missing.push(joint.node || joint.name); continue; }
    if (!['revolute', 'continuous', 'prismatic'].includes(joint.type)) throw new Error(`Joint type not supported${joint.type}（${joint.name}）。`);
    if (!Number.isInteger(joint.stateIndex) || joint.stateIndex < 0 || !finiteArray(joint.axis, 3) || Math.hypot(...joint.axis) < 1e-8) {
      throw new Error(`Joint${joint.name}Invalid axis/stateIndex for.`);
    }
    const axis = new THREE.Vector3(...joint.axis).normalize();
    bindings.push({
      object, type: joint.type, index: joint.stateIndex, axis,
      restPosition: object.position.clone(), restQuaternion: object.quaternion.clone(),
      parentAxis: axis.clone().applyQuaternion(object.quaternion),
    });
  }
  if (missing.length) throw new Error(`Robot GLB missing${missing.length}joint nodes:${missing.slice(0, 4).join('、')}`);
  if (!bindings.length) throw new Error("The robot has no joints to play back.");
  state.bindings = bindings;
  state.requiredDimensions = Math.max(...bindings.map((binding) => binding.index)) + 1;
}

function setPose(object, pose) {
  object.position.set(pose[0], pose[1], pose[2]);
  object.quaternion.set(pose[3], pose[4], pose[5], pose[6]);
  invalidate();
}

function configureCutaway() {
  state.shellNodes = [];
  state.missingShellNodes = [];
  for (const name of new Set(state.manifest.scene.shellNodes || [])) {
    const object = sceneAsset.getObjectByName(name);
    if (object) state.shellNodes.push({ object, originalVisible: object.visible });
    else state.missingShellNodes.push(name);
  }
  $('show-cutaway').disabled = !state.shellNodes.length;
  $('show-cutaway').title = state.shellNodes.length
    ? "Hide only the walls, windows, and ceilings specified in the checklist; keep the desktops, objects, and real obstacles."
    : "The current scene does not have a list of matching shell nodes.";
  applyCutaway();
}

function applyCutaway() {
  const enabled = $('show-cutaway').checked && state.shellNodes.length > 0;
  for (const entry of state.shellNodes) entry.object.visible = enabled ? false : entry.originalVisible;
  const missing = state.missingShellNodes.length;
  $('cutaway-state').textContent = enabled
    ? `Cutaway · ${state.shellNodes.length} hidden${missing ? ` · ${missing} unavailable` : ''}`
    : `Full Scene: Shell Visible${missing ? `，${missing}Item list not matched` : ''}`;
  $('cutaway-state').title = missing ? `Unmatched nodes:${state.missingShellNodes.join('、')}` : '';
  invalidate();
}

function pointBasePose(point) {
  const yaw = point.yaw || 0;
  return [...point.position, 0, 0, Math.sin(yaw / 2), Math.cos(yaw / 2)];
}

function applyJoints(a, b = a, alpha = 0) {
  for (const binding of state.bindings) {
    const first = a?.[binding.index] ?? 0;
    const second = b?.[binding.index] ?? first;
    const value = first + (second - first) * alpha;
    if (binding.type === 'prismatic') {
      binding.object.position.copy(binding.restPosition).addScaledVector(binding.parentAxis, value);
    } else {
      binding.object.quaternion.copy(binding.restQuaternion).multiply(tmpQuaternion.setFromAxisAngle(binding.axis, value));
    }
  }
  invalidate();
}

function resetPose() {
  if (!state.point || !state.manifest) return;
  setPose(robotRoot, pointBasePose(state.point));
  applyJoints(state.manifest.robot.initialJoints || []);
  setPose(objectRoot, state.manifest.object.initialPose);
  eeAxes.visible = false;
  witnessAxes.visible = false;
  requestedAxes.visible = false;
}

function makeMarkers() {
  for (const point of state.manifest.points) {
    const group = new THREE.Group();
    group.position.set(...point.position);
    group.position.z += 0.018;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.174, 56), new THREE.MeshBasicMaterial({ color: 0x658ba2, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false }));
    const hit = new THREE.Mesh(new THREE.CircleGeometry(0.172, 48), new THREE.MeshBasicMaterial({ color: 0x739db3, side: THREE.DoubleSide, transparent: true, opacity: 0.1, depthWrite: false }));
    hit.userData.point = point;
    const direction = new THREE.ArrowHelper(new THREE.Vector3(Math.cos(point.yaw || 0), Math.sin(point.yaw || 0), 0), new THREE.Vector3(0, 0, 0.006), 0.25, 0x658ba2, 0.065, 0.04);
    group.add(ring, hit, direction);
    markerGroup.add(group);
    const label = node('button', 'scene-point-label');
    label.type = 'button';
    label.dataset.pointId = point.id;
    label.setAttribute('aria-label', `Pose ${point.id}, ${pointLabel(point)}`);
    label.setAttribute('aria-pressed', 'false');
    label.append(node('span', 'label-letter', point.id));
    const result = statistics(point);
    label.append(node('span', '', percentage(result.successes, result.attempts)));
    label.addEventListener('click', () => selectPoint(point));
    $('scene-labels').append(label);
    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    leader.setAttribute('visibility', 'hidden');
    $('label-leaders').append(leader);
    state.markers.push({ point, group, ring, hit, direction, label, leader });
  }
}

function renderPointList() {
  $('point-list').replaceChildren();
  for (const point of state.manifest.points) {
    const result = statistics(point);
    const button = node('button', 'point-button');
    button.type = 'button';
    button.dataset.pointId = point.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Pose ${point.id}, ${pointLabel(point)}, ${result.successes} of ${result.attempts} successful`);
    button.append(node('span', 'point-letter', point.id));
    const body = node('span', 'point-body');
    body.append(node('span', 'point-label', pointLabel(point)));
    const outcome = node('span', 'point-result');
    const rate = node('span', 'point-percent', percentage(result.successes, result.attempts));
    rate.style.color = result.successes ? 'var(--teal)' : 'var(--failure)';
    outcome.append(rate, node('span', 'point-fraction', `${result.successes} / ${result.attempts}`));
    body.append(outcome, node('span', 'point-kind-note', kindLabels[point.kind] || point.kind || "Experimental stops"));
    button.append(body);
    button.addEventListener('click', () => selectPoint(point));
    $('point-list').append(button);
  }
}

function renderReplayChoices(point) {
  const select = $('replay-choice');
  select.replaceChildren();
  for (const trial of point.trials.filter(t => t.file)) {
    const option = document.createElement('option');
    option.value = trial.id;
    option.textContent = `${trial.label || trial.id} · ${outcomeLabel(trial)}`;
    select.append(option);
  }
  select.disabled = !select.options.length;
  $('replay-choice-label').hidden = !select.options.length;
}

function renderTrialList() {
  $('trial-list').replaceChildren();
  $('status-counts').replaceChildren();
  $('trial-count').textContent = `${state.point.trials.length} attempts`;
  const categories = new Map();
  for (const trial of state.point.trials) {
    const category = trial.status === 'success' ? 'Success' : isWam() ? trial.status === 'unknown' ? 'Unknown' : 'Failed' : failureCase(trial) ? `Case ${failureCase(trial)}` : 'Unclassified';
    categories.set(category, (categories.get(category) || 0) + 1);
  }
  for (const [label, count] of categories) {
    const item = node('span', 'status-count', `${label} ${count}`);
    $('status-counts').append(item);
  }
  if (!state.point.trials.length) $('trial-list').append(node('p', 'empty-copy', "There are no attempts recorded for this stop and the success rate cannot be calculated."));
  for (const trial of state.point.trials) {
    const entry = node('div', 'trial-entry');
    const choice = node('label', 'trial-choice');
    const checkbox = node('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.comparisonTrial = trial.id;
    checkbox.setAttribute('aria-label', `Compare${trial.label || trial.id}`);
    checkbox.disabled = true;
    checkbox.addEventListener('change', () => toggleComparisonTrial(trial.id, checkbox.checked));
    choice.append(checkbox);
    const button = node('button', 'trial-button');
    button.type = 'button';
    button.dataset.trialId = trial.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${trial.label || trial.id}，${outcomeLabel(trial)}。${trial.reason || ''}`);
    const row = node('span', 'trial-row');
    const color = node('span', 'trial-color');
    color.dataset.trialColor = trial.id;
    color.style.background = trialColor(state.point, trial);
    const group = node('span', 'trial-label-group');
    const recordingLabel = trial.file ? "Playback Sample" : trial.replayAvailability === 'summary_only' ? "Numeric value only" : "Not executed";
    group.append(node('span', 'trial-label', trial.label || trial.grasp || trial.id), node('span', 'trial-id', `Seeds${trial.seed ?? "not recorded"} · ${trial.sourceRawId || trial.id} · ${recordingLabel}`));
    row.append(color, group, node('span', `trial-status ${outcomeCode(trial)}`, outcomeLabel(trial)));
    button.append(row);
    button.addEventListener('click', () => {
      if (trial.file) openPhysicalCase(state.point, trial);
      else {
        if (trial.replayAvailability === 'summary_only') setViewMode('single');
        selectTrial(trial);
      }
      $('trial-details').open = true;
    });
    entry.append(choice, button);
    $('trial-list').append(entry);
  }
}

function updateSelectionButtons() {
  for (const button of $('point-list').querySelectorAll('button[data-point-id]')) {
    button.setAttribute('aria-pressed', String(button.dataset.pointId === state.point?.id));
  }
  for (const marker of state.markers) {
    const selected = marker.point.id === state.point?.id;
    marker.label.setAttribute('aria-pressed', String(selected));
    marker.ring.material.color.set(selected ? '#087e83' : '#6a8fa4');
    marker.hit.material.color.set(selected ? '#087e83' : '#739db3');
    marker.hit.material.opacity = selected ? 0.22 : 0.08;
    marker.direction.setColor(selected ? '#087e83' : '#6a8fa4');
  }
  for (const button of $('trial-list').querySelectorAll('button[data-trial-id]')) {
    button.setAttribute('aria-pressed', String(!state.diagnosticMode && button.dataset.trialId === state.trial?.id));
  }
  refreshPaths();
}

function disposePaths() {
  for (const path of state.paths) {
    path.mesh.geometry.dispose();
    path.mesh.material.dispose();
    path.highlight.geometry.dispose();
    path.highlight.material.dispose();
  }
  pathGroup.clear();
  state.paths = [];
}

function refreshPaths() {
  if (pathGroup) pathGroup.visible = !comparisonActive() && !state.diagnosticMode;
  const showAll = $('show-paths').checked;
  for (const path of state.paths) {
    const selected = path.trial.id === state.trial?.id;
    path.mesh.visible = showAll || selected;
    path.highlight.visible = selected;
    path.mesh.material.opacity = selected ? 0.95 : 0.48;
    path.mesh.material.depthTest = !selected;
    path.mesh.renderOrder = selected ? 3 : 1;
  }
  invalidate();
}

function buildPath(point, trial, trajectory) {
  if (!trajectory.ee || trajectory.ee.length < 2) return;
  const samples = [];
  const stride = Math.max(1, Math.ceil(trajectory.ee.length / 320));
  let previous = null;
  for (let index = 0; index < trajectory.ee.length; index += stride) {
    const pose = trajectory.ee[index];
    const sample = new THREE.Vector3(pose[0], pose[1], pose[2]);
    if (!previous || sample.distanceToSquared(previous) > 1e-10) { samples.push(sample); previous = sample; }
  }
  const last = trajectory.ee[trajectory.ee.length - 1];
  const finalPoint = new THREE.Vector3(last[0], last[1], last[2]);
  if (previous && finalPoint.distanceToSquared(previous) > 1e-10) samples.push(finalPoint);
  if (samples.length < 2) return;
  // Straight segments preserve recorded samples without smoothing overshoot.
  const curve = new THREE.CurvePath();
  for (let index = 1; index < samples.length; index++) curve.add(new THREE.LineCurve3(samples[index - 1], samples[index]));
  const color = trialColor(point, trial);
  const segments = Math.max(24, Math.min(700, samples.length * 2));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, 0.0022, 5, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48, depthWrite: false }));
  const highlight = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, 0.0048, 6, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
  mesh.userData.trial = trial;
  highlight.renderOrder = 4;
  highlight.visible = false;
  pathGroup.add(mesh, highlight);
  state.paths.push({ trial, mesh, highlight });
  invalidate();
}

function comparisonActive() { return state.viewMode === 'comparison' && !state.diagnosticMode && !state.reachabilityMode; }
function physicsActive() { return state.viewMode === 'single' && !state.diagnosticMode && !state.reachabilityMode && Boolean(state.physics); }
function dPoseActive() { return state.diagnosticMode && Boolean(state.point?.diagnostics?.positionIK); }
function isReachabilityPoint(point = state.point) { return originalDex() && Boolean(state.reachabilityVisual) && point?.id === state.reachabilityPointId; }

function updateAnalysisLayout() {
  const panel = state.reachabilityMode ? $('reachability-lens') : dPoseActive() ? $('d-pose-lens') : physicsActive() ? $('physics-lens') : comparisonActive() ? $('diversity-lens') : null;
  const app = document.querySelector('.app');
  app.classList.toggle('has-analysis', Boolean(panel));
  app.style.setProperty('--analysis-height', `${panel?.getBoundingClientRect().height || 0}px`);
  invalidate();
}

function physicsSVG(tag, attributes = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderDPoseComparison(witness) {
  const host = $('d-orientation-chart'); host.replaceChildren();
  const copy = positionIKCopy(witness);
  const svg = physicsSVG('svg', { viewBox: '0 0 600 132', role: 'img', 'aria-label': `Position solution and palm coordinate frame for required gripping position, 3-dimensional rotation difference${formatNumber(witness.orientationErrorDeg, 1)}degrees` });
  svg.append(physicsSVG('title', {}, `The two coordinate frames use the same observation direction, respectively from the recorded world quaternion; position error${formatPositionError(witness.positionErrorM)}。`));
  const colors = ['#c94747', '#39804c', '#367db3'];
  const names = ['X', 'Y', 'Z'];
  for (const [pose, center, title, dashed] of [[witness.eePose, 132, "Position solution", false], [witness.requestedGraspPose, 468, copy.requested, true]]) {
    const rotation = new THREE.Quaternion(...pose.slice(3)).normalize();
    svg.append(physicsSVG('text', { x: center, y: 16, 'text-anchor': 'middle', class: 'pose-frame-title' }, title));
    for (let axis = 0; axis < 3; axis++) {
      const direction = new THREE.Vector3().setComponent(axis, 1).applyQuaternion(rotation);
      // Common orthographic isometric projection; only orientation is displayed here.
      const dx = (direction.x - direction.y) / Math.SQRT2 * 43;
      const dy = -(direction.x + direction.y) / Math.sqrt(6) * 43 - direction.z * Math.sqrt(2 / 3) * 43;
      const endX = center + dx, endY = 77 + dy;
      const length = Math.hypot(dx, dy);
      svg.append(physicsSVG('line', { x1: center, y1: 77, x2: endX, y2: endY, stroke: colors[axis], 'stroke-width': 2.5,
        ...(dashed ? { 'stroke-dasharray': '4 3' } : {}) }));
      if (length > 0.5) {
        const ux = dx / length, uy = dy / length;
        svg.append(physicsSVG('path', { d: `M${endX},${endY} L${endX - ux * 7 - uy * 3},${endY - uy * 7 + ux * 3} L${endX - ux * 7 + uy * 3},${endY - uy * 7 - ux * 3} Z`, fill: colors[axis] }));
        svg.append(physicsSVG('text', { x: endX + ux * 9, y: endY + uy * 9 + 3, 'text-anchor': 'middle', fill: colors[axis] }, names[axis]));
      }
    }
    svg.append(physicsSVG('circle', { cx: center, cy: 77, r: 3.2, fill: '#315970' }));
  }
  svg.append(physicsSVG('text', { x: 300, y: 50, 'text-anchor': 'middle', class: 'pose-angle-label' }, "Three-dimensional rotation difference"));
  svg.append(physicsSVG('text', { x: 300, y: 82, 'text-anchor': 'middle', class: 'pose-angle-value' }, `${witness.orientationErrorDeg.toFixed(1)}°`));
  svg.append(physicsSVG('text', { x: 300, y: 109, 'text-anchor': 'middle', class: 'pose-angle-label' }, `Position error${formatPositionError(witness.positionErrorM)}`));
  host.append(svg);
  $('d-pose-heading').textContent = `${state.point.id} · Position vs. required orientation`;
  $('d-pose-explanation').textContent = `Left: position solution. Right: required pre-grasp pose. Position error ${formatPositionError(witness.positionErrorM)}; orientation difference ${formatNumber(witness.orientationErrorDeg, 1)}°. The witness was not executed.`;
  $('d-failure-heading').textContent = `${state.point.id} · Case 3: pose constraints`;
  const rejected = state.point.trials.filter((trial) => outcomeCode(trial) === 'ik_failed' || outcomeCode(trial) === 'prescreen_ik_failed').length;
  $('d-failure-summary').textContent = `${rejected} of ${state.point.trials.length} pre-grasp IK attempts failed. This static witness is not an executed attempt.`;
}

function pairedTrial(point = state.point, trial = state.trial) {
  if (!originalDex()) return null;
  const other = state.manifest?.points.find((candidate) => candidate.id === (point?.id === 'B' ? 'A' : 'B'));
  if (!['A', 'B'].includes(point?.id) || !trial || trial.grasp === undefined || trial.seed === undefined) return null;
  const paired = other?.trials.find((candidate) => candidate.file && candidate.grasp === trial.grasp && candidate.seed === trial.seed);
  return paired ? { point: other, trial: paired } : null;
}

async function openPhysicalCase(point, trial) {
  const pointLoad = state.point !== point ? selectPoint(point) : null;
  // selectPoint synchronously installs its initial trial before waiting for IO.
  const pointToken = state.pointToken, expectedTrialToken = state.trialToken;
  if (pointLoad) await pointLoad;
  if (state.point !== point || state.pointToken !== pointToken || state.trialToken !== expectedTrialToken) return;
  setViewMode('single');
  const trialLoad = selectTrial(trial), selectedTrialToken = state.trialToken;
  await trialLoad;
  if (state.point !== point || state.pointToken !== pointToken || state.trialToken !== selectedTrialToken
    || state.trial !== trial || !state.physics) return;
  const index = state.physics.firstContactIndex;
  applyTime(index === null ? state.duration : state.physics.samples[index].timeS);
  focusTarget();
  if (window.matchMedia('(max-width:950px)').matches) $('viewer').scrollIntoView({ block: 'start', behavior: 'instant' });
}

function renderFailureCases(trajectories = new Map()) {
  const container = $('failure-case-list'); container.replaceChildren();
  const measured = (state.point?.trials || []).filter((trial) => analyzePhysics(trajectories.get(trial.id)));
  state.failureCases = selectFailureCases(measured, state.point?.failureCaseIds);
  $('failure-cases').hidden = !state.failureCases.length;
  container.disabled = !state.failureCases.length;
  if (!state.failureCases.length) return;
  $('failure-cases-heading').textContent = `${state.point.id} · Failed attempts`;
  $('failure-case-intro').textContent = `${state.failureCases.length} recorded failures.`;
  $('failure-case-footnote').hidden = !state.failureCases.some((trial) => pairedTrial(state.point, trial));
  const placeholder = node('option', '', "Select a failure"); placeholder.value = ''; container.append(placeholder);
  for (const trial of state.failureCases) {
    const id = trial.sourceRawId || trial.id;
    const option = node('option', '', `${trial.label} · ${outcomeLabel(trial)}`); option.value = id;
    container.append(option);
  }
  if (state.failureCases.includes(state.trial)) container.value = state.trial.sourceRawId || state.trial.id;
}

function renderPhysicsPanel() {
  state.physicsPlot = null;
  const host = $('physics-chart'); host.replaceChildren();
  const analysis = state.physics;
  if (!analysis || !state.trial) return;
  $('physics-heading').textContent = `${state.trial.label} · Execution metrics`;
  $('physics-result').textContent = outcomeLabel(state.trial);
  const code = outcomeCode(state.trial), evidenceCode = state.trial.outcome?.evidenceCode;
  const failureCopy = code === 'lift_ik_failed'
    ? "The lift posture IK did not find a qualified solution and did not enter the successful lift path."
    : code === 'lift_plan_failed'
    ? "Successful lift plans were not generated; no further breakdown of internal planning reasons was documented."
    : "It was determined that the original observation time was used, and the A/B position was fixed against the candidate and the test seed.";
  const contactCopy = analysis.firstContactIndex === null ? "No hand contact recorded" : "Contact recorded";
  $('physics-explanation').textContent = `${contactCopy}. Maximum table clearance: ${formatNumber(analysis.maxGapM * 1000, 3)} mm; final valid hold: ${formatNumber(analysis.terminalHoldS, 3)} s. ${evidenceCode ? `Recorded code: ${evidenceCode}. ` : ''}${failureCopy}`;
  $('physics-first-contact').disabled = analysis.firstContactIndex === null;
  const paired = pairedTrial();
  $('physics-paired').hidden = !paired;
  if (paired) $('physics-paired').textContent = `Compare matching grasp at ${paired.point.id} · ${paired.trial.status === 'success' ? "Success" : "Failure"}`;
  const firstContact = analysis.firstContactIndex === null ? analysis.durationS : analysis.samples[analysis.firstContactIndex].timeS;
  const from = $('physics-window').value === 'full' ? 0 : Math.max(0, Math.min(firstContact - 0.8, analysis.durationS - 1.2));
  const to = analysis.durationS || from + 1;
  const samples = analysis.samples.filter((sample) => sample.timeS >= from && sample.timeS <= to);
  const yMin = Math.min(-1, ...samples.map((sample) => sample.minZM * 100)) * 1.06;
  const yMax = Math.max(3.5, ...samples.map((sample) => Math.max(sample.gapM, sample.minZM) * 100)) * 1.06;
  const x = (time) => 46 + (time - from) / (to - from) * 810;
  const y = (heightCM) => 105 - (heightCM - yMin) / (yMax - yMin) * 83;
  const svg = physicsSVG('svg', { viewBox: '0 0 900 160', role: 'img', 'aria-label': "Table clearance in real time, conservative bottle bottom clearance, 3 cm threshold and hand contact record" });
  svg.append(physicsSVG('title', {}, "The blue line is the clearance of the table body, the orange line is the conservative bottle bottom net off the table, and the dotted line is the 3 cm threshold; the green interval below indicates the original contact observation.Click on the chart to jump to the real time."));
  for (const value of [0, 3]) {
    svg.append(physicsSVG('line', { x1: 46, x2: 856, y1: y(value), y2: y(value), class: value ? 'physical-threshold' : 'physical-zero' }));
    svg.append(physicsSVG('text', { x: 37, y: y(value) + 3, 'text-anchor': 'end' }, `${value}`));
  }
  svg.append(physicsSVG('text', { x: 13, y: 14 }, 'cm'));
  for (const [key, color] of [['gapM', '#007ac2'], ['minZM', '#cd6731']]) {
    const d = samples.map((sample, index) => `${index ? 'L' : 'M'}${x(sample.timeS).toFixed(2)},${y(sample[key] * 100).toFixed(2)}`).join(' ');
    svg.append(physicsSVG('path', { d, stroke: color, 'stroke-width': 1.8, fill: 'none' }));
  }
  svg.append(physicsSVG('rect', { x: 46, y: 119, width: 810, height: 8, fill: '#e2e9ee' }));
  let run = null;
  const closeRun = (end) => {
    if (run === null) return;
    svg.append(physicsSVG('rect', { x: x(run), y: 119, width: Math.max(1.5, x(end) - x(run)), height: 8, fill: '#078a85' }));
    run = null;
  };
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (i && sample.timeS - samples[i - 1].timeS > 0.020001) closeRun(samples[i - 1].timeS);
    if (sample.contact && run === null) run = sample.timeS;
    if (!sample.contact) closeRun(samples[Math.max(0, i - 1)].timeS);
  }
  closeRun(samples.at(-1)?.timeS ?? to);
  svg.append(physicsSVG('text', { x: 37, y: 127, 'text-anchor': 'end' }, "Contact"));
  for (let i = 0; i <= 4; i++) {
    const time = from + (to - from) * i / 4;
    svg.append(physicsSVG('text', { x: x(time), y: 146, 'text-anchor': 'middle' }, `${formatNumber(time, 1)} s`));
  }
  const cursor = physicsSVG('line', { y1: 18, y2: 132, stroke: '#294e67', 'stroke-dasharray': '3 3' });
  svg.append(cursor);
  const hit = physicsSVG('rect', { x: 46, y: 16, width: 810, height: 116, fill: 'transparent', class: 'plot-hit' });
  hit.addEventListener('click', (event) => {
    const rect = svg.getBoundingClientRect();
    const fraction = ((event.clientX - rect.left) / rect.width * 900 - 46) / 810;
    setPlaying(false); applyTime(from + THREE.MathUtils.clamp(fraction, 0, 1) * (to - from));
  });
  svg.append(hit); host.append(svg);
  state.physicsPlot = { cursor, from, to, x };
  updatePhysicsReadings();
}

function updatePhysicsReadings() {
  const sample = physicsFrameAt(state.physics, state.time);
  if (!sample) return;
  const readings = [
    ['physics-contact', sample.contact ? "Has Contact" : "No Contact", sample.contact],
    ['physics-gap', `${formatNumber(sample.gapM * 1000, 2)} mm`, sample.gapM >= 0.03],
    ['physics-min-z', `${formatNumber(sample.minZM * 1000, 2)} mm`, sample.minZM >= 0.03],
    ['physics-hold', `${formatNumber(sample.holdS, 3)} s`, sample.holdS >= 0.2],
  ];
  for (const [id, text, passed] of readings) { $(id).textContent = text; $(id).classList.toggle('is-qualified', passed); }
  const plot = state.physicsPlot;
  if (plot) {
    const location = plot.x(THREE.MathUtils.clamp(state.time, plot.from, plot.to));
    plot.cursor.setAttribute('x1', location); plot.cursor.setAttribute('x2', location);
    plot.cursor.setAttribute('visibility', state.time < plot.from || state.time > plot.to ? 'hidden' : 'visible');
  }
}

function initializeReachability() {
  const raw = state.experiment?.distanceReachProof;
  const point = state.manifest.points.find((entry) => entry.id === String(raw?.evidence?.point || 'C'));
  if (!raw?.evidence || !point) return;
  try {
    state.reachabilityProof = computeReachabilityProof(raw, state.experiment.worldFromSource);
  } catch (error) {
    notice(`Distance evidence failed to show:${errorMessage(error)}The rest of the real records can still be viewed.`);
    return;
  }
  state.reachabilityPointId = point.id;
  const metadata = readPrescreenMetadata(state.prescreen, point);
  state.reachabilityAudit = metadata;
  const proof = state.reachabilityProof;
  state.reachabilityVisual = createReachabilityVisual(proof);
  state.reachabilityVisual.group.visible = false; scene.add(state.reachabilityVisual.group);
  const anchors = state.reachabilityVisual.anchors;
  const labels = [
    [`Arm bound · ${formatNumber(proof.armRadiusM, 3)} m`, anchors.anchor.clone().add(new THREE.Vector3(0, 0, proof.armRadiusM)), 'arm'],
    [`Object bound · ${formatNumber(proof.objectRadiusM, 3)} m`, anchors.objectCenter.clone().add(new THREE.Vector3(0, 0, proof.objectRadiusM)), 'object'],
    [`Gap ≥ ${proof.separationLowerBoundM.toFixed(2)} m`, anchors.armBoundary.clone().add(anchors.objectBoundary).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 0.24)), 'gap'],
  ];
  for (const [text, position, kind] of labels) {
    const element = node('span', `reach-label reach-label-${kind}`, text);
    $('reach-labels').append(element); state.reachLabels.push({ element, position });
  }
  $('reach-arm-radius').textContent = `${formatNumber(proof.armRadiusM, 3)} m`;
  $('reach-object-radius').textContent = `${formatNumber(proof.objectRadiusM, 3)} m`;
  $('reach-gap').textContent = `≈${proof.separationLowerBoundM.toFixed(2)} m`;
  $('c-failure-gap').textContent = `${proof.separationLowerBoundM.toFixed(2)} m`;
  const allRejected = metadata?.allPregraspRejected;
  $('reachability-heading').textContent = `${point.id} · ${allRejected ? "Pre-grasp IK failed" : "Conservative distance bound"}`;
  $('mode-reachability').textContent = `${point.id} · Distance bound`;
  $('reachability-lens').setAttribute('aria-label', `${point.id} · Conservative distance bound`);
  $('c-failure-heading').textContent = `${point.id} · Case 3: out of reach`;
  $('c-failure-summary').textContent = allRejected
    ? `All ${point.trials.length} candidates failed pre-grasp IK; no grasp was executed.`
    : "The blue-orange ball is a conservative geometric envelope; this figure shows the independent distance boundary, and the test results are based on the actual records.";
  $('reach-flow-candidates').textContent = `${point.trials.length}`;
  $('reach-flow-usable').textContent = Number.isFinite(metadata?.counts.usable) ? `${metadata.counts.usable}` : "No pre-screening records attached";
  $('reach-flow-execution').textContent = allRejected ? "No grasp executed" : "No motion executed";
  $('c-distance-ruler-title').textContent = `Arm radius ${formatNumber(proof.armRadiusM, 3)} m, object radius ${formatNumber(proof.objectRadiusM, 3)} m, center distance ${formatNumber(proof.centerDistanceM, 3)} m; gap at least ${formatNumber(proof.separationLowerBoundM, 3)} m.`;
  $('reach-explanation').textContent = `${allRejected ? `All ${point.id} candidates failed pre-grasp IK. ` : ''}The bounding spheres enclose the arm and object. Their gap independently proves distance-based unreachability for this fixed base.`;
  $('c-distance-explanation').textContent = `Arm radius ${formatNumber(proof.armRadiusM, 3)} m; object radius ${formatNumber(proof.objectRadiusM, 3)} m; gap at least ${formatNumber(proof.separationLowerBoundM, 3)} m.`;
  // All ruler segments use the same scale as the actual enclosing sphere geometry.
  const rulerX = (distance) => 30 + distance / proof.centerDistanceM * 560;
  const armEnd = rulerX(proof.armRadiusM);
  const objectStart = rulerX(proof.centerDistanceM - proof.objectRadiusM);
  for (const [id, first, last] of [['c-ruler-arm', 30, armEnd], ['c-ruler-gap', armEnd, objectStart], ['c-ruler-object', objectStart, 590]]) {
    $(id).setAttribute('x1', first); $(id).setAttribute('x2', last);
  }
  const gapMidpoint = (armEnd + objectStart) / 2;
  $('c-ruler-gap-title').setAttribute('x', gapMidpoint);
  $('reach-gap').setAttribute('x', gapMidpoint);
  $('reach-equation').textContent = `Center distance ${proof.centerDistanceM.toFixed(4)} − arm radius ${proof.armRadiusM.toFixed(4)} − object radius ${proof.objectRadiusM.toFixed(4)} = gap ≥ ${proof.separationLowerBoundM.toFixed(4)} m`;
  if (!metadata) return;
  const { counts, example, candidateCount, probeCount, angles, lanes, actualGammaDeg } = metadata;
  $('c-prescreen-heading').textContent = `${point.id} · Prescreen`;
  $('c-prescreen-summary').textContent = `${candidateCount} candidates${probeCount ? `; ${probeCount} tested object orientations per candidate` : ''}. ${allRejected ? 'No pre-grasp IK solution was found; no grasp was executed.' : 'See individual outcomes below.'}`;
  const reference = referenceReachabilityAnchor(proof, raw, state.experiment.worldFromSource, state.manifest.points);
  const referenceId = raw.evidence.reference_point || 'A';
  $('c-example-reference-heading').textContent = `${referenceId}`;
  $('c-example-target-heading').textContent = `${point.id}`;
  $('c-example-reference-heading').hidden = !reference;
  $('c-example-a-distance').hidden = !reference;
  if (reference) {
    const distance = Math.hypot(...reference.anchor.map((value, i) => value - proof.objectCenter[i]));
    $('c-example-a-distance').textContent = `Approx.${distance.toFixed(2)} m`;
  }
  $('c-example-c-distance').textContent = `Approx.${proof.centerDistanceM.toFixed(2)} m`;
  const exampleLabel = Number.isSafeInteger(example?.index) ? `Candidate ${String(example.index + 1).padStart(2, '0')}` : "Current Audit Candidate";
  $('c-example-name').hidden = !example;
  $('c-example-name').textContent = example ? `Example: ${exampleLabel}${example.seed !== undefined ? `, seed ${example.seed}` : ''}.` : '';
  const exampleCandidate = example?.candidateName ?? example?.candidate;
  const findExample = (id) => state.manifest.points.find((entry) => entry.id === id)?.trials.find((trial) =>
    exampleCandidate && trial.grasp === exampleCandidate && trial.seed === example.seed);
  const referenceTrial = findExample(referenceId), targetTrial = findExample(point.id);
  $('c-example-results').hidden = !reference || !referenceTrial || !targetTrial;
  $('c-example-reference-result').textContent = referenceTrial ? outcomeLabel(referenceTrial) : '';
  $('c-example-target-result').textContent = targetTrial ? outcomeLabel(targetTrial) : '';
  const details = [];
  if (angles.length) details.push(`${angles.length}hypothetical objects oriented to${angles.join('、')}°. These are hypothetical pose detections and are not independent physical retries.`);
  if (actualGammaDeg !== null) details.push(`The formal initial state orientation is${actualGammaDeg.toFixed(2)}°。`);
  const targetDistance = example?.gamma0Comparison?.[point.id]?.anchorToPregraspPalmM;
  const referenceDistance = example?.gamma0Comparison?.[referenceId]?.anchorToPregraspPalmM;
  if (Number.isFinite(targetDistance)) details.push(`${exampleLabel}Pre-grip palm target at γ = 0° from arm pedestal:${point.id}Approx.${targetDistance.toFixed(2)} m${Number.isFinite(referenceDistance) ? `，${referenceId}Approx.${referenceDistance.toFixed(2)} m` : ''}; Comparing only the target distance does not assume that a successful solution exists for that direction.`);
  $('c-probe-description').textContent = details.join('');
  $('c-probe-description').hidden = !details.length;
  const countCopy = (values) => [["Pre-grasp IK rejected", 'pregrasp_ik'], ["Exit Direction", 'retreat_direction'], ["Hand approach direction", 'web_direction'], ["Robot collision", 'robot_collision'], ["Lift IK", 'lift_ik'], ["Valid candidates", 'usable'], ["IK Query", 'ik_tests']]
    .map(([label, key]) => `${label} ${formatNumber(values[key], 0)}`).join('；');
  $('c-native-summary').textContent = metadata.sameLaneCounts
    ? `Native logs (same for each process):${countCopy(counts)}。`
    : lanes.map((lane, index) => `${lane.lane || `Process${index + 1}`}：${countCopy(lane.counts)}。`).join(' ');
  $('c-lane-description').textContent = `${lanes.length}work process logs${metadata.sameLaneCounts ? `, per record${formatNumber(counts.ik_tests, 0)}Number of IK queries` : ", counts are listed above"}. These internal probes do not add independent grab trials;${point.id}The formal denominator of the dot is${candidateCount}。`;
}

function focusReachability() {
  if (!state.reachabilityMode || !state.reachabilityVisual || !camera) return;
  const bounds = state.reachabilityVisual.bounds.clone().union(new THREE.Box3().setFromObject(robotRoot));
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const halfFov = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  const distance = sphere.radius / Math.sin(halfFov) * 1.12;
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(-0.3, -1, 0.5).normalize(), distance);
  controls.update(); invalidate();
}

function enterReachability() {
  if (!isReachabilityPoint()) return;
  leavePositionIK(); setPlaying(false); state.comparison.playing = false;
  state.reachabilityMode = true; resetPose(); updateModeUI(); updateTimeline(); focusReachability();
  announce(`${state.point.id}Point static distance evidence: shows conservative geometric envelope and spacing, and the evidence calculation is performed using 0 steps physics.`);
}

function disposeComparisonVisuals() {
  if (comparisonGroup) {
    comparisonGroup.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    });
    comparisonGroup.clear();
  }
  state.comparison.visuals = [];
}

// Each ring is centred on an unmodified recorded/FK waypoint. No smoothing or offsets.
function comparisonTube(poses, radius) {
  const points = [];
  for (const pose of poses) {
    const point = new THREE.Vector3(...pose.slice(0, 3));
    if (!points.length || point.distanceToSquared(points[points.length - 1]) > 1e-16) points.push(point);
  }
  if (points.length < 2) return null;
  const sides = 8;
  const vertices = [], normals = [], indices = [];
  const tangent = new THREE.Vector3(), radial = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < points.length; i++) {
    tangent.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(0, i - 1)]).normalize();
    if (tangent.lengthSq() < 0.5) tangent.subVectors(points[i], points[i - 1] || points[i + 1]).normalize();
    rotation.setFromUnitVectors(up, tangent);
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      radial.set(Math.cos(angle), Math.sin(angle), 0).applyQuaternion(rotation);
      vertices.push(points[i].x + radial.x * radius, points[i].y + radial.y * radius, points[i].z + radial.z * radius);
      normals.push(radial.x, radial.y, radial.z);
      if (i < points.length - 1) {
        const a = i * sides + side, b = i * sides + (side + 1) % sides;
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function selectedComparisonEntries() {
  const byId = new Map(state.comparison.entries.map((entry) => [entry.id, entry]));
  return state.comparison.selectedIds.map((id) => byId.get(id)).filter(Boolean);
}

function assignComparisonColors() {
  const comparison = state.comparison;
  const used = new Set();
  const colors = new Map();
  for (const id of comparison.selectedIds) {
    const old = comparison.colors.get(id);
    if (old && !used.has(old)) { colors.set(id, old); used.add(old); }
  }
  for (const id of comparison.selectedIds) {
    if (!colors.has(id)) {
      const color = comparisonPalette.find((item) => !used.has(item));
      colors.set(id, color); used.add(color);
    }
  }
  comparison.colors = colors;
}

function rebuildComparisonVisuals() {
  disposeComparisonVisuals();
  assignComparisonColors();
  if ($('compare-context').checked) {
    const selectedIds = new Set(state.comparison.selectedIds);
    for (const entry of state.comparison.entries) {
      if (selectedIds.has(entry.id)) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints(entry.path.poses.map((pose) => new THREE.Vector3(...pose.slice(0, 3))));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#587e93', transparent: true, opacity: 0.24, depthTest: false, depthWrite: false }));
      line.renderOrder = 9;
      comparisonGroup.add(line);
    }
  }
  for (const entry of selectedComparisonEntries()) {
    const color = state.comparison.colors.get(entry.id);
    const group = new THREE.Group();
    const outlineGeometry = comparisonTube(entry.path.poses, 0.0037);
    const foregroundGeometry = comparisonTube(entry.path.poses, 0.00235);
    if (outlineGeometry && foregroundGeometry) {
      const outline = new THREE.Mesh(outlineGeometry, new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false }));
      const foreground = new THREE.Mesh(foregroundGeometry, new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }));
      outline.renderOrder = 11; foreground.renderOrder = 12;
      group.add(outline, foreground);
    }
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 14, 10), new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }));
    marker.renderOrder = 16;
    const axes = new THREE.AxesHelper(0.038);
    axes.material.depthTest = false; axes.material.depthWrite = false; axes.renderOrder = 17;
    const skeleton = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
    skeleton.renderOrder = 8;
    group.add(marker, axes, skeleton);
    const start = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false }));
    start.position.set(...entry.path.poses[0].slice(0, 3)); start.renderOrder = 15;
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 10, 8), new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }));
    end.position.set(...entry.path.poses.at(-1).slice(0, 3)); end.renderOrder = 15;
    group.add(start, end);
    comparisonGroup.add(group);
    state.comparison.visuals.push({ entry, color, marker, axes, skeleton });
  }
  renderComparisonSummary();
  updateComparisonSelectionUI();
  applyComparisonProgress(state.comparison.progress);
  updateModeUI();
  invalidate();
}

function refreshComparisonData(autoSelect = true) {
  const comparison = state.comparison;
  comparison.entries = [];
  for (const candidate of comparison.candidates) {
    try {
      const path = state.comparisonModel?.path(candidate.trajectory, comparison.source);
      if (path) comparison.entries.push({ id: candidate.trial.id, trial: candidate.trial, trajectory: candidate.trajectory, path });
    } catch (error) {
      state.loadErrors.set(`${trialKey(state.point, candidate.trial)}/${comparison.source}`, errorMessage(error));
    }
  }
  if (autoSelect) {
    comparison.selectedIds = selectDiverseEntries(comparison.entries, 6);
    comparison.colors = new Map();
  } else {
    const available = new Set(comparison.entries.map((entry) => entry.id));
    comparison.selectedIds = comparison.selectedIds.filter((id) => available.has(id)).slice(0, 6);
  }
  comparison.allAnalysis = analyzeComparisonPaths(comparison.entries.map((entry) => entry.path));
  rebuildComparisonVisuals();
}

function toggleComparisonTrial(id, selected) {
  if (!state.comparison.entries.some((entry) => entry.id === id)) return;
  const comparison = state.comparison;
  if (selected && !comparison.selectedIds.includes(id)) {
    if (comparison.selectedIds.length >= 6) {
      $('comparison-status').textContent = "At most six paths can be compared.";
      updateComparisonSelectionUI();
      announce("At most six paths can be compared.");
      return;
    }
    comparison.selectedIds.push(id);
  } else if (!selected) comparison.selectedIds = comparison.selectedIds.filter((item) => item !== id);
  comparison.playing = false;
  rebuildComparisonVisuals();
}

function updateComparisonSelectionUI() {
  const entries = new Set(state.comparison.entries.map((entry) => entry.id));
  for (const checkbox of $('trial-list').querySelectorAll('input[data-comparison-trial]')) {
    const id = checkbox.dataset.comparisonTrial;
    checkbox.checked = state.comparison.selectedIds.includes(id);
    checkbox.disabled = !entries.has(id) || state.comparison.loading;
    checkbox.title = entries.has(id) ? "Toggle comparison (maximum six paths)" : "No successful paths for this source";
  }
  for (const swatch of $('trial-list').querySelectorAll('[data-trial-color]')) {
    const color = state.comparison.colors.get(swatch.dataset.trialColor);
    const trial = state.point?.trials.find((item) => item.id === swatch.dataset.trialColor);
    swatch.style.background = comparisonActive() ? (color || '#c8d5dc') : trialColor(state.point, trial);
  }
}

function renderComparisonSummary() {
  const comparison = state.comparison;
  const selected = selectedComparisonEntries();
  const planned = comparison.source === 'planned';
  comparison.analysis = analyzeComparisonPaths(selected.map((entry) => entry.path));
  $('comparison-count').textContent = `${selected.length} / 6 paths`;
  $('comparison-source').value = comparison.source;
  $('comparison-source-caption').textContent = planned ? "cuRobo lift plan" : "Recorded execution";
  $('comparison-source-note').textContent = planned
    ? "Native lift plans only; no approach or hand closure."
    : "Recorded end-effector paths include approach, hand closure, and lift; not all stages use cuRobo.";
  if (selected.length >= 2) {
    const metrics = comparisonMetrics(selected.map((entry) => entry.path));
    $('comparison-separation').textContent = `${formatNumber(metrics.maxSeparationM * 100, 2)} cm`;
    $('comparison-orientation').textContent = `${formatNumber(metrics.maxOrientationDeg, 1)}°`;
  } else {
    $('comparison-separation').textContent = '—';
    $('comparison-orientation').textContent = '—';
  }
  $('comparison-metric-note').textContent = selected.length >= 2
    ? `${selected.length} selected paths; separation is aligned by arc length, orientation is measured at the endpoint.`
    : "Select at least two paths to compute separation and orientation difference.";
  let status;
  if (comparison.loading) status = "Loading successful trajectories…";
  else if (!state.point?.trials.some((trial) => trial.status === 'success')) status = "No successful trajectories at this pose. Rejections and diagnostics are retained.";
  else if (!comparison.entries.length) status = planned ? "No lift plans available. Switch to recorded execution." : "No successful execution trajectories at this pose.";
  else if (!selected.length) status = "Select successful attempts below, or choose six diverse paths.";
  else status = `${selected.length} of ${comparison.entries.length} successful paths selected. Resampling uses recorded paths only.`;
  $('comparison-status').textContent = status;
  $('comparison-auto').disabled = comparison.loading || !comparison.entries.length;
  $('comparison-random').disabled = comparison.loading || !comparison.entries.length;
  $('comparison-peak').disabled = comparison.loading || comparison.entries.length < 2;
  $('compare-context').disabled = comparison.loading || !comparison.entries.length;
  $('comparison-total').textContent = comparison.entries.length ? `（${comparison.entries.length})` : '';
  $('comparison-clear').disabled = !selected.length;
  $('comparison-source').disabled = isWam() || comparison.loading || !state.point?.trials.some((trial) => trial.status === 'success');
  $('comparison-legend').replaceChildren();
  for (const entry of selected) {
    const label = node('span', 'legend-entry');
    label.style.setProperty('--path-color', comparison.colors.get(entry.id));
    const swatch = node('span', 'legend-swatch');
    label.append(swatch, node('span', '', entry.trial.label || entry.id));
    $('comparison-legend').append(label);
  }
  if (!selected.length) $('comparison-legend').append(node('span', 'legend-empty', comparison.loading ? "Loading Comparison Paths" : "Comparison path not shown"));
  const records = $('comparison-records'); records.replaceChildren();
  for (const entry of selected) {
    const row = node('div', 'comparison-record'); row.style.setProperty('--path-color', comparison.colors.get(entry.id));
    row.append(node('b', '', entry.trial.label || entry.id), node('span', '', `seed ${entry.trial.seed ?? '—'}`), node('span', '', `${formatNumber(entry.path.totalLengthM * 100, 2)} cm`));
    records.append(row);
  }
  renderDiversityLens({ entries: comparison.entries, selected, colors: comparison.colors, analysis: comparison.analysis,
    progress: comparison.progress, origin: state.manifest?.object.initialPose || [0, 0, 0], showContext: $('compare-context').checked,
    onSeek: (progress) => { comparison.playing = false; applyComparisonProgress(progress); } });
}

function applyComparisonProgress(progress) {
  if (!Number.isFinite(progress)) return;
  const comparison = state.comparison;
  comparison.progress = THREE.MathUtils.clamp(progress, 0, 1);
  const active = comparisonActive();
  const lensPoses = new Map();
  if (active && state.manifest?.object) {
    setPose(objectRoot, state.manifest.object.initialPose);
    eeAxes.visible = false;
  }
  for (const visual of comparison.visuals) {
    const sample = sampleComparisonPath(visual.entry.path, comparison.progress);
    if (!sample) continue;
    lensPoses.set(visual.entry.id, sample.pose);
    setPose(visual.marker, sample.pose);
    setPose(visual.axes, sample.pose);
    visual.axes.visible = $('compare-axes').checked;
    visual.skeleton.visible = $('compare-skeleton').checked;
    if (visual.skeleton.visible && sample.joints && state.comparisonModel) {
      const points = state.comparisonModel.armPoints(sample.joints, visual.entry.path.basePose);
      visual.skeleton.geometry.dispose();
      visual.skeleton.geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
    }
  }
  const available = active && comparison.visuals.length > 0;
  $('comparison-progress').disabled = !available;
  $('comparison-play').disabled = !available;
  $('comparison-reset').disabled = !available;
  $('comparison-progress').value = comparison.progress;
  const label = `${Math.round(comparison.progress * 100)}%`;
  $('comparison-progress-label').textContent = label;
  $('comparison-progress').style.setProperty('--progress', label);
  $('comparison-progress').setAttribute('aria-valuetext', `${label}, each path is normalized by arc length, asynchronous physical time`);
  $('comparison-play').textContent = comparison.playing ? "Pause progress" : "Play progress";
  $('comparison-play').setAttribute('aria-label', comparison.playing ? "Pause Comparison Progress" : "Play comparison");
  updateDiversityProgress(comparison.progress, lensPoses);
  invalidate();
}

function updateModeUI() {
  const active = comparisonActive();
  const comparisonMode = state.viewMode === 'comparison';
  const reach = state.reachabilityMode;
  const isStatic = reach || state.diagnosticMode;
  document.querySelector('.app').classList.toggle('has-diagnostic-analysis', reach || physicsActive() || dPoseActive());
  document.querySelector('.app')?.classList?.toggle('is-comparing', comparisonMode);
  document.querySelector('.app')?.classList?.toggle('has-diversity-lens', active);
  $('mode-comparison').setAttribute('aria-pressed', String(comparisonMode && !reach));
  $('mode-single').setAttribute('aria-pressed', String(!comparisonMode && !reach));
  $('mode-single').disabled = reach;
  $('mode-reachability').hidden = !isReachabilityPoint();
  $('mode-reachability').setAttribute('aria-pressed', String(reach));
  $('back-to-comparison').hidden = !state.point?.trials.some((trial) => trial.status === 'success' && trial.file) || active;
  $('comparison-tools').hidden = !active;
  $('comparison-reset-tools').hidden = !active;
  $('playback-tools').hidden = !physicsActive();
  $('c-prescreen-explanation').hidden = !isReachabilityPoint() || !state.reachabilityAudit;
  $('comparison-panel').hidden = !active;
  $('comparison-transport').hidden = !active;
  $('single-transport').hidden = active || isStatic;
  $('reachability-transport').hidden = !isStatic;
  $('static-title').textContent = reach ? `${state.point.id} · Distance bound` : `${state.point?.id || ''} · Static IK witness`;
  $('static-copy').textContent = reach ? "Static evidence · no execution" : "Static witness · no execution";
  $('comparison-context').hidden = !active;
  $('comparison-legend').hidden = !active;
  $('diversity-lens').hidden = !active;
  $('physics-lens').hidden = !physicsActive();
  $('reachability-lens').hidden = !reach;
  $('reach-labels').hidden = !reach;
  $('c-failure-callout').hidden = !reach;
  $('d-failure-callout').hidden = !dPoseActive();
  $('d-pose-lens').hidden = !dPoseActive();
  if (state.point?.diagnostics?.positionIK) $('d-orientation-gap').textContent = `${state.point.diagnostics.positionIK.orientationErrorDeg.toFixed(1)}°`;
  if (state.reachabilityVisual) state.reachabilityVisual.group.visible = reach;
  $('path-key').hidden = active || state.diagnosticMode || reach;
  $('single-paths-option').hidden = active || reach;
  $('single-axes-option').hidden = active || reach;
  $('comparison-axes-option').hidden = !active;
  $('comparison-robot-option').hidden = !active;
  $('view-target').textContent = reach ? "Distance Evidence" : active ? "Focus paths" : "Focus target";
  if (comparisonGroup) comparisonGroup.visible = active;
  if (pathGroup) pathGroup.visible = !active && !state.diagnosticMode && !reach;
  if (robotRoot) robotRoot.visible = !active || $('compare-robot').checked || (!state.comparison.entries.length && !state.comparison.loading);
  const fadeRobot = active && state.comparison.entries.length > 0;
  for (const entry of state.robotMaterials) {
    const transparent = fadeRobot ? true : entry.transparent;
    if (entry.material.transparent !== transparent) entry.material.needsUpdate = true;
    entry.material.transparent = transparent;
    entry.material.opacity = fadeRobot ? 0.14 : entry.opacity;
    entry.material.depthWrite = fadeRobot ? false : entry.depthWrite;
  }
  if (active && state.manifest) {
    setPose(objectRoot, state.manifest.object.initialPose);
    eeAxes.visible = false;
  }
  updateComparisonSelectionUI();
  updateAnalysisLayout();
  invalidate();
}

function setViewMode(mode) {
  if (!['comparison', 'single'].includes(mode)) return;
  const trialToRestore = state.diagnosticMode ? state.trial : null;
  leavePositionIK();
  state.reachabilityMode = false;
  setPlaying(false);
  state.comparison.playing = false;
  state.viewMode = mode;
  if (mode === 'comparison') ensurePointTrajectories();
  if (trialToRestore) selectTrial(trialToRestore);
  updateModeUI();
  if (comparisonActive()) {
    resetPose();
    applyComparisonProgress(state.comparison.progress);
    focusComparison();
  } else if (state.trajectory) {
    setPlaybackAvailability(Boolean(state.trajectory.joints && state.bindings.length));
    applyTime(state.time);
    ensureSelectedPointVisible();
  } else {
    resetPose();
    ensureSelectedPointVisible();
    updateTimeline();
  }
}

function focusComparison() {
  if (!state.ready || !camera || !comparisonActive()) return;
  const bounds = new THREE.Box3();
  for (const entry of selectedComparisonEntries()) {
    for (const pose of entry.path.poses) bounds.expandByPoint(new THREE.Vector3(...pose.slice(0, 3)));
  }
  bounds.union(new THREE.Box3().setFromObject(objectRoot));
  if (bounds.isEmpty()) return;
  bounds.expandByScalar(0.035);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const halfFov = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  const distance = Math.max(0.52, sphere.radius / Math.sin(halfFov) * 1.32);
  const direction = new THREE.Vector3(-0.7, -1, 0.65).normalize();
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  controls.update();
  invalidate();
}

function renderEvaluation() {
  const view = evaluationView();
  const modelButtons = document.querySelectorAll('[data-method]');
  for (const button of modelButtons) {
    button.disabled = false;
    button.setAttribute('aria-pressed', String(button.dataset.method === view.model));
  }
  const points = view.manifest.points;
  const attempts = points.reduce((total, point) => total + point.trials.length, 0);
  const replays = points.reduce((total, point) => total + point.trials.filter(trial => trial.file).length, 0);
  $('dataset-description').textContent = `${points.length} docking poses`;
  $('dataset-summary').textContent = `${attempts} attempts · ${replays} replays`;
  $('statistics-definition').textContent = view.scope === 'full' ? 'Successes / attempts.' : 'Successes / 20-record subset.';
  $('planned-source-option').disabled = $('planned-source-option').hidden = view.isWam;
  const comparison = compareEndpointRates(view.baselinePoints, view.wamPoints);
  const rows = $('evaluation-rate-rows');
  rows.replaceChildren();
  for (const pair of comparison.pairs) {
    const row = node('tr');
    const label = node('th', '', pair.id);
    label.scope = 'row';
    row.append(label);
    for (const rate of [pair.dexonomy, pair.wam]) {
      row.append(node('td', '', `${formatRate(rate)} (${rate.successes}/${rate.attempts})`));
    }
    rows.append(row);
  }
  const r = comparison.pearsonR === null ? '—' : comparison.pearsonR.toFixed(3);
  $('evaluation-metrics').textContent = `Pearson r ${r} · N = ${comparison.endpointCount}`;
}

async function switchEvaluation(model) {
  if (!state.ready || !state.evaluation) return;
  const view = state.evaluation.select(model, $('evaluation-set').value, $('evaluation-scope').value);
  const pointId = state.point?.id;
  leavePositionIK();
  state.manifest = view.manifest;
  state.comparison.source = view.isWam ? 'actual' : state.dexSource;
  for (const marker of state.markers) {
    marker.label.remove();
    marker.leader.remove();
  }
  markerGroup.traverse(object => {
    object.geometry?.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose();
  });
  markerGroup.clear();
  state.markers = [];
  renderPointList();
  makeMarkers();
  renderEvaluation();
  await selectPoint(view.manifest.points.find(point => point.id === pointId) || view.manifest.points[0]);
}

function bindEvaluation() {
  const view = evaluationView();
  for (const set of view.payload.sets) {
    const option = node('option', '', set.label);
    option.value = set.id;
    $('evaluation-set').append(option);
  }
  $('evaluation-set').value = view.setId;
  $('evaluation-scope').value = view.scope;
  const change = model => switchEvaluation(model).catch(error => notice(errorMessage(error)));
  for (const button of document.querySelectorAll('[data-method]')) {
    button.addEventListener('click', () => change(button.dataset.method));
  }
  for (const id of ['evaluation-set', 'evaluation-scope']) {
    $(id).addEventListener('change', () => change(evaluationView().model));
  }
  $('rate-comparison').hidden = false;
  renderEvaluation();
}

async function selectPoint(point) {
  leavePositionIK();
  const token = ++state.pointToken;
  state.trialToken++;
  setPlaying(false);
  state.point = point;
  state.viewMode = 'single';
  $('viewer-options').open = false;
  $('all-trials').open = false;
  $('trial-details').open = false;
  state.reachabilityMode = isReachabilityPoint(point);
  state.physics = null; state.physicsPlot = null;
  state.trial = null;
  state.trajectory = null;
  state.time = 0;
  state.duration = 0;
  state.comparison.playing = false;
  state.comparison.fetchPromise = null;
  state.comparison.candidates = [];
  state.comparison.entries = [];
  state.comparison.selectedIds = [];
  state.comparison.colors = new Map();
  state.comparison.progress = 0.55;
  state.comparison.analysis = null;
  state.comparison.allAnalysis = null;
  state.comparison.loading = point.trials.some((trial) => trial.status === 'success' && trial.file);
  disposeComparisonVisuals();
  disposePaths();
  resetPose();
  ensureSelectedPointVisible();
  notice();
  const result = statistics(point);
  $('selected-point-heading').textContent = `${point.id} · ${pointLabel(point)}`;
  $('point-kind').textContent = isWam() ? '' : kindLabels[point.kind] || 'Docking pose';
  $('point-kind').hidden = isWam();
  $('point-description').textContent = '';
  $('point-description').hidden = !$('point-description').textContent;
  $('success-rate').textContent = formatRate(rateStatistics(point.trials));
  $('success-rate').style.color = result.successes ? 'var(--teal)' : 'var(--failure)';
  $('success-fraction').textContent = `${result.successes} / ${result.attempts} attempts`;
  $('statistic-note').textContent = '';
  $('data-warning').hidden = !result.mismatch;
  $('data-warning').textContent = `Claim stats are inconsistent with the attempt list. Currently pressing${result.attempts}attempted to record recalculation, success${result.successes}times.`;
  const failuresByCode = new Map();
  for (const trial of point.trials) if (trial.status !== 'success') failuresByCode.set(outcomeLabel(trial), (failuresByCode.get(outcomeLabel(trial)) || 0) + 1);
  $('failure-summary').textContent = [...failuresByCode].map(([label, count]) => `${label}: ${count}`).join('；');
  $('failure-summary').hidden = !failuresByCode.size;
  renderPositionIKButton();
  renderFailureCases();
  renderTrialList();
  renderReplayChoices(point);
  renderComparisonSummary();
  updateModeUI();
  applyComparisonProgress(state.comparison.progress);
  updateSelectionButtons();
  const initial = preferredTrial(point);
  let initialPlayback = Promise.resolve();
  if (initial) initialPlayback = selectTrial(initial).then(() => { if (state.point === point && state.trial === initial && state.viewMode === 'single') setPlaying(true); });
  else {
    $('trial-title').textContent = "No attempts";
    $('trial-reason').textContent = "No attempts for this pose.";
    $('trial-metrics').replaceChildren();
    $('trajectory-state').textContent = "No replay";
    $('trajectory-note').textContent = '';
    setPlaybackAvailability(false);
    updateTimeline();
  }
  announce(`Pose ${point.id}: ${result.successes} successes of ${result.attempts} attempts.`);
  // Display the selected replay before warming the remaining comparison paths.
  await initialPlayback;
  await new Promise(resolve => requestAnimationFrame(resolve));
  if (token !== state.pointToken) return;
  if (state.reachabilityMode) requestAnimationFrame(focusReachability);
  if (!isWam() && point.diagnostics?.positionIK) { enterPositionIK(); focusTarget(); }
  refreshPaths();
  if (comparisonActive() || $('show-paths').checked) ensurePointTrajectories();
}

function ensurePointTrajectories() {
  if (!state.point) return Promise.resolve();
  if (!state.comparison.fetchPromise) state.comparison.fetchPromise = loadPointTrajectories(state.point, state.pointToken).catch(error => notice(errorMessage(error)));
  return state.comparison.fetchPromise;
}

async function loadPointTrajectories(point, token) {
  const recorded = point.trials.filter((trial) => trial.file);
  const results = await Promise.allSettled(recorded.map((trial) => getTrajectory(point, trial)));
  if (token !== state.pointToken) return;
  disposePaths();
  state.comparison.candidates = [];
  let failures = 0;
  results.forEach((result, index) => {
    const trial = recorded[index];
    if (result.status === 'fulfilled') {
      buildPath(point, trial, result.value);
      if (trial.status === 'success') state.comparison.candidates.push({ trial, trajectory: result.value });
    }
    else {
      failures++;
      state.loadErrors.set(trialKey(point, trial), errorMessage(result.reason));
      const button = [...$('trial-list').querySelectorAll('button')].find((item) => item.dataset.trialId === trial.id);
      if (button) button.append(node('span', 'trial-load-error', "Trajectory load failed"));
    }
  });
  state.comparison.loading = false;
  renderFailureCases(new Map(results.flatMap((result, index) => result.status === 'fulfilled' ? [[recorded[index].id, result.value]] : [])));
  refreshComparisonData();
  if (comparisonActive() && state.comparison.entries.length) focusComparison();
  if (state.reachabilityMode) requestAnimationFrame(focusReachability);
  if (!isWam() && point.diagnostics?.positionIK) { enterPositionIK(); focusTarget(); }
  refreshPaths();
  if (failures) notice(`${failures}Tracks could not be loaded.Attempt results are still displayed as originally recorded; select the corresponding attempt to view the error.`);
}

function addMetric(label, value) {
  if (value === undefined || value === null || value === '') return;
  $('trial-metrics').append(node('dt', '', label), node('dd', '', value));
}

function positionIKCopy(witness) {
  const pregrasp = witness?.targetStage === 'pregrasp';
  return {
    pregrasp,
    position: pregrasp ? "Pre-grasp position" : "position",
    requested: pregrasp ? "Required pre-grasp pose" : "Required pose",
    rotation: pregrasp ? "Pre-grasp orientation difference" : "Gripping position rotation difference",
    actual: pregrasp ? "Position IK" : "Position IK",
    heading: pregrasp ? "Pre-grasp position witness" : "Position IK witness",
    title: pregrasp ? "Pre-grasp position IK · Not executed" : "Position IK · Not executed",
  };
}

function renderPositionIKButton() {
  const witness = state.point?.diagnostics?.positionIK;
  const copy = positionIKCopy(witness);
  $('ik-diagnostic').hidden = !witness;
  $('ik-witness-button').textContent = state.diagnosticMode ? "Back to Attempted Playback" : "Position IK witness (not executed)";
  $('ik-witness-button').setAttribute('aria-pressed', String(state.diagnosticMode));
  $('ik-witness-summary').textContent = witness
    ? `${copy.pregrasp ? "The pre-grab position is reachable." : ''}${copy.position}Error${formatPositionError(witness.positionErrorM)}，${copy.rotation} ${formatNumber(witness.orientationErrorDeg, 2)}°. Static solution only, not performed.`
    : '';
}

function enterPositionIK() {
  const witness = state.point?.diagnostics?.positionIK;
  if (!witness || state.diagnosticMode) return;
  if (witness.joints.length < state.requiredDimensions) {
    notice(`Insufficient joint status for location IK witness: at least required${state.requiredDimensions}dimension.`);
    return;
  }
  const copy = positionIKCopy(witness);
  state.trialToken++;
  setPlaying(false);
  state.diagnosticMode = true;
  state.comparison.playing = false;
  renderDPoseComparison(witness);
  updateModeUI();
  state.previousAxesChecked = $('show-axes').checked;
  $('show-axes').checked = true;
  setPose(robotRoot, witness.basePose);
  applyJoints(witness.joints);
  setPose(objectRoot, state.manifest.object.initialPose);
  setPose(witnessAxes, witness.eePose);
  setPose(requestedAxes, witness.requestedGraspPose);
  witnessAxes.visible = true;
  requestedAxes.visible = true;
  eeAxes.visible = false;
  pathGroup.visible = false;
  $('path-key').hidden = true;
  $('ik-axis-key').hidden = false;
  $('ik-witness-axis-label').textContent = copy.actual;
  $('ik-requested-axis-label').textContent = copy.requested;
  $('ik-angle-label').textContent = `${copy.rotation} ${formatNumber(witness.orientationErrorDeg, 2)}°`;
  $('diagnostics-heading').textContent = copy.heading;
  $('trajectory-state').textContent = "Static IK";
  $('trial-title').textContent = copy.title;
  $('trial-reason').textContent = `End Reachable${copy.pregrasp ? "Pre-Grab Position Requested" : "Requested location"}, but with${copy.requested}Direction difference${formatNumber(witness.orientationErrorDeg, 2)}°. Solid spool display${copy.actual}Direction, dotted axis shows${copy.requested}Direction.${witness.note ? ` ${witness.note}` : ''}`;
  $('trial-metrics').replaceChildren();
  addMetric("Record Type", "Static IK, non-execution records");
  addMetric(`${copy.position}error`, formatPositionError(witness.positionErrorM));
  addMetric(copy.rotation, `${formatNumber(witness.orientationErrorDeg, 2)}°`);
  if (witness.targetStage) addMetric("Target Stage", copy.pregrasp ? "Pregrasp" : witness.targetStage);
  addMetric("Candidate Target", witness.candidateName);
  addMetric("Crash Inspection", "No collision (solved state)");
  addMetric("Physical Execution", "Not executed");
  $('trajectory-note').textContent = `${copy.pregrasp ? "This static witness establishes a position solution only. " : ''}The joint state is static; no motion was executed and the object remains at its initial pose. This witness is not an attempt and does not change the success rate.`;
  setPlaybackAvailability(false);
  updateTimeline();
  renderPositionIKButton();
  updateSelectionButtons();
  updateProvenance();
  notice();
  announce(`${copy.heading}, Static IK not performed.${copy.position}Error${formatPositionError(witness.positionErrorM)}，${copy.rotation} ${formatNumber(witness.orientationErrorDeg, 2)}degrees.`);
  invalidate();
}

function leavePositionIK() {
  if (!state.diagnosticMode) return;
  state.diagnosticMode = false;
  if (state.previousAxesChecked !== null) $('show-axes').checked = state.previousAxesChecked;
  state.previousAxesChecked = null;
  witnessAxes.visible = false;
  requestedAxes.visible = false;
  pathGroup.visible = true;
  $('path-key').hidden = false;
  $('ik-axis-key').hidden = true;
  $('diagnostics-heading').textContent = "Selected attempt";
  renderPositionIKButton();
  updateModeUI();
  invalidate();
}

function renderMetrics(trial, trajectory = null) {
  $('trial-metrics').replaceChildren();
  addMetric("Result", outcomeLabel(trial));
  if (trial.outcome?.evidenceCode) addMetric("Recorded evidence code", trial.outcome.evidenceCode);
  if (trial.seed !== undefined) addMetric("Trial seed (not an independent planner seed)", trial.seed);
  if (trial.grasp) addMetric("Grasp", typeof trial.grasp === 'string' ? trial.grasp : JSON.stringify(trial.grasp));
  if (trajectory) {
    addMetric("Playback duration", `${formatNumber(trajectory.duration, 3)} s`);
    addMetric("Recorded samples", `${trajectory.frameCount}Frame${trajectory.dimensions ? ` / ${trajectory.dimensions}Dimension Joints` : ''}`);
    if (trajectory.ee) {
      let length = 0;
      for (let i = 1; i < trajectory.ee.length; i++) {
        length += Math.hypot(...trajectory.ee[i].slice(0, 3).map((v, j) => v - trajectory.ee[i - 1][j]));
      }
      addMetric("End-effector path length", `${formatNumber(length, 3)} m`);
    }
  } else if (trial.replaySummary) {
    const summary = trial.replaySummary;
    addMetric("Original Recording Duration", `${formatNumber(summary.durationS, 3)} s`);
    addMetric("Original Record Sampling", `${summary.frameCount}Frame/${summary.dimensions}Dimension Joints`);
    addMetric("End-effector path length", `${formatNumber(summary.actualPathLengthM, 3)} m`);
    if (summary.plannedPathLengthM !== null) addMetric("Native Lift Path Length", `${formatNumber(summary.plannedPathLengthM, 3)} m`);
    if (summary.physics) {
      const physics = summary.physics;
      addMetric("First contact", physics.firstContactTimeS === null ? "No contacts recorded" : `${formatNumber(physics.firstContactTimeS, 3)} s`);
      addMetric("Maximum table clearance", `${formatNumber(physics.maxGapM * 1000, 3)} mm`);
      addMetric("Maximum qualifying hold", `${formatNumber(physics.longestHoldS, 3)} s`);
      addMetric("Qualified hold at the end", `${formatNumber(physics.terminalHoldS, 3)} s`);
    }
  }
  const names = { liftHeight: "Lifting height", lift_height: "Lifting height", maxLift: "Max Lift", max_lift: "Max Lift", finalLift: "Final Lift", final_lift: "Final Lift", planningTime: "Time-consuming to plan", planning_time: "Time-consuming to plan", minDistance: "Closest distance", min_distance: "Closest distance", positionError: "Position error", position_error: "Position error", rotationError: "Attitude error", rotation_error: "Attitude error", final_height: "Final height", collision: "collision", reason: "Determination description" };
  for (const [key, value] of Object.entries(trial.metrics || {}).slice(0, 10)) {
    const formatted = typeof value === 'number' ? formatNumber(value, 4)
      : typeof value === 'boolean' ? (value ? " is " : "No") : typeof value === 'object' ? JSON.stringify(value) : String(value);
    addMetric(names[key] || key, formatted);
  }
}

async function selectTrial(trial) {
  leavePositionIK();
  const token = ++state.trialToken;
  const point = state.point;
  setPlaying(false);
  state.trial = trial;
  if ($('replay-choice')) $('replay-choice').value = trial.id;
  state.trajectory = null;
  state.physics = null; state.physicsPlot = null;
  state.time = 0;
  state.duration = 0;
  resetPose();
  updateSelectionButtons();
  $('trial-title').textContent = trial.label || trial.id;
  $('trial-reason').textContent = trial.reason || `Experimental Recorded Results:${outcomeLabel(trial)}。`;
  $('failure-case-list').value = state.failureCases.includes(trial) ? trial.sourceRawId || trial.id : '';
  renderMetrics(trial);
  setPlaybackAvailability(false);
  updateTimeline();
  updateProvenance();
  updateModeUI();
  if (!trial.file) {
    const summaryOnly = trial.replayAvailability === 'summary_only';
    $('trajectory-state').textContent = summaryOnly ? "Numeric value only" : "No replay";
    $('trajectory-note').textContent = summaryOnly
      ? "This time it has actually been implemented.The Lite version retains the original results, feeds, and numerical summaries without a full playback; an attempted playback marked \"Playback Sample\" is optional."
      : trial.status === 'planning_rejected'
      ? "This time it was rejected in the planning stage and no physical trajectory was performed.The scene shows the docking position and the initial state of the object."
      : "The attempt did not provide a joint and object status file and could not be replayed.";
    $('current-stage').textContent = outcomeLabel(trial);
    return;
  }
  $('trajectory-state').textContent = "Loading";
  $('trajectory-note').textContent = "Reading recorded joint, end, and object states.";
  try {
    const trajectory = await getTrajectory(point, trial);
    if (token !== state.trialToken || state.point !== point) return;
    state.trajectory = trajectory;
    if (!state.paths.some(path => path.trial.id === trial.id)) buildPath(point, trial, trajectory);
    refreshPaths();
    state.physics = isWam() && hasIncompleteGapMeasurements(trajectory) ? null : analyzePhysics(trajectory);
    state.duration = trajectory.duration;
    const playable = Boolean(trajectory.joints && state.bindings.length);
    $('trajectory-state').textContent = playable ? "Replay loaded" : "Path only";
    const notes = [];
    if (isWam() && hasIncompleteGapMeasurements(trajectory)) notes.push('Clearance measurements incomplete.');
    if (outcomeCode(trial) === 'lift_ik_failed') notes.push("Only the pre-grab, close, and contact segments that have been performed are played back; the lift posture IK did not find a qualified solution and did not enter the successful lift path.");
    else if (outcomeCode(trial) === 'lift_plan_failed') notes.push("Replay contains approach, closure, and contact only; lift planning failed.");
    if (!trajectory.joints) notes.push("No joint states; robot replay unavailable.");
    if (!trajectory.object) notes.push("No object states; bottle remains at its initial pose.");
    if (!trajectory.ee) notes.push("No end-effector data; paths and axes are unavailable.");
    if (!notes.length) notes.push("Robot, end-effector, and bottle use recorded states.");
    $('trajectory-note').textContent = notes.join('');
    renderMetrics(trial, trajectory);
    renderPhysicsPanel();
    updateModeUI();
    setPlaybackAvailability(playable);
    renderStages(trajectory);
    applyTime(0);
    announce(`Loaded ${trial.label || trial.id}, ${outcomeLabel(trial)}, ${trajectory.frameCount} frames.`);
  } catch (error) {
    if (token !== state.trialToken || state.point !== point) return;
    $('trajectory-state').textContent = "Loading failed";
    $('trajectory-note').textContent = errorMessage(error);
    $('current-stage').textContent = "Trajectory load failed";
    notice(`Current trajectory cannot be played back:${errorMessage(error)}`);
  }
}

function updateProvenance() {
  const container = $('provenance-copy');
  container.replaceChildren();
  if (state.diagnosticMode) container.append(node('p', '', 'Static IK witness.'));
  else if (state.trial?.file) container.append(node('p', '', `${state.trial.label} · recorded execution`));
  $('provenance-details').hidden = !container.children.length;
}

function setPlaybackAvailability(available) {
  const hasDuration = available && !state.diagnosticMode && !state.reachabilityMode && !comparisonActive() && state.duration > 0;
  $('play-button').disabled = !hasDuration;
  $('replay-button').disabled = !hasDuration;
  $('timeline').disabled = !hasDuration;
  $('timeline').max = state.duration || 1;
  if (!available) $('stage-track').replaceChildren();
}

function setPlaying(playing) {
  state.playing = Boolean(playing && !state.diagnosticMode && !state.reachabilityMode && !comparisonActive() && state.trajectory?.joints && state.duration > 0);
  $('play-label').textContent = state.playing ? "Pause" : "Play";
  $('play-button').setAttribute('aria-label', state.playing ? "Pause" : "Play");
  $('play-icon').replaceChildren();
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', state.playing ? 'M5 4H8V16H5ZM12 4H15V16H12Z' : 'M6 3.5 16 10 6 16.5Z');
  $('play-icon').append(path);
}

function renderStages(trajectory) {
  $('stage-track').replaceChildren();
  if (!trajectory.duration) return;
  for (const stage of trajectory.stages) {
    const start = THREE.MathUtils.clamp((stage.start - trajectory.start) / trajectory.duration, 0, 1);
    const end = THREE.MathUtils.clamp((stage.end - trajectory.start) / trajectory.duration, 0, 1);
    if (end <= start) continue;
    const segment = node('span', 'stage-segment');
    segment.style.left = `${start * 100}%`;
    segment.style.width = `${(end - start) * 100}%`;
    segment.title = stage.name || stage.label || " stage ";
    $('stage-track').append(segment);
  }
}

function findFrame(trajectory, absoluteTime) {
  const times = trajectory.timestamps;
  if (times.length === 1 || absoluteTime <= times[0]) return [0, 0, 0];
  if (absoluteTime >= times[times.length - 1]) return [times.length - 1, times.length - 1, 0];
  let low = 0;
  let high = times.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (times[middle] <= absoluteTime) low = middle;
    else high = middle;
  }
  return [low, high, (absoluteTime - times[low]) / (times[high] - times[low])];
}

function applyPoseSample(object, samples, first, second, alpha) {
  const a = samples[first];
  const b = samples[second];
  object.position.set(a[0] + (b[0] - a[0]) * alpha, a[1] + (b[1] - a[1]) * alpha, a[2] + (b[2] - a[2]) * alpha);
  poseQuaternionA.set(a[3], a[4], a[5], a[6]);
  poseQuaternionB.set(b[3], b[4], b[5], b[6]);
  object.quaternion.copy(poseQuaternionA).slerp(poseQuaternionB, alpha);
}

function applyTime(time) {
  if (state.diagnosticMode) { updateTimeline(); return; }
  state.time = THREE.MathUtils.clamp(time, 0, state.duration);
  if (comparisonActive()) { updateTimeline(); return; }
  const trajectory = state.trajectory;
  if (trajectory) {
    const [first, second, alpha] = findFrame(trajectory, trajectory.start + state.time);
    if (trajectory.joints) applyJoints(trajectory.joints[first], trajectory.joints[second], alpha);
    if (trajectory.base) applyPoseSample(robotRoot, trajectory.base, first, second, alpha);
    else setPose(robotRoot, trajectory.basePose || pointBasePose(state.point));
    if (trajectory.object) applyPoseSample(objectRoot, trajectory.object, first, second, alpha);
    else setPose(objectRoot, state.manifest.object.initialPose);
    if (trajectory.ee) applyPoseSample(eeAxes, trajectory.ee, first, second, alpha);
    eeAxes.visible = $('show-axes').checked && Boolean(trajectory.ee);
    $('frame-indicator').textContent = `Frame${first + 1} / ${trajectory.frameCount}`;
  }
  updateTimeline();
  updatePhysicsReadings();
  invalidate();
}

function updateTimeline() {
  if (state.reachabilityMode) {
    $('current-stage').textContent = "Static distance bound; no execution";
    $('frame-indicator').textContent = "0 Step Physical Execution";
    return;
  }
  if (state.diagnosticMode) {
    $('current-time').textContent = '0.00';
    $('duration').textContent = '0.00';
    $('timeline').value = 0;
    $('timeline').style.setProperty('--progress', '0%');
    $('timeline').setAttribute('aria-valuetext', "Static IK, non-execution records");
    $('current-stage').textContent = "Static IK, non-execution records";
    $('frame-indicator').textContent = "Static IK";
    return;
  }
  $('current-time').textContent = state.time.toFixed(2);
  $('duration').textContent = state.duration.toFixed(2);
  $('timeline').value = state.time;
  $('timeline').style.setProperty('--progress', `${state.duration ? state.time / state.duration * 100 : 0}%`);
  $('timeline').setAttribute('aria-valuetext', `${state.time.toFixed(2)}Seconds of${state.duration.toFixed(2)}Seconds`);
  if (!state.trajectory) {
    $('current-stage').textContent = state.trial ? (state.trial.file ? "Waiting for trajectory" : outcomeLabel(state.trial)) : "Waiting for trajectory";
    $('frame-indicator').textContent = "No replay";
    return;
  }
  const absolute = state.trajectory.start + state.time;
  const stage = state.trajectory.stages.find((entry) => absolute >= entry.start && absolute <= entry.end);
  $('current-stage').textContent = stage?.name || stage?.label || (state.time >= state.duration && state.duration > 0 ? "End of playback" : state.trial?.label || "State playback");
}

function updateLabels() {
  if (!camera) return;
  const width = $('canvas-host').clientWidth;
  const height = $('canvas-host').clientHeight;
  const toolbar = document.querySelector('.viewer-toolbar');
  const topMargin = Math.min(height * 0.3, (toolbar?.offsetTop || 0) + (toolbar?.offsetHeight || 42) + 8);
  const visibleLabels = [];
  for (const marker of state.markers) {
    tmpProjection.set(...marker.point.position);
    tmpProjection.z += 0.035;
    tmpProjection.project(camera);
    const visible = (!state.reachabilityMode || isReachabilityPoint(marker.point)) && tmpProjection.z > -1 && tmpProjection.z < 1 && Math.abs(tmpProjection.x) < 1.08 && Math.abs(tmpProjection.y) < 1.04;
    marker.label.hidden = !visible;
    marker.leader.setAttribute('visibility', 'hidden');
    if (visible) {
      visibleLabels.push({ marker, anchorX: (tmpProjection.x + 1) * width / 2, anchorY: (-tmpProjection.y + 1) * height / 2,
        width: marker.label.offsetWidth || 70, height: marker.label.offsetHeight || 31 });
    }
  }
  // The selected label stays nearest its point; neighbours fan out around it.
  visibleLabels.sort((a, b) => Number(b.marker.point === state.point) - Number(a.marker.point === state.point));
  const placed = [];
  for (const item of visibleLabels) {
    const baseX = item.anchorX;
    const baseY = item.anchorY - item.height / 2 - 12;
    const candidates = [[0, 0]];
    for (let ring = 1; ring <= 4; ring++) {
      const dx = ring * (item.width + 8);
      const dy = ring * (item.height + 8);
      candidates.push([0, -dy], [0, dy], [-dx, 0], [dx, 0], [-dx, -dy], [dx, -dy], [-dx, dy], [dx, dy]);
    }
    let best = null;
    for (const [dx, dy] of candidates) {
      const halfWidth = item.width / 2;
      const halfHeight = item.height / 2;
      const x = THREE.MathUtils.clamp(baseX + dx, halfWidth + 8, Math.max(halfWidth + 8, width - halfWidth - 8));
      const y = THREE.MathUtils.clamp(baseY + dy, topMargin + halfHeight, Math.max(topMargin + halfHeight, height - halfHeight - 76));
      let overlap = 0;
      for (const other of placed) {
        const intersectX = Math.max(0, (item.width + other.width) / 2 + 6 - Math.abs(x - other.x));
        const intersectY = Math.max(0, (item.height + other.height) / 2 + 6 - Math.abs(y - other.y));
        overlap += intersectX * intersectY;
      }
      const score = overlap * 1e6 + (x - baseX) ** 2 + (y - baseY) ** 2;
      if (!best || score < best.score) best = { x, y, score, width: item.width, height: item.height };
      if (!overlap) break;
    }
    placed.push(best);
    const { x, y } = best;
    item.marker.label.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    const edgeX = THREE.MathUtils.clamp(item.anchorX, x - item.width / 2, x + item.width / 2);
    const edgeY = THREE.MathUtils.clamp(item.anchorY, y - item.height / 2, y + item.height / 2);
    if (Math.hypot(edgeX - item.anchorX, edgeY - item.anchorY) > 3) {
      const leader = item.marker.leader;
      leader.setAttribute('x1', item.anchorX);
      leader.setAttribute('y1', item.anchorY);
      leader.setAttribute('x2', edgeX);
      leader.setAttribute('y2', edgeY);
      leader.setAttribute('visibility', 'visible');
    }
  }
  const reachRects = [];
  const cause = $('c-failure-callout');
  if (state.reachabilityMode && !cause.hidden) reachRects.push({
    x: cause.offsetLeft + cause.offsetWidth / 2, y: cause.offsetTop + cause.offsetHeight / 2,
    half: cause.offsetWidth / 2, height: cause.offsetHeight,
  });
  for (const label of state.reachLabels) {
    const projected = label.position.clone().project(camera);
    const visible = state.reachabilityMode && projected.z > -1 && projected.z < 1;
    label.element.hidden = !visible;
    if (visible) {
      const half = label.element.offsetWidth / 2;
      const x = THREE.MathUtils.clamp((projected.x + 1) * width / 2, half + 8, width - half - 8);
      let y = THREE.MathUtils.clamp((-projected.y + 1) * height / 2 - 16, 20, height - 28);
      const labelHeight = label.element.offsetHeight;
      for (let attempt = 0; attempt < 5 && reachRects.some((other) => Math.abs(other.x - x) < other.half + half + 6 && Math.abs(other.y - y) < (other.height + labelHeight) / 2 + 6); attempt++) {
        y = Math.min(height - 28, y + labelHeight + 8);
      }
      reachRects.push({ x, y, half, height: labelHeight });
      label.element.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    }
  }
}

function ensureSelectedPointVisible() {
  if (!camera || !state.point) return;
  camera.updateMatrixWorld();
  const robotCenter = new THREE.Vector3(...state.point.position);
  robotCenter.z += 0.85;
  const target = objectRoot.getWorldPosition(new THREE.Vector3());
  const inView = (point) => {
    const projected = point.clone().project(camera);
    return projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 0.72 && Math.abs(projected.y) < 0.72;
  };
  if (inView(robotCenter) && inView(target)) return;
  const bounds = new THREE.Box3().setFromObject(robotRoot);
  bounds.union(new THREE.Box3().setFromObject(objectRoot));
  bounds.expandByPoint(new THREE.Vector3(...state.point.position));
  bounds.expandByScalar(0.15);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const center = sphere.center;
  const direction = camera.position.clone().sub(controls.target).normalize();
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
  const distance = Math.max(3.4, sphere.radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)) * 1.08);
  if (direction.lengthSq() < 0.1) direction.set(1, -1, 0.7).normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance);
  controls.update();
  invalidate();
}

function animate(now) {
  animationId = requestAnimationFrame(animate);
  const elapsed = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.15) : 0;
  lastFrameTime = now;
  if (state.playing) {
    applyTime(state.time + elapsed * state.speed);
    if (state.time >= state.duration) { if ($('replay-loop').checked) applyTime(0); else setPlaying(false); }
  }
  if (comparisonActive() && state.comparison.playing) {
    const progress = Math.min(1, state.comparison.progress + elapsed / 8);
    if (progress >= 1) state.comparison.playing = false;
    applyComparisonProgress(progress);
  }
  controls.update();
  if (needsRender) {
    needsRender = false;
    updateLabels();
    renderer.render(scene, camera);
  }
}

function focusScene() {
  if (!camera) return;
  camera.position.copy(state.homePosition);
  controls.target.copy(state.homeTarget);
  controls.update();
  invalidate();
}

function focusTarget() {
  if (state.reachabilityMode) { focusReachability(); return; }
  if (comparisonActive() && state.comparison.entries.length) { focusComparison(); return; }
  if (!state.ready) return;
  objectRoot.getWorldPosition(tmpVector);
  tmpVector.z += 0.08;
  const direction = camera.position.clone().sub(controls.target).normalize();
  if (direction.lengthSq() < 0.1) direction.set(1, -1, 0.7).normalize();
  controls.target.copy(tmpVector);
  camera.position.copy(tmpVector).addScaledVector(direction, 1.6);
  controls.update();
  invalidate();
}

function focusTop() {
  if (!camera) return;
  const distance = Math.max(3, camera.position.distanceTo(controls.target));
  camera.position.copy(controls.target).add(new THREE.Vector3(0, -0.025 * distance, distance));
  controls.update();
  invalidate();
}

function bindUI() {
  $('back-to-comparison').addEventListener('click', () => setViewMode('comparison'));
  $('failure-case-list').addEventListener('change', (event) => {
    const point = state.point;
    const trial = state.failureCases.find((item) => (item.sourceRawId || item.id) === event.target.value);
    if (trial) openPhysicalCase(point, trial);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!$('viewer-options').contains(event.target)) $('viewer-options').open = false;
  });
  $('viewer-options').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { $('viewer-options').open = false; $('viewer-options').querySelector('summary').focus(); }
  });
  $('viewer-options').addEventListener('click', (event) => {
    if (event.target.closest('button')) $('viewer-options').open = false;
  });
  $('retry-button').addEventListener('click', () => window.location.reload());
  $('view-scene').addEventListener('click', focusScene);
  $('view-target').addEventListener('click', focusTarget);
  $('view-top').addEventListener('click', focusTop);
  $('show-paths').addEventListener('change', refreshPaths);
  $('show-cutaway').addEventListener('change', applyCutaway);
  $('replay-choice').addEventListener('change', (event) => { const trial = state.point?.trials.find(t => t.id === event.target.value); if (!trial) return; setViewMode('single'); selectTrial(trial).then(() => { if (state.trial === trial && state.viewMode === 'single') setPlaying(true); }); });
  for (const [buttonId, panelId, shown, hidden] of [
    ['reach-toggle', 'reachability-lens', 'Hide evidence', 'Show evidence'],
    ['pose-toggle', 'd-pose-lens', 'Hide comparison', 'Show comparison'],
  ]) {
    $(buttonId).addEventListener('click', () => {
      const collapsed = $(panelId).classList.toggle('is-collapsed');
      $(buttonId).setAttribute('aria-expanded', String(!collapsed));
      $(buttonId).textContent = collapsed ? hidden : shown;
      updateAnalysisLayout();
    });
  }
  $('physics-toggle').addEventListener('click', () => { const panel = $('physics-lens'); const collapsed = panel.classList.toggle('is-collapsed'); $('physics-toggle').setAttribute('aria-expanded', String(!collapsed)); $('physics-toggle').textContent = collapsed ? 'Show metrics' : 'Hide metrics'; updateAnalysisLayout(); });
  $('mode-comparison').addEventListener('click', () => setViewMode('comparison'));
  $('mode-single').addEventListener('click', () => setViewMode('single'));
  $('mode-reachability').addEventListener('click', enterReachability);
  $('physics-window').addEventListener('change', renderPhysicsPanel);
  $('physics-first-contact').addEventListener('click', () => {
    if (state.physics?.firstContactIndex === null || !state.physics) return;
    setPlaying(false); applyTime(state.physics.samples[state.physics.firstContactIndex].timeS);
  });
  $('physics-peak').addEventListener('click', () => {
    if (!state.physics) return;
    const time = state.physics.samples[state.physics.peakGapIndex].timeS;
    if (state.physicsPlot && time < state.physicsPlot.from) { $('physics-window').value = 'full'; renderPhysicsPanel(); }
    setPlaying(false); applyTime(time);
  });
  $('physics-end').addEventListener('click', () => { setPlaying(false); applyTime(state.duration); });
  $('physics-paired').addEventListener('click', () => { const paired = pairedTrial(); if (paired) openPhysicalCase(paired.point, paired.trial); });
  $('comparison-source').addEventListener('change', (event) => {
    if (isWam()) return;
    state.dexSource = state.comparison.source = event.target.value;
    state.comparison.playing = false;
    refreshComparisonData();
    if (comparisonActive()) focusComparison();
  });
  $('comparison-auto').addEventListener('click', () => {
    state.comparison.playing = false;
    state.comparison.selectedIds = selectDiverseEntries(state.comparison.entries, 6);
    state.comparison.colors = new Map();
    rebuildComparisonVisuals();
    focusComparison();
  });
  $('comparison-random').addEventListener('click', () => {
    const entries = state.comparison.entries.slice();
    // Sampling the saved records changes only the view, never the experiment's seed or denominator.
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    state.comparison.playing = false;
    state.comparison.selectedIds = entries.slice(0, 6).map((entry) => entry.id);
    state.comparison.colors = new Map();
    rebuildComparisonVisuals(); focusComparison();
    announce("Random sampling has been done from real records and no new cuRobo planning has been done.");
  });
  $('comparison-peak').addEventListener('click', () => {
    const comparison = state.comparison;
    const analysis = comparison.allAnalysis;
    if (!analysis?.maxSeparationPair) return;
    comparison.playing = false;
    comparison.selectedIds = analysis.maxSeparationPair.map((index) => comparison.entries[index].id);
    comparison.colors = new Map();
    rebuildComparisonVisuals();
    applyComparisonProgress(analysis.maxSeparationProgress);
    focusComparison();
    announce(`Maximum detachment of retained success path samples located${formatNumber(analysis.maxSeparationM * 100, 2)}Centimeters.`);
  });
  $('compare-context').addEventListener('change', rebuildComparisonVisuals);
  $('lens-profile').addEventListener('click', () => setDiversityView('profile'));
  $('lens-projection').addEventListener('click', () => setDiversityView('projection'));
  $('lens-toggle').addEventListener('click', () => {
    const collapsed = !$('lens-body').hidden;
    $('lens-body').hidden = collapsed;
    $('lens-toggle').setAttribute('aria-expanded', String(!collapsed));
    $('lens-toggle').textContent = collapsed ? "Expand" : "Collapse";
  });
  $('comparison-clear').addEventListener('click', () => {
    state.comparison.playing = false;
    state.comparison.selectedIds = [];
    rebuildComparisonVisuals();
  });
  $('comparison-progress').addEventListener('input', (event) => {
    state.comparison.playing = false;
    applyComparisonProgress(Number(event.target.value));
  });
  $('comparison-play').addEventListener('click', () => {
    if (!comparisonActive() || !state.comparison.visuals.length) return;
    if (state.comparison.progress >= 1) state.comparison.progress = 0;
    state.comparison.playing = !state.comparison.playing;
    applyComparisonProgress(state.comparison.progress);
  });
  $('comparison-reset').addEventListener('click', () => {
    state.comparison.playing = false;
    applyComparisonProgress(0);
  });
  $('compare-axes').addEventListener('change', () => applyComparisonProgress(state.comparison.progress));
  $('compare-skeleton').addEventListener('change', () => applyComparisonProgress(state.comparison.progress));
  $('compare-robot').addEventListener('change', updateModeUI);
  $('ik-witness-button').addEventListener('click', () => {
    if (state.diagnosticMode) {
      const trial = state.trial;
      leavePositionIK();
      if (trial) {
        selectTrial(trial);
        if (comparisonActive()) applyComparisonProgress(state.comparison.progress);
      }
      else {
        resetPose();
        $('trial-title').textContent = "No attempts";
        $('trial-reason').textContent = "No attempts for this pose.";
        $('trajectory-state').textContent = "No replay";
        $('trial-metrics').replaceChildren();
        $('trajectory-note').textContent = '';
        updateTimeline();
        updateProvenance();
      }
    } else enterPositionIK();
  });
  $('show-axes').addEventListener('change', () => {
    if (state.diagnosticMode) {
      witnessAxes.visible = $('show-axes').checked;
      requestedAxes.visible = $('show-axes').checked;
    } else if (eeAxes) eeAxes.visible = $('show-axes').checked && Boolean(state.trajectory?.ee);
    invalidate();
  });
  $('play-button').addEventListener('click', () => {
    if (state.time >= state.duration) applyTime(0);
    setPlaying(!state.playing);
  });
  $('replay-button').addEventListener('click', () => { applyTime(0); setPlaying(true); });
  $('timeline').addEventListener('input', (event) => { setPlaying(false); applyTime(Number(event.target.value)); });
  $('playback-speed').addEventListener('change', (event) => { state.speed = Number(event.target.value); });
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.matches('input,textarea,select,[contenteditable=true]')) return;
    const key = event.key.toLowerCase();
    if (event.code === 'Space' && !event.target.closest('button,summary,a')) {
      event.preventDefault();
      if (comparisonActive()) { if (!$('comparison-play').disabled) $('comparison-play').click(); }
      else if (!$('play-button').disabled) $('play-button').click();
    } else if ((key === 'arrowleft' || key === 'arrowright') && comparisonActive() && state.comparison.visuals.length) {
      event.preventDefault();
      state.comparison.playing = false;
      applyComparisonProgress(state.comparison.progress + (key === 'arrowleft' ? -0.02 : 0.02));
    } else if ((key === 'arrowleft' || key === 'arrowright') && !comparisonActive() && !state.diagnosticMode && state.trajectory?.joints) {
      event.preventDefault();
      setPlaying(false);
      applyTime(state.time + (key === 'arrowleft' ? -0.2 : 0.2));
    } else if (key === 'g') focusScene();
    else if (key === 'f') focusTarget();
    else if (key === 't') focusTop();
    else {
      const point = state.manifest?.points.find((item) => item.id.toLowerCase() === key);
      if (point) selectPoint(point);
    }
  });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(animationId); renderer?.dispose(); });
}

async function start() {
  bindUI();
  $('show-paths').addEventListener('change', () => { if ($('show-paths').checked) ensurePointTrajectories(); });
  if (window.location.protocol === 'file:') {
    setLoading("Please open via local service", "Run python3 serve.py in the delivery directory and visit http://127.0.0.1: 8000/.", true);
    $('dataset-summary').textContent = "Waiting for local HTTP service";
    return;
  }
  try {
    initializeGraphics();
  } catch (error) {
    setLoading("Unable to create 3D view", `Browser requires WebGL to be enabled.${errorMessage(error)}`, true);
    $('dataset-summary').textContent = "3D rendering unavailable";
    return;
  }
  try {
    state.manifest = validateManifest(await readJSON('data/manifest.json'));
    const manifest = state.manifest;
    $('app-title').textContent = manifest.title || "Grasp Explorer";
    document.title = manifest.title || "Grasp Explorer";
    $('dataset-description').textContent = '4 docking poses · recorded trajectories';
    $('scene-name').textContent = manifest.scene.name || "Recorded scene";
    $('point-count').textContent = `${manifest.points.length}`;
    const total = manifest.points.reduce((sum, point) => sum + point.trials.length, 0);
    const replays = manifest.points.reduce((sum, point) => sum + point.trials.filter((trial) => trial.file).length, 0);
    $('dataset-summary').textContent = `${manifest.points.length} poses / ${total} attempts / ${replays} replays`;
    setLoading('Loading scene and robot', 'Preparing the complete scene…');
    const initialTrial = preferredTrial(manifest.points[0]);
    const initialReplay = initialTrial?.file
      ? readJSON(initialTrial.file).then(raw => ({ raw }), error => ({ error }))
      : null;
    const results = await Promise.allSettled([
      loadModel(manifest.scene.file), loadModel(manifest.robot.file), loadModel(manifest.object.file), readJSON(manifest.robot.kinematics),
      readJSON('data/experiment.json').catch(() => null), readJSON('data/prescreen.json').catch(() => null),
      readJSON('data/wam.json').then(raw => createEvaluationSession(manifest, raw, { scope: 'full' })),
    ]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
    MeshoptDecoder.useWorkers(0);
    state.evaluation = results[6].value;
    sceneAsset = results[0].value;
    const robot = results[1].value;
    const object = results[2].value;
    bindJoints(robot, results[3].value);
    state.comparisonModel = createComparisonModel(results[3].value);
    if (initialReplay) {
      const prefetched = await initialReplay;
      if (prefetched.raw) state.cache.set(trialKey(manifest.points[0], initialTrial), Promise.resolve(validateTrajectory(prefetched.raw, initialTrial.file)));
    }
    applyProceduralSurfaces(sceneAsset);
    scene.add(sceneAsset);
    configureCutaway();
    robotRoot.add(robot);
    const robotMaterials = new Set();
    robot.traverse((child) => {
      if (child.isMesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) robotMaterials.add(material);
    });
    state.robotMaterials = [...robotMaterials].map((material) => ({ material, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite }));
    objectRoot.add(object);
    state.experiment = results[4].value;
    state.prescreen = results[5].value;
    initializeReachability();
    setPose(objectRoot, manifest.object.initialPose);
    const cameraConfig = manifest.scene.camera;
    if (finiteArray(cameraConfig?.position, 3)) state.homePosition.set(...cameraConfig.position);
    if (finiteArray(cameraConfig?.target, 3)) state.homeTarget.set(...cameraConfig.target);
    focusScene();
    renderPointList();
    makeMarkers();
    state.ready = true;
    bindEvaluation();
    $('loading-panel').hidden = true;
    await selectPoint(manifest.points[0]);
    if (requestedMethod !== evaluationView().model) await switchEvaluation(requestedMethod);
    if (embedded) parent.postMessage({type: 'grasp-ready'}, location.origin);

  } catch (error) {
    setPlaying(false);
    setLoading("Experiment data could not be loaded", `${errorMessage(error)}Please check the data and assets files in the delivery directory before reloading.`, true);
    $('dataset-summary').textContent = "Data unavailable";
    $('point-list').replaceChildren(node('p', 'empty-copy', "Docking poses appear after the data loads."));
    announce("The experimental data could not be loaded.");
  }
}

start();
