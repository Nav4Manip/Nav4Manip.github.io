const SHA256 = /^[a-f\d]{64}$/i;
const WAM_PROTOCOL = 'wam_pick_lift_hold_v1';
const DEX_STATUSES = new Set(['success', 'planning_rejected', 'physics_failed', 'unknown']);
const WAM_STATUSES = new Set(['success', 'physics_failed', 'unknown']);
const DEX_ONLY_CODES = new Set(['ik_failed', 'prescreen_ik_failed', 'lift_ik_failed', 'lift_plan_failed', 'reach_rejected', 'prescreen_rejected']);
const vector = (value, size) => Array.isArray(value) && value.length === size && value.every(Number.isFinite);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
function requireValue(condition, message) { if (!condition) throw new TypeError(message); }
function text(value, label) { requireValue(typeof value === 'string' && value.trim(), `${label} must be nonempty.`); }
function hash(value, label) { requireValue(typeof value === 'string' && SHA256.test(value), `${label} must be a SHA-256 digest.`); }
function date(value, label) { requireValue(typeof value === 'string' && Number.isFinite(Date.parse(value)), `${label} must be a valid timestamp.`); }
function pose(value) { return vector(value, 7) && Math.hypot(...value.slice(3)) > 1e-8; }
export function validatePackagedPath(value) {
  requireValue(typeof value === 'string' && value.trim() && !/[\\%?#]/.test(value)
    && !value.startsWith('/') && !/^[a-z][a-z\d+.-]*:/i.test(value)
    && !value.split('/').some((part) => part === '..' || part === '.' || !part), 'Invalid packaged resource path.');
  return value;
}

/** Unknown observations stay in the denominator; bounds are not confidence intervals. */
export function rateStatistics(trials = []) {
  const attempts = trials.length;
  let successes = 0, failures = 0, unknown = 0;
  for (const trial of trials) {
    if (trial.status === 'success') successes++;
    else if (trial.status === 'planning_rejected' || trial.status === 'physics_failed') failures++;
    else unknown++;
  }
  const lowerRate = attempts ? successes / attempts : null;
  const upperRate = attempts ? (successes + unknown) / attempts : null;
  return { attempts, successes, failures, unknown, lowerRate, upperRate, rate: attempts && !unknown ? lowerRate : null };
}
const percent = (value) => (value * 100).toLocaleString('en-US', { maximumFractionDigits: 1 });
export function formatRate(stats) {
  if (!stats.attempts) return '—';
  return stats.unknown ? `${percent(stats.lowerRate)}–${percent(stats.upperRate)}%` : `${percent(stats.rate)}%`;
}

/** Unweighted endpoint-level comparison; never exclude an endpoint with unknown attempts. */
export function compareEndpointRates(dexonomyPoints, wamPoints) {
  const ids = [...new Set([...dexonomyPoints.map((point) => point.id), ...wamPoints.map((point) => point.id)])];
  const dex = new Map(dexonomyPoints.map((point) => [point.id, point]));
  const wam = new Map(wamPoints.map((point) => [point.id, point]));
  const pairs = ids.map((id) => ({ id, dexonomy: rateStatistics(dex.get(id)?.trials || []), wam: rateStatistics(wam.get(id)?.trials || []) }));
  const endpointCount = pairs.length;
  const missing = pairs.some((pair) => !pair.dexonomy.attempts || !pair.wam.attempts);
  const unknown = pairs.some((pair) => pair.dexonomy.unknown || pair.wam.unknown);
  let maeLowerPP = null, maeUpperPP = null, pearsonR = null, reason = null;
  if (endpointCount && !missing) {
    let lower = 0, upper = 0;
    for (const { dexonomy: a, wam: b } of pairs) {
      lower += Math.max(0, a.lowerRate - b.upperRate, b.lowerRate - a.upperRate);
      upper += Math.max(Math.abs(a.lowerRate - b.upperRate), Math.abs(a.upperRate - b.lowerRate));
    }
    maeLowerPP = lower / endpointCount * 100;
    maeUpperPP = upper / endpointCount * 100;
  }
  if (missing) reason = 'missing_rates';
  else if (unknown) reason = 'unknown_rates';
  else if (endpointCount < 3) reason = 'too_few_endpoints';
  else {
    const meanX = pairs.reduce((sum, pair) => sum + pair.dexonomy.rate, 0) / endpointCount;
    const meanY = pairs.reduce((sum, pair) => sum + pair.wam.rate, 0) / endpointCount;
    let covariance = 0, varianceX = 0, varianceY = 0;
    for (const pair of pairs) {
      const x = pair.dexonomy.rate - meanX, y = pair.wam.rate - meanY;
      covariance += x * y; varianceX += x * x; varianceY += y * y;
    }
    if (varianceX <= 1e-14 || varianceY <= 1e-14) reason = 'zero_variance';
    else pearsonR = Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceX * varianceY)));
  }
  return { pairs, endpointCount, pearsonR, reason, maeLowerPP, maeUpperPP };
}

