import * as THREE from './vendor/three.module.js';

const CONSISTENCY_TOLERANCE_M = 1e-8;
const ARM_COLOR = 0x529de9;
const OBJECT_COLOR = 0xf3a346;
const GAP_COLOR = 0xef5966;

function finiteVector(value) {
  if (!Array.isArray(value) || value.length !== 3) return false;
  for (const number of value) if (!Number.isFinite(number)) return false;
  return true;
}

function positiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function consistent(actual, reported) {
  return Number.isFinite(actual) && Number.isFinite(reported) &&
    Math.abs(actual - reported) <= CONSISTENCY_TOLERANCE_M * Math.max(1, Math.abs(actual), Math.abs(reported));
}

function consistentVector(actual, reported) {
  return finiteVector(reported) && actual.every((value, index) => consistent(value, reported[index]));
}

function validMetadata(anchorBody, nativeGeometryCount) {
  return typeof anchorBody === 'string' && anchorBody.trim().length > 0 &&
    Number.isSafeInteger(nativeGeometryCount) && nativeGeometryCount > 0;
}

/** Optional log metadata for presentation; absent evidence does not imply a result. */
export function readPrescreenMetadata(audit, point) {
  const summaries = audit?.summaries?.[point?.id];
  if (!Array.isArray(summaries) || !summaries.length) return null;
  const lanes = summaries.filter((entry) => entry?.counts && typeof entry.counts === 'object');
  if (!lanes.length) return null;
  const keys = ['pregrasp_ik', 'retreat_direction', 'web_direction', 'robot_collision', 'lift_ik', 'usable', 'ik_tests'];
  const counts = lanes[0].counts;
  const settings = audit.prescreen?.settings ?? {};
  const angles = Array.isArray(settings.retainedGammaDeg) ? settings.retainedGammaDeg.filter(Number.isFinite) : [];
  const probeCount = angles.length || (Number.isSafeInteger(audit.conclusion?.retainedProbesPerCandidate)
    && audit.conclusion.retainedProbesPerCandidate > 0 ? audit.conclusion.retainedProbesPerCandidate : null);
  const trials = Array.isArray(point.trials) ? point.trials : [];
  return {
    counts, lanes, candidateCount: trials.length, angles, probeCount,
    sameLaneCounts: lanes.every((entry) => keys.every((key) => entry.counts[key] === counts[key])),
    allPregraspRejected: trials.length > 0 && trials.every((trial) =>
      !trial.file && (trial.outcome?.code === 'prescreen_ik_failed' || trial.outcome?.code === 'ik_failed'))
      && counts.pregrasp_ik === trials.length && counts.usable === 0,
    actualGammaDeg: Number.isFinite(settings.actualTrialInitialGammaDeg?.[point.id])
      ? settings.actualTrialInitialGammaDeg[point.id] : null,
    example: audit.candidateExample && typeof audit.candidateExample === 'object' ? audit.candidateExample : null,
  };
}

/** Prefer the recorded reference anchor; a translation fallback requires equal base yaw. */
export function referenceReachabilityAnchor(proof, rawProof, worldFromSource, points) {
  const evidence = rawProof?.evidence;
  if (!evidence || !finiteVector(proof?.anchor)) return null;
  const pointId = evidence.reference_point || 'A';
  const explicit = evidence.reference_anchor_world_xyz;
  if (finiteVector(explicit) && finiteVector(worldFromSource?.translation) && Number.isFinite(worldFromSource.yaw)) {
    const { translation, yaw } = worldFromSource, cosine = Math.cos(yaw), sine = Math.sin(yaw);
    return { pointId, anchor: [cosine * explicit[0] - sine * explicit[1] + translation[0],
      sine * explicit[0] + cosine * explicit[1] + translation[1], explicit[2] + translation[2]] };
  }
  if (explicit !== undefined || !Array.isArray(points)) return null;
  const reference = points.find((point) => point.id === pointId);
  const target = points.find((point) => point.id === (evidence.point || 'C'));
  if (!finiteVector(reference?.position) || !finiteVector(target?.position)) return null;
  const deltaYaw = (target.yaw || 0) - (reference.yaw || 0);
  if (Math.abs(Math.atan2(Math.sin(deltaYaw), Math.cos(deltaYaw))) > 1e-8) return null;
  return { pointId, anchor: proof.anchor.map((value, axis) => value - (target.position[axis] - reference.position[axis])) };
}

