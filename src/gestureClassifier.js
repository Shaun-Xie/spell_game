import { averagePoint, calculateAngle, distance2D } from './utils.js';

export const GESTURE_THRESHOLDS = {
  // Main gesture-tuning section:
  // Raise or lower these values to make finger extension checks stricter or looser.
  fingerStraightAngle: 158,
  fingerReachRatio: 1.16,
  fingerWristReachRatio: 1.12,
  relaxedFingerStraightAngle: 146,
  relaxedFingerReachRatio: 1.1,
  relaxedFingerWristReachRatio: 1.05,
  thumbStraightAngle: 146,
  thumbReachRatio: 1.1,
  thumbSpreadRatio: 1.18,
  thumbHorizontalPadding: 0.018,
  thumbAnchorTravel: 0.015,
  relaxedThumbStraightAngle: 136,
  relaxedThumbReachRatio: 1.04,
  relaxedThumbSpreadRatio: 1.08,
  relaxedThumbHorizontalPadding: 0.01,
  openPalmFingerSpreadRatio: 1.58,
  openPalmAverageTipDistanceRatio: 1.36,
  openPalmSupportTipDistanceRatio: 1.24,
  fistTipClusterRatio: 1.32,
  fistFingerSpreadRatio: 1.45,
};

export const STABILITY_SETTINGS = {
  // Temporal smoothing and cooldown tuning live here.
  framesForConfirmation: 4,
  cooldownMs: 800,
};

export const RAW_GESTURE_LABELS = {
  NO_HAND: 'No hand detected',
  UNKNOWN: 'Unmapped pose',
  CLOSED_FIST: 'Closed fist',
  OPEN_PALM: 'Open palm',
  INDEX_ONLY: 'Index finger only',
  INDEX_MIDDLE: 'Index + middle fingers',
};

export const GESTURE_TO_SPELL = {
  CLOSED_FIST: 'Fireball',
  OPEN_PALM: 'Shield',
  INDEX_ONLY: 'Lightning',
  INDEX_MIDDLE: 'Heal',
};

const FINGER_POINTS = {
  thumb: { tip: 4, pip: 3, mcp: 2, anchor: 5 },
  index: { tip: 8, pip: 6, mcp: 5 },
  middle: { tip: 12, pip: 10, mcp: 9 },
  ring: { tip: 16, pip: 14, mcp: 13 },
  pinky: { tip: 20, pip: 18, mcp: 17 },
};

const LONG_FINGER_KEYS = ['index', 'middle', 'ring', 'pinky'];

function getPalmCenter(landmarks) {
  return averagePoint([landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]]);
}

function createRatio(numerator, denominator) {
  return numerator / Math.max(denominator, 0.0001);
}

function normalizeX(point, handedness) {
  return handedness === 'Right' ? 1 - point.x : point.x;
}

function getHandGeometry(landmarks, handedness) {
  const wrist = landmarks[0];
  const palmCenter = getPalmCenter(landmarks);
  const palmWidth = distance2D(landmarks[5], landmarks[17]);
  const palmHeight = distance2D(wrist, landmarks[9]);
  const palmSize = Math.max(palmWidth, palmHeight, 0.0001);

  return {
    wrist,
    palmCenter,
    palmWidth,
    palmHeight,
    palmSize,
    handedness,
  };
}

function getFingerMetrics(landmarks, fingerKey, geometry, thresholds = GESTURE_THRESHOLDS) {
  const { tip, pip, mcp } = FINGER_POINTS[fingerKey];
  const tipPoint = landmarks[tip];
  const pipPoint = landmarks[pip];
  const mcpPoint = landmarks[mcp];
  const { palmCenter, wrist } = geometry;

  const angle = calculateAngle(tipPoint, pipPoint, mcpPoint);
  const palmReachRatio = createRatio(
    distance2D(tipPoint, palmCenter),
    distance2D(pipPoint, palmCenter),
  );
  const wristReachRatio = createRatio(
    distance2D(tipPoint, wrist),
    distance2D(pipPoint, wrist),
  );
  const tipDistanceRatio = createRatio(distance2D(tipPoint, palmCenter), geometry.palmSize);
  const extended =
    angle >= thresholds.fingerStraightAngle &&
    palmReachRatio >= thresholds.fingerReachRatio &&
    wristReachRatio >= thresholds.fingerWristReachRatio;
  const relaxedExtended =
    angle >= thresholds.relaxedFingerStraightAngle &&
    palmReachRatio >= thresholds.relaxedFingerReachRatio &&
    wristReachRatio >= thresholds.relaxedFingerWristReachRatio;

  return {
    angle,
    palmReachRatio,
    wristReachRatio,
    tipDistanceRatio,
    extended,
    relaxedExtended,
  };
}