function validatePoints(points, label, isWam, checkpointSha) {
  requireValue(Array.isArray(points) && points.length > 0, `${label}.points  invalid 。`);
  const ids = new Set();
  for (const point of points) {
    text(point?.id, `${label}.point.id`); text(point.label, `${label}.${point.id}.label`);
    requireValue(!ids.has(point.id), `${label} point id  invalid 。`); ids.add(point.id);
    requireValue(vector(point.position, 3) && Number.isFinite(point.yaw), `${label}.${point.id}  invalid  pose  invalid 。`);
    requireValue(Array.isArray(point.trials) && point.trials.length > 0, `${label}.${point.id}  invalid  pending  invalid 。`);
    const trialIds = new Set();
    for (const trial of point.trials) {
      text(trial?.id, `${point.id}.trial.id`);
      requireValue(!trialIds.has(trial.id), `${point.id} trial id  invalid 。`); trialIds.add(trial.id);
      requireValue((isWam ? WAM_STATUSES : DEX_STATUSES).has(trial.status), `${point.id}/${trial.id} status  invalid 。`);
      text(trial.reason, `${point.id}/${trial.id}.reason`);
      requireValue(object(trial.provenance), `${point.id}/${trial.id}  invalid  provenance。`);
      if (trial.file) validatePackagedPath(trial.file);
      if (isWam) {
        text(trial.label, `${trial.id}.label`);
        requireValue(Number.isSafeInteger(trial.seed) || trial.seed === null, `${trial.id}.seed  invalid  null。`);
        requireValue(typeof trial.executed === 'boolean' || trial.executed === null, `${trial.id}.executed  invalid 。`);
        requireValue(trial.protocol === WAM_PROTOCOL, `${trial.id} protocol  invalid  WAM  invalid 。`);
        requireValue(object(trial.outcome), `${trial.id}  invalid  outcome。`);
        for (const key of ['code', 'label', 'stage']) text(trial.outcome[key], `${trial.id}.outcome.${key}`);
        requireValue(!DEX_ONLY_CODES.has(trial.outcome.code) && !['pending', 'not_run', 'planned'].includes(trial.outcome.code), `${trial.id}  invalid  WAM  invalid  Dexonomy IK/ invalid 。`);
        requireValue(!('plannedLift' in trial) && !('grasp' in trial), `${trial.id} WAM  invalid  plannedLift  invalid 。`);
        requireValue(trial.status !== 'success' || trial.executed === true, `${trial.id}  invalid 。`);
        hash(trial.provenance.sourceResultSha256, `${trial.id}.sourceResultSha256`);
        requireValue(trial.provenance.checkpointSha256?.toLowerCase() === checkpointSha.toLowerCase(), `${trial.id} checkpoint  invalid 。`);
        requireValue(['recorded', 'summary_only', 'unavailable'].includes(trial.replayAvailability), `${trial.id}.replayAvailability  invalid 。`);
        requireValue(Boolean(trial.file) === (trial.replayAvailability === 'recorded'), `${trial.id}  invalid  file  invalid  availability  invalid 。`);
        if (trial.file) hash(trial.provenance.sourceTraceSha256, `${trial.id}.sourceTraceSha256`);
      }
    }
    if (point.defaultTrialId !== undefined) requireValue(trialIds.has(point.defaultTrialId), `${point.id}.defaultTrialId  invalid 。`);
  }
}
function sameEndpoints(a, b, label) {
  requireValue(a.length === b.length, `${label} endpoint  invalid 。`);
  for (const point of a) {
    const other = b.find((entry) => entry.id === point.id);
    const yaw = other ? Math.atan2(Math.sin(point.yaw - other.yaw), Math.cos(point.yaw - other.yaw)) : Infinity;
    requireValue(other && point.position.every((value, i) => Math.abs(value - other.position[i]) <= 1e-8)
      && Math.abs(yaw) <= 1e-8, `${label} ${point.id} pose  invalid 。`);
  }
}
export function validateEvaluationPayload(raw, baseManifest) {
  requireValue(object(raw) && raw.schema === 'robot.wam-evaluation/v1', 'WAM evaluation schema  invalid 。');
  const payload = structuredClone(raw);
  text(payload.title, 'title'); text(payload.model?.id, 'model.id'); text(payload.model?.label, 'model.label');
  text(payload.model.checkpoint?.path, 'checkpoint.path'); hash(payload.model.checkpoint?.sha256, 'checkpoint.sha256');
  requireValue(payload.model.checkpoint.step === 20000, 'checkpoint.step  invalid  20k  invalid 。');
  const protocol = payload.protocol;
  requireValue(object(protocol) && protocol.id === WAM_PROTOCOL, 'WAM protocol id  invalid 。');
  text(protocol.description, 'protocol.description'); date(protocol.frozenAtUTC, 'protocol.frozenAtUTC'); hash(protocol.sha256, 'protocol.sha256');
  for (const [key, expected] of Object.entries({ policySearchBudgetS: 60, maxDurationS: 60.5, triggerContinuousS: 0.2,
    holdLastCommandS: 0.5, terminalContinuousS: 0.2, minGapM: 0.03, minConservativeMinZM: 0.03,
    collisionRequired: true, leftSupportForbidden: true, leftSupportThresholdN: 1 })) {
    requireValue(protocol[key] === expected, `protocol.${key}  invalid 。`);
  }
  requireValue(object(payload.provenance), 'WAM  invalid  provenance。');
  requireValue(Array.isArray(payload.sets) && payload.sets.length, 'WAM sets  invalid 。');
  const ids = new Set(); let originals = 0;
  for (const set of payload.sets) {
    text(set?.id, 'set.id'); text(set.label, 'set.label'); requireValue(!ids.has(set.id), 'set id  invalid 。'); ids.add(set.id);
    requireValue(['original', 'additional_frozen'].includes(set.role), 'set role  invalid 。');
    requireValue(set.frozen?.discoveryExcluded === true, ' invalid  discovery  invalid 。');
    date(set.frozen.atUTC, 'set.frozen.atUTC'); hash(set.frozen.positionsSha256, 'set.frozen.positionsSha256'); text(set.frozen.selectionNote, 'set.frozen.selectionNote');
    validatePoints(set.points, `set ${set.id} WAM`, true, payload.model.checkpoint.sha256);
    if (set.role === 'original') {
      originals++;
      requireValue(set.baseline?.source === 'manifest', ' invalid  manifest Dexonomy  invalid 。');
      sameEndpoints(set.points, baseManifest.points, set.id);
    } else {
      requireValue(set.baseline?.source === 'embedded', ' invalid  set  invalid  Dexonomy  invalid 。');
      validatePoints(set.baseline.points, `set ${set.id} Dexonomy`, false);
      sameEndpoints(set.points, set.baseline.points, set.id);
    }
  }
  requireValue(originals === 1, ' invalid  set。');
  return payload;
}