function deriveGeometry(anchor, objectCenter, armRadiusM, objectRadiusM) {
  if (!finiteVector(anchor) || !finiteVector(objectCenter) ||
      !positiveNumber(armRadiusM) || !positiveNumber(objectRadiusM)) {
    throw new TypeError('Reachability proof requires finite centers and positive enclosing radii.');
  }
  const delta = objectCenter.map((value, index) => value - anchor[index]);
  const centerDistanceM = Math.hypot(...delta);
  const anchorToObjectLowerBoundM = centerDistanceM - objectRadiusM;
  const separationLowerBoundM = anchorToObjectLowerBoundM - armRadiusM;
  if (!positiveNumber(centerDistanceM) || !positiveNumber(separationLowerBoundM)) {
    throw new TypeError('Reachability rejection requires a finite, positive separation between the enclosing spheres.');
  }
  const direction = delta.map((value) => value / centerDistanceM);
  const armBoundary = anchor.map((value, index) => value + direction[index] * armRadiusM);
  const objectBoundary = objectCenter.map((value, index) => value - direction[index] * objectRadiusM);
  const sphereExtents = [
    ...anchor.map((value) => value - armRadiusM), ...anchor.map((value) => value + armRadiusM),
    ...objectCenter.map((value) => value - objectRadiusM), ...objectCenter.map((value) => value + objectRadiusM),
  ];
  if (!finiteVector(armBoundary) || !finiteVector(objectBoundary) || !sphereExtents.every(Number.isFinite)) {
    throw new TypeError('Reachability proof geometry exceeds finite world coordinates.');
  }
  return { centerDistanceM, anchorToObjectLowerBoundM, separationLowerBoundM, armBoundary, objectBoundary };
}

/**
 * Read distanceReachProof.evidence without mutating it. The source XYZ values
 * already include the diagnostic point's base placement: apply only Rz(yaw) * XYZ + translation.
 * The arm sphere encloses all arm/hand geometry for every posture; it is not the
 * exact reachable workspace. This static pre-screen evidence used zero physics steps.
 * Returned positions are new XYZ arrays in the EG room world, in metres.
 */
export function computeReachabilityProof(rawProof, worldFromSource) {
  const evidence = rawProof?.evidence;
  if (!evidence || !finiteVector(evidence.anchor_world_xyz) || !finiteVector(evidence.object_world_xyz) ||
      !validMetadata(evidence.anchor_body, evidence.native_arm_geometry_count) ||
      !positiveNumber(evidence.anchor_to_object_geometry_distance_lower_bound_m) ||
      !positiveNumber(evidence.separation_lower_bound_m) ||
      evidence.physics_steps !== 0 || evidence.position_unreachable_for_native_right_arm !== true) {
    throw new TypeError('Reachability proof requires the original zero-step rejection evidence.');
  }
  if (!worldFromSource || !finiteVector(worldFromSource.translation) || !Number.isFinite(worldFromSource.yaw)) {
    throw new TypeError('Reachability proof requires a finite source-to-world translation and yaw.');
  }
  const { translation, yaw } = worldFromSource;
  const cosine = Math.cos(yaw), sine = Math.sin(yaw);
  function toWorld(source) {
    return [
      cosine * source[0] - sine * source[1] + translation[0],
      sine * source[0] + cosine * source[1] + translation[1],
      source[2] + translation[2],
    ];
  }
  const anchor = toWorld(evidence.anchor_world_xyz);
  const objectCenter = toWorld(evidence.object_world_xyz);
  const armRadiusM = evidence.all_postures_arm_geometry_radius_upper_bound_m;
  const objectRadiusM = evidence.object_geometry_radius_upper_bound_m;
  const derived = deriveGeometry(anchor, objectCenter, armRadiusM, objectRadiusM);
  if (!consistent(derived.anchorToObjectLowerBoundM, evidence.anchor_to_object_geometry_distance_lower_bound_m) ||
      !consistent(derived.separationLowerBoundM, evidence.separation_lower_bound_m)) {
    throw new TypeError('Reachability radii and centers disagree with the reported distance lower bounds.');
  }
  return {
    anchor, objectCenter, armRadiusM, objectRadiusM,
    centerDistanceM: derived.centerDistanceM,
    separationLowerBoundM: derived.separationLowerBoundM,
    armBoundary: derived.armBoundary, objectBoundary: derived.objectBoundary,
    anchorBody: evidence.anchor_body, nativeGeometryCount: evidence.native_arm_geometry_count,
    physicsSteps: 0,
  };
}

function validateComputedProof(proof) {
  if (!proof || proof.physicsSteps !== 0 || !validMetadata(proof.anchorBody, proof.nativeGeometryCount) ||
      !positiveNumber(proof.centerDistanceM) || !positiveNumber(proof.separationLowerBoundM)) {
    throw new TypeError('Reachability visual requires a validated zero-step proof.');
  }
  const derived = deriveGeometry(proof.anchor, proof.objectCenter, proof.armRadiusM, proof.objectRadiusM);
  if (!consistent(derived.centerDistanceM, proof.centerDistanceM) ||
      !consistent(derived.separationLowerBoundM, proof.separationLowerBoundM) ||
      !consistentVector(derived.armBoundary, proof.armBoundary) ||
      !consistentVector(derived.objectBoundary, proof.objectBoundary)) {
    throw new TypeError('Reachability visual received inconsistent derived geometry.');
  }
  // Three.js uploads these local geometries as Float32 values.
  if (![...proof.anchor, ...proof.objectCenter, proof.armRadiusM, proof.objectRadiusM].every((value) =>
    Number.isFinite(Math.fround(value)))) {
    throw new TypeError('Reachability visual geometry exceeds finite rendering coordinates.');
  }
}

