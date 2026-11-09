const MIN_CLEARANCE_M = 0.03;
const MAX_CONTINUOUS_INTERVAL_S = 0.020001;

/** Analyze native contact and clearance measurements without resampling poses. */
export function analyzePhysics(trajectory) {
  const timestamps = trajectory?.timestamps;
  const measurements = trajectory?.measurements;
  const contacts = measurements?.handObjectContact;
  const gaps = measurements?.objectTableGapM;
  const minZs = measurements?.conservativeMinZAboveTableM;
  if (!Array.isArray(timestamps) || timestamps.length === 0
      || !Array.isArray(contacts) || !Array.isArray(gaps) || !Array.isArray(minZs)
      || contacts.length !== timestamps.length || gaps.length !== timestamps.length
      || minZs.length !== timestamps.length) {
    return null;
  }

  const samples = [];
  let firstContactIndex = null;
  let lastContactIndex = null;
  let peakGapIndex = 0;
  let peakMinZIndex = 0;
  let maxGapM = -Infinity;
  let maxConservativeMinZM = -Infinity;
  let longestHoldS = 0;
  let contactSampleCount = 0;
  let qualifiedSampleCount = 0;
  let holdStartTimeS = null;

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index];
    const contact = contacts[index];
    const gapM = gaps[index];
    const minZM = minZs[index];
    if (!Number.isFinite(timestamp) || typeof contact !== 'boolean'
        || !Number.isFinite(gapM) || !Number.isFinite(minZM)
        || (index > 0 && timestamp <= timestamps[index - 1])) {
      return null;
    }

    if (contact) {
      if (firstContactIndex === null) firstContactIndex = index;
      lastContactIndex = index;
      contactSampleCount += 1;
    }
    if (gapM > maxGapM) {
      maxGapM = gapM;
      peakGapIndex = index;
    }
    if (minZM > maxConservativeMinZM) {
      maxConservativeMinZM = minZM;
      peakMinZIndex = index;
    }

    const qualified = contact && gapM >= MIN_CLEARANCE_M && minZM >= MIN_CLEARANCE_M;
    let holdS = 0;
    if (qualified) {
      qualifiedSampleCount += 1;
      if (holdStartTimeS === null
          || timestamp - timestamps[index - 1] > MAX_CONTINUOUS_INTERVAL_S) {
        holdStartTimeS = timestamp;
      }
      // Native segment endpoints define elapsed hold time; one sample is 0 s.
      holdS = timestamp - holdStartTimeS;
      longestHoldS = Math.max(longestHoldS, holdS);
    } else {
      holdStartTimeS = null;
    }
    samples.push({
      index,
      timeS: timestamp - timestamps[0],
      contact,
      gapM,
      minZM,
      qualified,
      holdS,
    });
  }

  return {
    samples,
    durationS: timestamps[timestamps.length - 1] - timestamps[0],
    firstContactIndex,
    lastContactIndex,
    peakGapIndex,
    peakMinZIndex,
    maxGapM,
    maxConservativeMinZM,
    longestHoldS,
    terminalHoldS: samples[samples.length - 1].holdS,
    contactSampleCount,
    qualifiedSampleCount,
  };
}

/** Return the native measurement at or before timeS, clamped to the trace. */
export function physicsFrameAt(analysis, timeS) {
  const samples = analysis?.samples;
  if (!Array.isArray(samples) || samples.length === 0
      || typeof timeS !== 'number' || Number.isNaN(timeS)) {
    return null;
  }
  if (timeS <= samples[0].timeS) return samples[0];
  if (timeS >= samples[samples.length - 1].timeS) return samples[samples.length - 1];

  let low = 0;
  let high = samples.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (samples[mid].timeS <= timeS) low = mid + 1;
    else high = mid - 1;
  }
  return samples[high];
}