export function validateWamTrajectory(raw, checkpointSha) {
  requireValue(object(raw) && !('plannedLift' in raw), 'WAM  invalid  actual58， invalid  plannedLift  invalid 。');
  const count = raw.timestamps?.length;
  requireValue(Array.isArray(raw.timestamps) && count > 0 && raw.timestamps.every((time, i) => Number.isFinite(time) && (!i || time > raw.timestamps[i - 1])), 'WAM timestamps  invalid 。');
  requireValue(Array.isArray(raw.joints) && raw.joints.length === count && raw.joints.every((row) => vector(row, 58)), 'WAM  invalid  58  invalid 。');
  for (const key of ['object', 'ee']) requireValue(Array.isArray(raw[key]) && raw[key].length === count && raw[key].every(pose), `WAM ${key}  invalid 。`);
  const validBase = Array.isArray(raw.base) && raw.base.length === count && raw.base.every(pose);
  requireValue((raw.basePose === undefined || pose(raw.basePose)) && (raw.base === undefined || validBase)
    && (pose(raw.basePose) || validBase), 'WAM  invalid  EG base pose  invalid 。');
  const provenance = raw.provenance;
  requireValue(provenance?.stateSource === 'actual58' && provenance.resampled === false && provenance.eeLink === 'right_hand_C_MC', 'WAM  invalid /actual58  invalid 。');
  requireValue(provenance.checkpointSha256?.toLowerCase() === checkpointSha.toLowerCase(), 'WAM replay checkpoint  invalid 。');
  hash(provenance.sourceTraceSha256, 'replay.sourceTraceSha256');
  for (const [key, type] of [['handObjectContact', 'boolean'], ['conservativeMinZAboveTableM', 'number']]) {
    const values = raw.measurements?.[key];
    requireValue(Array.isArray(values) && values.length === count && values.every((value) => type === 'boolean' ? typeof value === 'boolean' : Number.isFinite(value)), `WAM  invalid  ${key}  invalid 。`);
  }
  const measurements = raw.measurements, truth = measurements.gapTruth;
  if (truth !== undefined) requireValue(Array.isArray(truth) && truth.length === count
    && truth.every((value) => [-1, 0, 1].includes(value)), 'WAM gapTruth  invalid  -1/0/1  invalid 。');
  for (const key of ['objectTableGapM', 'objectTableGapUpperM']) {
    if (key === 'objectTableGapUpperM' && measurements[key] === undefined) continue;
    const values = measurements[key];
    requireValue(Array.isArray(values) && values.length === count
      && values.every((value, i) => Number.isFinite(value) || (value === null && truth?.[i] === -1)),
    `WAM  invalid  ${key}  invalid ；null  invalid  gapTruth=-1。`);
  }
  if (measurements.conservativeMinZAboveTableUpperM !== undefined) requireValue(
    Array.isArray(measurements.conservativeMinZAboveTableUpperM) && measurements.conservativeMinZAboveTableUpperM.length === count
      && measurements.conservativeMinZAboveTableUpperM.every(Number.isFinite), 'WAM  invalid  conservativeMinZAboveTableUpperM  invalid 。');
  return raw;
}