function enclosingSphere(center, radius, color, name, opacity) {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(center);
  group.userData.radiusM = radius;

  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
  }));
  surface.name = `${name}-surface`;
  group.add(surface);

  const points = [];
  for (let index = 0; index < 96; index++) {
    const angle = index / 96 * Math.PI * 2;
    points.push(new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0));
  }
  const circleGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const circleMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
  for (const rotation of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
    const circle = new THREE.LineLoop(circleGeometry, circleMaterial);
    circle.name = `${name}-great-circle`;
    circle.rotation.set(...rotation);
    group.add(circle);
  }
  return group;
}

function centerMarker(center, radius, color, name) {
  const marker = new THREE.Mesh(new THREE.SphereGeometry(Math.min(0.018, radius * 0.12), 16, 12),
    new THREE.MeshBasicMaterial({ color }));
  marker.name = name;
  marker.position.copy(center);
  return marker;
}

/**
 * Build static world-space enclosing spheres and their conservative surface gap.
 * anchors contains four THREE.Vector3 values in world coordinates for screen labels.
 * bounds is the exact analytic THREE.Box3 enclosing both spheres. No DOM or physics.
 */
export function createReachabilityVisual(proof) {
  validateComputedProof(proof);
  const anchors = {
    anchor: new THREE.Vector3(...proof.anchor),
    armBoundary: new THREE.Vector3(...proof.armBoundary),
    objectBoundary: new THREE.Vector3(...proof.objectBoundary),
    objectCenter: new THREE.Vector3(...proof.objectCenter),
  };
  const group = new THREE.Group();
  group.name = 'distance-prescreen-proof';
  group.userData = {
    physicsSteps: 0, anchorBody: proof.anchorBody, nativeGeometryCount: proof.nativeGeometryCount,
    description: 'Conservative geometry enclosures for all arm/hand postures, not the exact reachable workspace.',
  };
  group.add(
    enclosingSphere(anchors.anchor, proof.armRadiusM, ARM_COLOR, 'arm-hand-geometry-enclosure', 0.055),
    enclosingSphere(anchors.objectCenter, proof.objectRadiusM, OBJECT_COLOR, 'object-geometry-enclosure', 0.085),
    centerMarker(anchors.anchor, proof.armRadiusM, ARM_COLOR, 'arm-anchor-center'),
    centerMarker(anchors.objectCenter, proof.objectRadiusM, OBJECT_COLOR, 'object-center'),
  );

  // This static diagnostic ruler overlays scene occluders; it does not depict motion.
  const gap = new THREE.Line(new THREE.BufferGeometry().setFromPoints([anchors.armBoundary, anchors.objectBoundary]),
    new THREE.LineBasicMaterial({ color: GAP_COLOR, depthTest: false, depthWrite: false }));
  gap.name = 'conservative-surface-gap';
  gap.renderOrder = 14;
  group.add(gap);

  const direction = anchors.objectBoundary.clone().sub(anchors.armBoundary).normalize();
  const headLength = Math.min(0.075, proof.separationLowerBoundM / 4);
  const headGeometry = new THREE.ConeGeometry(headLength * 0.34, headLength, 16);
  const headMaterial = new THREE.MeshBasicMaterial({ color: GAP_COLOR, depthTest: false, depthWrite: false });
  const up = new THREE.Vector3(0, 1, 0);
  for (const [boundary, sign] of [[anchors.armBoundary, -1], [anchors.objectBoundary, 1]]) {
    const arrow = new THREE.Mesh(headGeometry, headMaterial);
    arrow.name = 'surface-gap-arrowhead';
    arrow.renderOrder = 14;
    const heading = direction.clone().multiplyScalar(sign);
    arrow.quaternion.setFromUnitVectors(up, heading);
    arrow.position.copy(boundary).addScaledVector(heading, -headLength / 2);
    group.add(arrow);
  }

  const bounds = new THREE.Box3();
  for (const [center, radius] of [[anchors.anchor, proof.armRadiusM], [anchors.objectCenter, proof.objectRadiusM]]) {
    bounds.expandByPoint(center.clone().addScalar(-radius));
    bounds.expandByPoint(center.clone().addScalar(radius));
  }
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set(), materials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    group.removeFromParent();
    group.clear();
  }
  return { group, bounds, anchors, dispose };
}
