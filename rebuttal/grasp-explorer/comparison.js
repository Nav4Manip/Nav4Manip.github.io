import * as THREE from './vendor/three.module.js';

const JOINT_COUNT = 58;
const PALM_LINK = 'right_hand_C_MC';
const SAMPLE_COUNT = 64;
const SCORE_EPSILON = 1e-12;

function finiteVector(value, size) {
  if (!Array.isArray(value) || value.length !== size) return false;
  for (const number of value) if (!Number.isFinite(number)) return false;
  return true;
}

function validPose(value) {
  if (!finiteVector(value, 7)) return false;
  const norm = Math.hypot(value[3], value[4], value[5], value[6]);
  return Number.isFinite(norm) && norm > 0;
}

function everyItem(values, predicate) {
  if (!Array.isArray(values)) return false;
  for (const value of values) if (!predicate(value)) return false;
  return true;
}

function quaternion(values, offset = 0) {
  const norm = Math.hypot(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
  return new THREE.Quaternion(values[offset] / norm, values[offset + 1] / norm,
    values[offset + 2] / norm, values[offset + 3] / norm);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function makePath(source, poses, joints, basePose) {
  const cumulativeLengths = [0];
  for (let i = 1; i < poses.length; i++) {
    cumulativeLengths.push(cumulativeLengths[i - 1] + distance(poses[i - 1], poses[i]));
  }
  const totalLengthM = cumulativeLengths.at(-1);
  if (!Number.isFinite(totalLengthM)) return null;
  return { source, poses, joints, basePose: basePose.slice(), cumulativeLengths, totalLengthM };
}

/** Exact physical-link FK in the recorded EG room world (metres, XYZ + XYZW). */
export function createComparisonModel(kinematics) {
  if (!kinematics || !Array.isArray(kinematics.links) || !kinematics.links.length || !Array.isArray(kinematics.joints)) {
    throw new TypeError('Comparison kinematics requires links and joints.');
  }
  const links = new Map(), jointByChild = new Map(), jointByName = new Map(), stateIndices = new Set();
  for (const joint of kinematics.joints) {
    if (!joint || typeof joint.name !== 'string' || !joint.name || typeof joint.child !== 'string' ||
        jointByChild.has(joint.child) || jointByName.has(joint.name) ||
        !['fixed', 'revolute', 'continuous', 'prismatic'].includes(joint.type)) {
      throw new TypeError('Comparison kinematics has an invalid or duplicated joint.');
    }
    const active = joint.type !== 'fixed';
    if (active && (!Number.isInteger(joint.stateIndex) || joint.stateIndex < 0 || joint.stateIndex >= JOINT_COUNT ||
        stateIndices.has(joint.stateIndex) || !finiteVector(joint.axis, 3) ||
        !Number.isFinite(Math.hypot(...joint.axis)) || Math.hypot(...joint.axis) === 0)) {
      throw new TypeError(`Invalid state index or axis for joint ${joint.name}.`);
    }
    if (active) stateIndices.add(joint.stateIndex);
    const origin = joint.origin;
    if (!origin || !finiteVector(origin.translation, 3) ||
        !validPose([...origin.translation, ...(origin.quaternion ?? [])])) {
      throw new TypeError(`Invalid origin for joint ${joint.name}.`);
    }
    const axisNorm = active ? Math.hypot(...joint.axis) : 1;
    const compiled = {
      name: joint.name, parent: joint.parent, child: joint.child, type: joint.type, index: joint.stateIndex,
      position: new THREE.Vector3(...origin.translation), rotation: quaternion(origin.quaternion),
      axis: active ? new THREE.Vector3(...joint.axis.map((value) => value / axisNorm)) : null,
    };
    jointByChild.set(joint.child, compiled);
    jointByName.set(joint.name, compiled);
  }
  for (const link of kinematics.links) {
    if (!link || typeof link.name !== 'string' || !link.name || links.has(link.name) ||
        !finiteVector(link.translation, 3) || !validPose([...link.translation, ...(link.quaternion ?? [])])) {
      throw new TypeError('Comparison kinematics has an invalid or duplicated link.');
    }
    const joint = jointByChild.get(link.name);
    if (joint && joint.parent !== link.parent) throw new TypeError(`Parent mismatch for link ${link.name}.`);
    links.set(link.name, {
      name: link.name, parent: link.parent ?? null, joint,
      position: joint ? joint.position : new THREE.Vector3(...link.translation),
      rotation: joint ? joint.rotation : quaternion(link.quaternion),
    });
  }
  for (const child of jointByChild.keys()) {
    if (!links.has(child)) throw new TypeError(`Unknown joint child link ${child}.`);
  }
  const aliases = { ...(kinematics.aliases ?? {}) }, chains = new Map();
  function chainFor(name, visiting = new Set()) {
    if (chains.has(name)) return chains.get(name);
    const link = links.get(name);
    if (!link || visiting.has(name)) throw new TypeError(`Unknown or cyclic kinematic link ${name}.`);
    visiting.add(name);
    const chain = link.parent === null ? [] : chainFor(link.parent, visiting).slice();
    chain.push(link);
    visiting.delete(name);
    chains.set(name, chain);
    return chain;
  }
  for (const name of links.keys()) chainFor(name);

  function evaluate(joints, basePose, chain, collect = false) {
    if (!finiteVector(joints, JOINT_COUNT) || !validPose(basePose)) {
      throw new TypeError('Comparison FK expects finite q58 and a nonzero XYZ + XYZW base pose.');
    }
    const position = new THREE.Vector3(...basePose.slice(0, 3)), rotation = quaternion(basePose, 3);
    const localPosition = new THREE.Vector3(), localRotation = new THREE.Quaternion(), motion = new THREE.Quaternion();
    const points = [];
    for (const link of chain) {
      localPosition.copy(link.position);
      localRotation.copy(link.rotation);
      const joint = link.joint;
      if (joint && joint.type !== 'fixed') {
        const value = joints[joint.index];
        if (joint.type === 'prismatic') {
          localPosition.add(new THREE.Vector3().copy(joint.axis).multiplyScalar(value).applyQuaternion(localRotation));
        } else {
          localRotation.multiply(motion.setFromAxisAngle(joint.axis, value));
        }
      }
      position.add(localPosition.applyQuaternion(rotation));
      rotation.multiply(localRotation);
      if (collect && (link.name === 'torso_right_arm_mount_link' || /^right_arm_link[1-7]$/.test(link.name) ||
          link.name === 'right_arm_end_effector_mount_link' || link.name === PALM_LINK)) points.push(position.toArray());
    }
    const result = [...position.toArray(), ...rotation.normalize().toArray()];
    if (!validPose(result)) throw new TypeError('Comparison FK produced a non-finite pose.');
    return collect ? points : result;
  }

  function pose(joints58, basePose7, linkName = PALM_LINK) {
    const target = aliases[linkName] ?? linkName;
    if (!links.has(target)) throw new TypeError(`Unknown kinematic link ${target}.`);
    return evaluate(joints58, basePose7, chains.get(target));
  }

  function armPoints(joints58, basePose7) {
    if (!links.has(PALM_LINK)) throw new TypeError(`Unknown kinematic link ${PALM_LINK}.`);
    return evaluate(joints58, basePose7, chains.get(PALM_LINK), true);
  }

  function path(trajectory, source) {
    if (!trajectory || !validPose(trajectory.basePose)) return null;
    if (source === 'actual') {
      const { ee, joints } = trajectory;
      if (!Array.isArray(ee) || !ee.length || !Array.isArray(joints) || joints.length !== ee.length ||
          !everyItem(ee, validPose) || !everyItem(joints, (state) => finiteVector(state, JOINT_COUNT))) return null;
      return makePath(source, ee.map((value) => value.slice()), joints.map((value) => value.slice()), trajectory.basePose);
    }
    if (source !== 'planned') return null;
    const plan = trajectory.plannedLift;
    if (!plan || !Array.isArray(plan.jointNames) || !plan.jointNames.length ||
        !everyItem(plan.jointNames, (name) => typeof name === 'string' && name.length > 0) ||
        new Set(plan.jointNames).size !== plan.jointNames.length || !Array.isArray(plan.nativeJointWaypoints) ||
        !plan.nativeJointWaypoints.length || !finiteVector(trajectory.joints?.[0], JOINT_COUNT)) return null;
    const mapping = plan.jointNames.map((name) => jointByName.get(name));
    if (mapping.some((joint) => !joint || joint.type === 'fixed') ||
        !everyItem(plan.nativeJointWaypoints, (waypoint) => finiteVector(waypoint, mapping.length))) return null;
    const target = trajectory.provenance?.eeLink ?? PALM_LINK;
    if (!links.has(aliases[target] ?? target)) return null;
    const joints = plan.nativeJointWaypoints.map((waypoint) => {
      const state = trajectory.joints[0].slice();
      mapping.forEach((joint, column) => { state[joint.index] = waypoint[column]; });
      return state;
    });
    // No world-frame conversion, approximate wrist origin, or invented native timestamps.
    try {
      const poses = joints.map((state) => pose(state, trajectory.basePose, target));
      return makePath(source, poses, joints, trajectory.basePose);
    } catch (error) {
      if (error instanceof TypeError) return null;
      throw error;
    }
  }
  return { pose, armPoints, path };
}

function validPath(path) {
  if (!path || !Array.isArray(path.poses) || !path.poses.length || !Array.isArray(path.joints) ||
      path.joints.length !== path.poses.length || !Array.isArray(path.cumulativeLengths) ||
      path.cumulativeLengths.length !== path.poses.length || !Number.isFinite(path.totalLengthM) ||
      path.totalLengthM < 0 || path.cumulativeLengths[0] !== 0 ||
      !everyItem(path.poses, validPose) || !everyItem(path.joints, (state) => finiteVector(state, JOINT_COUNT))) return false;
  for (let i = 0; i < path.cumulativeLengths.length; i++) {
    if (!Number.isFinite(path.cumulativeLengths[i]) ||
        (i && path.cumulativeLengths[i] < path.cumulativeLengths[i - 1])) return false;
  }
  return path.cumulativeLengths.at(-1) === path.totalLengthM;
}

function sampleValidated(path, progress) {
  const count = path.poses.length;
  let lower = 0, upper = 0, fraction = 0;
  if (progress >= 1) lower = upper = count - 1;
  else if (progress > 0 && count > 1) {
    if (path.totalLengthM === 0) {
      const waypoint = progress * (count - 1);
      lower = Math.floor(waypoint); upper = lower + 1; fraction = waypoint - lower;
    } else {
      const target = progress * path.totalLengthM;
      let low = 0, high = count - 1;
      // First cumulative length strictly greater than target skips zero-length runs.
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (path.cumulativeLengths[middle] <= target) low = middle + 1;
        else high = middle;
      }
      upper = low; lower = Math.max(0, upper - 1);
      const length = path.cumulativeLengths[upper] - path.cumulativeLengths[lower];
      fraction = length > 0 ? (target - path.cumulativeLengths[lower]) / length : 0;
    }
  }
  const a = path.poses[lower], b = path.poses[upper];
  const rotation = quaternion(a, 3).slerp(quaternion(b, 3), fraction).normalize().toArray();
  const pose = a.slice(0, 3).map((value, axis) => value * (1 - fraction) + b[axis] * fraction).concat(rotation);
  const joints = path.joints[lower].map((value, index) => value * (1 - fraction) + path.joints[upper][index] * fraction);
  return { pose, joints, progress };
}

/** Progress is normalized EE arc length, never shared physical time. */
export function sampleComparisonPath(path, progress) {
  if (!Number.isFinite(progress) || !validPath(path)) return null;
  return sampleValidated(path, Math.min(1, Math.max(0, progress)));
}

function describe(path) {
  if (!validPath(path)) return null;
  return {
    samples: Array.from({ length: SAMPLE_COUNT }, (_, i) => sampleValidated(path, i / (SAMPLE_COUNT - 1)).pose),
    endpoint: quaternion(path.poses.at(-1), 3),
  };
}

function pairMetrics(a, b) {
  let maxSeparationM = 0;
  for (let i = 0; i < SAMPLE_COUNT; i++) maxSeparationM = Math.max(maxSeparationM, distance(a.samples[i], b.samples[i]));
  const dot = Math.min(1, Math.abs(a.endpoint.dot(b.endpoint)));
  return { maxSeparationM, maxOrientationDeg: 2 * Math.acos(dot) * 180 / Math.PI };
}

/** Same-progress EE geometry and world orientation at 64 normalized arc-length samples. */
export function analyzeComparisonPaths(paths) {
  const inputs = Array.isArray(paths) ? paths : [];
  const pathLengthsM = Array.from({ length: inputs.length }, () => null), descriptors = [];
  let minLengthM = 0, maxLengthM = 0;
  for (let index = 0; index < inputs.length; index++) {
    const descriptor = describe(inputs[index]);
    if (!descriptor) continue;
    const lengthM = Math.max(0, inputs[index].totalLengthM);
    pathLengthsM[index] = lengthM;
    minLengthM = descriptors.length ? Math.min(minLengthM, lengthM) : lengthM;
    maxLengthM = Math.max(maxLengthM, lengthM);
    descriptors.push({
      index, samples: descriptor.samples,
      rotations: descriptor.samples.map((pose) => quaternion(pose, 3)),
    });
  }

  const profile = [], relativeRotation = new THREE.Quaternion();
  let maxSeparationM = 0, maxOrientationDeg = 0, maxSeparationPair = null, maxSeparationProgress = 0;
  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const progress = sample / (SAMPLE_COUNT - 1);
    let separationM = 0, orientationDeg = 0;
    // Earlier progress wins exact ties; ascending original indexes then select the first pair.
    for (let i = 0; i < descriptors.length; i++) {
      for (let j = i + 1; j < descriptors.length; j++) {
        const a = descriptors[i], b = descriptors[j];
        const separation = distance(a.samples[sample], b.samples[sample]);
        // Relative rotation avoids acos precision loss for equivalent q and -q.
        relativeRotation.copy(a.rotations[sample]).conjugate().multiply(b.rotations[sample]);
        const angle = 2 * Math.atan2(Math.hypot(relativeRotation.x, relativeRotation.y, relativeRotation.z),
          Math.abs(relativeRotation.w)) * 180 / Math.PI;
        separationM = Math.max(separationM, separation);
        orientationDeg = Math.max(orientationDeg, angle);
        if (maxSeparationPair === null || separation > maxSeparationM) {
          maxSeparationM = separation;
          maxSeparationPair = [a.index, b.index];
          maxSeparationProgress = progress;
        }
      }
    }
    maxOrientationDeg = Math.max(maxOrientationDeg, orientationDeg);
    profile.push({ progress, maxSeparationM: separationM, maxOrientationDeg: orientationDeg });
  }
  return {
    sampleCount: SAMPLE_COUNT, pathCount: descriptors.length, profile, maxSeparationM, maxOrientationDeg,
    maxSeparationPair, maxSeparationProgress, pathLengthsM, minLengthM, maxLengthM,
  };
}