export function hasIncompleteGapMeasurements(trajectory) {
  return ['objectTableGapM', 'objectTableGapUpperM'].some((key) => trajectory?.measurements?.[key]?.some((value) => value === null));
}

export function createEvaluationSession(baseManifest, rawPayload, options = {}) {
  const payload = validateEvaluationPayload(rawPayload, baseManifest);
  let model = 'dexonomy', setId = payload.sets.find((set) => set.role === 'original').id, scope = options.scope ?? 'equal20', revision = 0;
  const validScope = (value) => requireValue(['equal20', 'full'].includes(value), 'Unknown record scope.');
  validScope(scope);
  const namespace = () => `${payload.model.id}/${setId}/${model}/${scope}`;
  const projections = new WeakMap();
  function project(fullPoints) {
    if (!projections.has(fullPoints)) projections.set(fullPoints, {});
    const cached = projections.get(fullPoints);
    if (cached[scope]) return cached[scope];
    const metadata = fullPoints.map((point) => {
      const sourceCount = point.trials.length;
      // Selection uses only the frozen array order and length, never outcomes or seeds.
      const indices = scope === 'equal20' && sourceCount >= 20
        ? Array.from({ length: 20 }, (_, i) => Math.floor(i * (sourceCount - 1) / 19))
        : Array.from({ length: sourceCount }, (_, i) => i);
      return { id: point.id, sourceCount, selectedCount: indices.length, indices, complete: scope === 'full' || sourceCount >= 20 };
    });
    const points = scope === 'full' ? fullPoints : fullPoints.map((point, i) => {
      const selection = metadata[i], trials = selection.indices.map((index) => point.trials[index]);
      return { ...point, trials, selection,
        description: ` invalid ：${trials.length} / ${selection.sourceCount}  invalid ${selection.complete ? '' : '； invalid  20  invalid ， invalid '}。 invalid ， invalid ； invalid 。`,
        statistics: { ...rateStatistics(trials), metric: ' invalid  /  invalid （ invalid ）',
          note: ' invalid ； invalid 。' },
      };
    });
    return cached[scope] = { points, metadata };
  }
  function view() {
    const set = payload.sets.find((entry) => entry.id === setId);
    const fullBaselinePoints = set.baseline.source === 'manifest' ? baseManifest.points : set.baseline.points;
    const baseline = project(fullBaselinePoints), wam = project(set.points);
    const baselinePoints = baseline.points, wamPoints = wam.points;
    const isWam = model === 'wam', isOriginalDexonomy = !isWam && set.role === 'original' && scope === 'full';
    const manifest = isOriginalDexonomy ? baseManifest : { ...baseManifest,
      title: isWam ? `${baseManifest.title} · WAM` : baseManifest.title,
      description: `${set.label} · ${isWam ? payload.model.label : 'Dexonomy'} · ${scope === 'equal20' ? ' invalid  20  invalid （ invalid ）' : ' invalid '}`,
      points: isWam ? wamPoints : baselinePoints,
      provenance: { source: payload.provenance, model: isWam ? payload.model : 'Dexonomy', protocol: isWam ? payload.protocol : 'pick_lift_hold_v1', frozen: set.frozen },
    };
    const selection = { scope, target: scope === 'equal20' ? 20 : null,
      rule: scope === 'full' ? ' invalid ： invalid ' : 'floor(i*(n-1)/19), i=0..19； invalid ；n<20  invalid ',
      dexonomy: baseline.metadata, wam: wam.metadata, complete: [...baseline.metadata, ...wam.metadata].every((point) => point.complete) };
    return { model, setId, scope, set, manifest, baselinePoints, wamPoints, fullBaselinePoints, fullWamPoints: set.points,
      fullPoints: isWam ? set.points : fullBaselinePoints, selection, isWam, isOriginalDexonomy,
      source: isWam ? 'actual' : 'planned', datasetKey: namespace(), fixture: payload.fixture === true, payload };
  }
  return {
    view,
    select(nextModel, nextSetId = setId, nextScope = scope) {
      requireValue(['dexonomy', 'wam'].includes(nextModel), 'Unknown model.');
      requireValue(payload.sets.some((set) => set.id === nextSetId), 'Unknown pose set.');
      validScope(nextScope);
      model = nextModel; setId = nextSetId; scope = nextScope; revision++; return view();
    },
    capture: () => ({ revision, datasetKey: namespace() }),
    isCurrent: (ticket) => ticket?.revision === revision && ticket.datasetKey === namespace(),
    cacheKey: (pointId, trialId) => `${namespace()}/${pointId}/${trialId}`,
  };
}