function getThumbMetrics(landmarks, geometry, thresholds = GESTURE_THRESHOLDS) {
  const { tip, pip, mcp, anchor } = FINGER_POINTS.thumb;
  const tipPoint = landmarks[tip];
  const ipPoint = landmarks[pip];
  const mcpPoint = landmarks[mcp];
  const anchorPoint = landmarks[anchor];
  const canonicalTipX = normalizeX(tipPoint, geometry.handedness);
  const canonicalIpX = normalizeX(ipPoint, geometry.handedness);
  const canonicalAnchorX = normalizeX(anchorPoint, geometry.handedness);
  const angle = calculateAngle(tipPoint, ipPoint, mcpPoint);
  const spreadRatio = createRatio(
    distance2D(tipPoint, anchorPoint),
    distance2D(mcpPoint, anchorPoint),
  );
  const palmReachRatio = createRatio(
    distance2D(tipPoint, geometry.palmCenter),
    distance2D(ipPoint, geometry.palmCenter),
  );
  const horizontalTravel = canonicalTipX - canonicalIpX;
  const anchorTravel = canonicalTipX - canonicalAnchorX;
  const extended =
    angle >= thresholds.thumbStraightAngle &&
    palmReachRatio >= thresholds.thumbReachRatio &&
    spreadRatio >= thresholds.thumbSpreadRatio &&
    horizontalTravel >= thresholds.thumbHorizontalPadding &&
    anchorTravel >= thresholds.thumbAnchorTravel;
  const relaxedExtended =
    angle >= thresholds.relaxedThumbStraightAngle &&
    palmReachRatio >= thresholds.relaxedThumbReachRatio &&
    spreadRatio >= thresholds.relaxedThumbSpreadRatio &&
    horizontalTravel >= thresholds.relaxedThumbHorizontalPadding;

  return {
    angle,
    spreadRatio,
    palmReachRatio,
    horizontalTravel,
    anchorTravel,
    extended,
    relaxedExtended,
  };
}

export function getFingerStates(landmarks, handedness, thresholds = GESTURE_THRESHOLDS) {
  const geometry = getHandGeometry(landmarks, handedness);
  const fingerMetrics = {
    thumb: getThumbMetrics(landmarks, geometry, thresholds),
    index: getFingerMetrics(landmarks, 'index', geometry, thresholds),
    middle: getFingerMetrics(landmarks, 'middle', geometry, thresholds),
    ring: getFingerMetrics(landmarks, 'ring', geometry, thresholds),
    pinky: getFingerMetrics(landmarks, 'pinky', geometry, thresholds),
  };

  return {
    thumb: fingerMetrics.thumb.extended,
    index: fingerMetrics.index.extended,
    middle: fingerMetrics.middle.extended,
    ring: fingerMetrics.ring.extended,
    pinky: fingerMetrics.pinky.extended,
    metrics: fingerMetrics,
    geometry,
  };
}

export function classifyGesture(landmarks, handedness, thresholds = GESTURE_THRESHOLDS) {
  const fingerStateBundle = getFingerStates(landmarks, handedness, thresholds);
  const { geometry, metrics } = fingerStateBundle;
  const fingerStates = {
    thumb: fingerStateBundle.thumb,
    index: fingerStateBundle.index,
    middle: fingerStateBundle.middle,
    ring: fingerStateBundle.ring,
    pinky: fingerStateBundle.pinky,
  };
  const extendedLongFingers = LONG_FINGER_KEYS.filter(
    (fingerKey) => fingerStates[fingerKey],
  );
  const relaxedLongFingers = LONG_FINGER_KEYS.filter(
    (fingerKey) => metrics[fingerKey].relaxedExtended,
  );
  const averageLongFingerTipDistanceRatio =
    LONG_FINGER_KEYS.reduce((total, fingerKey) => total + metrics[fingerKey].tipDistanceRatio, 0) /
    LONG_FINGER_KEYS.length;
  const fingerFanSpreadRatio = createRatio(
    distance2D(landmarks[FINGER_POINTS.index.tip], landmarks[FINGER_POINTS.pinky.tip]),
    geometry.palmWidth,
  );
  const ringReadyForOpenPalm =
    metrics.ring.relaxedExtended ||
    metrics.ring.tipDistanceRatio >= thresholds.openPalmSupportTipDistanceRatio;
  const pinkyReadyForOpenPalm =
    metrics.pinky.relaxedExtended ||
    metrics.pinky.tipDistanceRatio >= thresholds.openPalmSupportTipDistanceRatio;
  const openPalmFingerConfidence =
    extendedLongFingers.length >= 3 || metrics.thumb.relaxedExtended;

  const looksLikeOpenPalm =
    openPalmFingerConfidence &&
    metrics.index.extended &&
    metrics.middle.extended &&
    ringReadyForOpenPalm &&
    pinkyReadyForOpenPalm &&
    fingerFanSpreadRatio >= thresholds.openPalmFingerSpreadRatio &&
    averageLongFingerTipDistanceRatio >= thresholds.openPalmAverageTipDistanceRatio;

  const looksLikeClosedFist =
    extendedLongFingers.length === 0 &&
    !metrics.thumb.relaxedExtended &&
    averageLongFingerTipDistanceRatio <= thresholds.fistTipClusterRatio &&
    fingerFanSpreadRatio <= thresholds.fistFingerSpreadRatio;

  let rawGesture = 'UNKNOWN';

  if (looksLikeClosedFist) {
    rawGesture = 'CLOSED_FIST';
  } else if (looksLikeOpenPalm) {
    rawGesture = 'OPEN_PALM';
  } else if (
    fingerStates.index &&
    !metrics.middle.relaxedExtended &&
    !metrics.ring.relaxedExtended &&
    !metrics.pinky.relaxedExtended
  ) {
    rawGesture = 'INDEX_ONLY';
  } else if (
    fingerStates.index &&
    fingerStates.middle &&
    !metrics.ring.relaxedExtended &&
    !metrics.pinky.relaxedExtended
  ) {
    rawGesture = 'INDEX_MIDDLE';
  }

  return {
    rawGesture,
    rawGestureLabel: RAW_GESTURE_LABELS[rawGesture],
    spell: GESTURE_TO_SPELL[rawGesture] ?? null,
    fingerStates,
    diagnostics: {
      geometry,
      relaxedLongFingers,
      averageLongFingerTipDistanceRatio,
      fingerFanSpreadRatio,
      metrics,
    },
  };
}