/** Maximum same-progress separation at 64 samples, plus endpoint EE quaternion angle. */
export function comparisonMetrics(paths) {
  const descriptors = Array.isArray(paths) ? paths.map(describe).filter(Boolean) : [];
  let maxSeparationM = 0, maxOrientationDeg = 0;
  for (let i = 0; i < descriptors.length; i++) {
    for (let j = 0; j < i; j++) {
      const pair = pairMetrics(descriptors[i], descriptors[j]);
      maxSeparationM = Math.max(maxSeparationM, pair.maxSeparationM);
      maxOrientationDeg = Math.max(maxOrientationDeg, pair.maxOrientationDeg);
    }
  }
  return { maxSeparationM, maxOrientationDeg };
}

/** Stable farthest-point subset. Input must already contain only successful trials. */
export function selectDiverseEntries(entries, count = 4) {
  if (!Array.isArray(entries) || !Number.isFinite(count) || count < 1) return [];
  const unique = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || unique.has(entry.id)) continue;
    const descriptor = describe(entry.path);
    if (descriptor) unique.set(entry.id, { id: entry.id, descriptor });
  }
  const candidates = [...unique.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const size = Math.min(Math.floor(count), candidates.length);
  if (!size) return [];
  if (candidates.length === 1) return [candidates[0].id];
  const pairs = Array.from({ length: candidates.length }, () => []);
  let maxGeometry = 0, maxAngle = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const metrics = pairMetrics(candidates[i].descriptor, candidates[j].descriptor);
      pairs[i][j] = pairs[j][i] = metrics;
      maxGeometry = Math.max(maxGeometry, metrics.maxSeparationM);
      maxAngle = Math.max(maxAngle, metrics.maxOrientationDeg);
    }
  }
  // Equal weights after scaling each measure by this candidate set's maximum.
  const score = (i, j) => (maxGeometry > 0 ? pairs[i][j].maxSeparationM / maxGeometry : 0) +
    (maxAngle > 0 ? pairs[i][j].maxOrientationDeg / maxAngle : 0);
  let seed = [0, 1], best = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const value = score(i, j);
      if (value > best + SCORE_EPSILON) { best = value; seed = [i, j]; }
    }
  }
  const selected = seed.slice(0, size);
  while (selected.length < size) {
    let next = -1, farthest = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      if (selected.includes(i)) continue;
      const nearest = Math.min(...selected.map((chosen) => score(i, chosen)));
      if (nearest > farthest + SCORE_EPSILON) { farthest = nearest; next = i; }
    }
    selected.push(next);
  }
  return selected.map((index) => candidates[index].id);
}
