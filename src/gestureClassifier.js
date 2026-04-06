import { averagePoint, calculateAngle, distance2D } from './utils.js';

export const GESTURE_THRESHOLDS = {
  // Main gesture-tuning section:
  // Raise or lower these values to make finger extension checks stricter or looser.
  fingerStraightAngle: 160,
  fingerReachRatio: 1.18,
  fingerLiftPadding: 0.015,
  thumbStraightAngle: 150,
  thumbSpreadRatio: 1.08,
  thumbHorizontalPadding: 0.015,
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

function getPalmCenter(landmarks) {
  return averagePoint([landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]]);
}

function isFingerExtended(landmarks, fingerKey, thresholds = GESTURE_THRESHOLDS) {
  const { tip, pip, mcp } = FINGER_POINTS[fingerKey];
  const tipPoint = landmarks[tip];
  const pipPoint = landmarks[pip];
  const mcpPoint = landmarks[mcp];
  const palmCenter = getPalmCenter(landmarks);

  const angle = calculateAngle(tipPoint, pipPoint, mcpPoint);
  const reachRatio =
    distance2D(tipPoint, palmCenter) / Math.max(distance2D(pipPoint, palmCenter), 0.0001);
  const lifted = tipPoint.y < pipPoint.y - thresholds.fingerLiftPadding;

  return angle > thresholds.fingerStraightAngle && reachRatio > thresholds.fingerReachRatio && lifted;
}

function isThumbExtended(landmarks, handedness = 'Right', thresholds = GESTURE_THRESHOLDS) {
  const { tip, pip, mcp, anchor } = FINGER_POINTS.thumb;
  const tipPoint = landmarks[tip];
  const ipPoint = landmarks[pip];
  const mcpPoint = landmarks[mcp];
  const anchorPoint = landmarks[anchor];
  const angle = calculateAngle(tipPoint, ipPoint, mcpPoint);
  const spreadRatio =
    distance2D(tipPoint, anchorPoint) / Math.max(distance2D(mcpPoint, anchorPoint), 0.0001);
  const isRightHand = handedness === 'Right';
  const horizontalSpread = isRightHand
    ? tipPoint.x < ipPoint.x - thresholds.thumbHorizontalPadding
    : tipPoint.x > ipPoint.x + thresholds.thumbHorizontalPadding;

  return angle > thresholds.thumbStraightAngle && spreadRatio > thresholds.thumbSpreadRatio && horizontalSpread;
}

export function getFingerStates(landmarks, handedness, thresholds = GESTURE_THRESHOLDS) {
  return {
    thumb: isThumbExtended(landmarks, handedness, thresholds),
    index: isFingerExtended(landmarks, 'index', thresholds),
    middle: isFingerExtended(landmarks, 'middle', thresholds),
    ring: isFingerExtended(landmarks, 'ring', thresholds),
    pinky: isFingerExtended(landmarks, 'pinky', thresholds),
  };
}

export function classifyGesture(landmarks, handedness, thresholds = GESTURE_THRESHOLDS) {
  const fingerStates = getFingerStates(landmarks, handedness, thresholds);
  const extendedLongFingers = ['index', 'middle', 'ring', 'pinky'].filter(
    (fingerKey) => fingerStates[fingerKey],
  );

  let rawGesture = 'UNKNOWN';

  if (
    !fingerStates.thumb &&
    extendedLongFingers.length === 0
  ) {
    rawGesture = 'CLOSED_FIST';
  } else if (
    fingerStates.index &&
    fingerStates.middle &&
    fingerStates.ring &&
    fingerStates.pinky &&
    (fingerStates.thumb || extendedLongFingers.length === 4)
  ) {
    rawGesture = 'OPEN_PALM';
  } else if (
    fingerStates.index &&
    !fingerStates.middle &&
    !fingerStates.ring &&
    !fingerStates.pinky
  ) {
    rawGesture = 'INDEX_ONLY';
  } else if (
    fingerStates.index &&
    fingerStates.middle &&
    !fingerStates.ring &&
    !fingerStates.pinky
  ) {
    rawGesture = 'INDEX_MIDDLE';
  }

  return {
    rawGesture,
    rawGestureLabel: RAW_GESTURE_LABELS[rawGesture],
    spell: GESTURE_TO_SPELL[rawGesture] ?? null,
    fingerStates,
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