export function createGestureController(customSettings = {}) {
  const settings = { ...STABILITY_SETTINGS, ...customSettings };
  let lastObservedGesture = 'NO_HAND';
  let consecutiveFrames = 0;
  let requireReleaseForGesture = null;
  const lastCastAtByGesture = {};
  let lastCast = {
    spell: null,
    gesture: null,
    at: -Infinity,
  };

  function updateTemporalState(rawGesture, classification, now) {
    if (rawGesture === lastObservedGesture) {
      consecutiveFrames += 1;
    } else {
      lastObservedGesture = rawGesture;
      consecutiveFrames = rawGesture === 'NO_HAND' ? 0 : 1;
    }

    if (requireReleaseForGesture && rawGesture !== requireReleaseForGesture) {
      requireReleaseForGesture = null;
    }

    const stableGesture =
      GESTURE_TO_SPELL[rawGesture] && consecutiveFrames >= settings.framesForConfirmation
        ? rawGesture
        : null;
    const stableSpell = stableGesture ? GESTURE_TO_SPELL[stableGesture] : null;

    const cooldownGesture = stableGesture ?? lastCast.gesture;
    const cooldownSpell = stableSpell ?? lastCast.spell;
    const cooldownEndsAt = cooldownGesture
      ? (lastCastAtByGesture[cooldownGesture] ?? -Infinity) + settings.cooldownMs
      : -Infinity;
    const cooldownRemainingMs = Math.max(0, cooldownEndsAt - now);

    let confirmedSpell = null;

    if (stableGesture && !requireReleaseForGesture && cooldownRemainingMs === 0) {
      confirmedSpell = stableSpell;
      lastCastAtByGesture[stableGesture] = now;
      lastCast = {
        spell: stableSpell,
        gesture: stableGesture,
        at: now,
      };
      requireReleaseForGesture = stableGesture;
    }

    return {
      ...classification,
      rawGesture,
      rawGestureLabel: RAW_GESTURE_LABELS[rawGesture],
      stableGesture,
      stableSpell,
      confirmedSpell,
      framesHeld: consecutiveFrames,
      cooldown: {
        gesture: cooldownGesture,
        spell: cooldownSpell,
        remainingMs: Math.max(
          0,
          ((stableGesture ? lastCastAtByGesture[stableGesture] : lastCast.at) ?? -Infinity) +
            settings.cooldownMs -
            now,
        ),
        ready:
          Math.max(
            0,
            ((stableGesture ? lastCastAtByGesture[stableGesture] : lastCast.at) ?? -Infinity) +
              settings.cooldownMs -
              now,
          ) === 0,
      },
    };
  }

  function evaluate(landmarks, handedness, now = performance.now()) {
    const classification = classifyGesture(landmarks, handedness);
    return updateTemporalState(classification.rawGesture, classification, now);
  }

  function observeNoHand(now = performance.now()) {
    return updateTemporalState(
      'NO_HAND',
      {
        fingerStates: {
          thumb: false,
          index: false,
          middle: false,
          ring: false,
          pinky: false,
        },
        spell: null,
      },
      now,
    );
  }

  return {
    evaluate,
    observeNoHand,
    settings,
  };
}
