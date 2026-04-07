import { averagePoint, calculateAngle, distance2D } from './utils.js';

export const GESTURE_MODES = Object.freeze({
  LEGACY_ONE_HAND: 'legacy_one_hand',
  TWO_HAND: 'two_hand',
});

// Active gesture mode switch:
// set this to GESTURE_MODES.TWO_HAND to re-enable the preserved pair-casting system.
export const GESTURE_MODE = GESTURE_MODES.LEGACY_ONE_HAND;

export const GESTURE_THRESHOLDS = {
  // Shared per-hand tuning for finger states.
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
  openLikeAverageTipDistanceRatio: 1.12,
  openLikeMinimumRelaxedFingers: 2,
  threeFingerAverageTipDistanceRatio: 1.16,
  threeFingerFanSpreadRatio: 1.08,
  thumbsUpThumbAngleMin: 138,
  thumbsUpThumbReachRatioMin: 1.08,
  thumbsUpThumbSpreadRatioMin: 1.04,
  thumbsUpThumbTipDistanceRatioMin: 1.05,
  thumbsUpNonThumbAverageTipDistanceRatioMax: 1.02,
  thumbsUpNonThumbFanSpreadRatioMax: 1.34,
  fistTipClusterRatio: 1.32,
  fistFingerSpreadRatio: 1.45,
};

export const TWO_HAND_THRESHOLDS = {
  // Pair-level spell tuning.
  prayerPalmDistanceRatio: 1.22,
  prayerTipAlignmentRatio: 0.58,
  prayerVerticalOffsetRatio: 0.42,
  prayerWristDistanceRatioMin: 0.78,
  fireballChargeDistanceRatio: 1.16,
  fireballPalmDistanceRatio: 1.3,
  blockPalmDistanceRatioMin: 1.12,
  blockPalmDistanceRatioMax: 3.6,
  blockVerticalOffsetRatio: 1.08,
  lightningPalmDistanceRatioMin: 0.85,
  lightningPalmDistanceRatioMax: 4.5,
};

export const STABILITY_SETTINGS = {
  framesForConfirmation: 4,
  cooldownMs: 800,
};

export const RAW_GESTURE_LABELS = {
  NO_HAND: 'No hand detected',
  UNKNOWN: 'Unmapped pose',
  CLOSED_FIST: 'Closed fist',
  THUMBS_UP: 'Thumbs up',
  OPEN_PALM: 'Open palm',
  INDEX_ONLY: 'Index finger only',
  THREE_FINGER: 'Three-finger pose',
  INDEX_MIDDLE: 'Index + middle fingers',
};

export const LEGACY_GESTURE_TO_SPELL = {
  CLOSED_FIST: 'Fireball',
  THUMBS_UP: 'Block',
  INDEX_ONLY: 'Lightning',
  INDEX_MIDDLE: 'Heal',
};

const MODE_LABELS = {
  [GESTURE_MODES.LEGACY_ONE_HAND]: 'Legacy one-hand',
  [GESTURE_MODES.TWO_HAND]: 'Two-hand arcana',
};

const HAND_STATE_LABELS = {
  OPEN: 'Open hand',
  FIST: 'Fist',
  THREE_FINGER: 'Three-finger pose',
  THUMBS_UP: 'Thumbs up',
  RELAXED: 'Relaxed / unknown',
};

const TWO_HAND_CANDIDATE_LABELS = {
  WAITING_FOR_HANDS: 'No hands detected',
  WAITING_FOR_SECOND_HAND: 'Need two hands',
  AMBIGUOUS_PAIR: 'No pair spell',
  PRAYER_POSE: 'Prayer pose',
  FIREBALL_CHARGE: 'Fist into open hand',
  LIGHTNING_ARC: 'Double three-finger',
  BLOCK_WARD: 'Two open hands',
};

const TWO_HAND_GESTURE_TO_SPELL = {
  PRAYER_POSE: 'Heal',
  FIREBALL_CHARGE: 'Fireball',
  LIGHTNING_ARC: 'Lightning',
  BLOCK_WARD: 'Block',
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

function getMirroredScreenX(analysis) {
  return 1 - analysis.geometry.palmCenter.x;
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
  const tipDistanceRatio = createRatio(distance2D(tipPoint, geometry.palmCenter), geometry.palmSize);
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
    tipDistanceRatio,
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

function analyzeHandPose(landmarks, handedness, thresholds = GESTURE_THRESHOLDS) {
  const fingerStateBundle = getFingerStates(landmarks, handedness, thresholds);
  const { geometry, metrics } = fingerStateBundle;
  const fingerStates = {
    thumb: fingerStateBundle.thumb,
    index: fingerStateBundle.index,
    middle: fingerStateBundle.middle,
    ring: fingerStateBundle.ring,
    pinky: fingerStateBundle.pinky,
  };
  const extendedLongFingers = LONG_FINGER_KEYS.filter((fingerKey) => fingerStates[fingerKey]);
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

  const looksLikeThumbsUp =
    // Thumbs-up is intentionally hand-shape based rather than screen-direction based:
    // the thumb must open clearly away from the palm while the other fingers stay curled.
    metrics.thumb.angle >= thresholds.thumbsUpThumbAngleMin &&
    metrics.thumb.palmReachRatio >= thresholds.thumbsUpThumbReachRatioMin &&
    metrics.thumb.spreadRatio >= thresholds.thumbsUpThumbSpreadRatioMin &&
    metrics.thumb.tipDistanceRatio >= thresholds.thumbsUpThumbTipDistanceRatioMin &&
    !metrics.index.relaxedExtended &&
    !metrics.middle.relaxedExtended &&
    !metrics.ring.relaxedExtended &&
    !metrics.pinky.relaxedExtended &&
    averageLongFingerTipDistanceRatio <= thresholds.thumbsUpNonThumbAverageTipDistanceRatioMax &&
    fingerFanSpreadRatio <= thresholds.thumbsUpNonThumbFanSpreadRatioMax;

  const looksLikeClosedFist =
    extendedLongFingers.length === 0 &&
    !looksLikeThumbsUp &&
    !metrics.thumb.relaxedExtended &&
    averageLongFingerTipDistanceRatio <= thresholds.fistTipClusterRatio &&
    fingerFanSpreadRatio <= thresholds.fistFingerSpreadRatio;

  const looksLikeThreeFinger =
    metrics.index.extended &&
    metrics.middle.extended &&
    metrics.ring.extended &&
    !metrics.pinky.relaxedExtended &&
    averageLongFingerTipDistanceRatio >= thresholds.threeFingerAverageTipDistanceRatio &&
    fingerFanSpreadRatio >= thresholds.threeFingerFanSpreadRatio;

  const looksLikeIndexOnly =
    metrics.index.extended &&
    !metrics.middle.relaxedExtended &&
    !metrics.ring.relaxedExtended &&
    !metrics.pinky.relaxedExtended;

  const looksLikeIndexMiddle =
    metrics.index.extended &&
    metrics.middle.extended &&
    !looksLikeThumbsUp &&
    !metrics.thumb.extended &&
    !metrics.ring.relaxedExtended &&
    !metrics.pinky.relaxedExtended;

  const openLike =
    looksLikeOpenPalm ||
    (
      relaxedLongFingers.length >= thresholds.openLikeMinimumRelaxedFingers &&
      metrics.index.relaxedExtended &&
      metrics.middle.relaxedExtended &&
      averageLongFingerTipDistanceRatio >= thresholds.openLikeAverageTipDistanceRatio
    );

  let handState = 'RELAXED';

  if (looksLikeClosedFist) {
    handState = 'FIST';
  } else if (looksLikeThumbsUp) {
    handState = 'THUMBS_UP';
  } else if (looksLikeThreeFinger) {
    handState = 'THREE_FINGER';
  } else if (looksLikeOpenPalm) {
    handState = 'OPEN';
  }

  let legacyRawGesture = 'UNKNOWN';

  if (looksLikeClosedFist) {
    legacyRawGesture = 'CLOSED_FIST';
  } else if (looksLikeIndexOnly) {
    legacyRawGesture = 'INDEX_ONLY';
  } else if (looksLikeIndexMiddle) {
    legacyRawGesture = 'INDEX_MIDDLE';
  } else if (looksLikeThumbsUp) {
    legacyRawGesture = 'THUMBS_UP';
  } else if (looksLikeThreeFinger) {
    legacyRawGesture = 'THREE_FINGER';
  } else if (looksLikeOpenPalm) {
    legacyRawGesture = 'OPEN_PALM';
  }

  return {
    landmarks,
    handedness,
    handState,
    handStateLabel: HAND_STATE_LABELS[handState],
    legacyRawGesture,
    legacyRawGestureLabel: RAW_GESTURE_LABELS[legacyRawGesture],
    legacySpell: LEGACY_GESTURE_TO_SPELL[legacyRawGesture] ?? null,
    fingerStates,
    geometry,
    metrics,
    extendedLongFingers,
    relaxedLongFingers,
    averageLongFingerTipDistanceRatio,
    fingerFanSpreadRatio,
    openLike,
    receivingHand: handState === 'OPEN' || openLike,
    diagnostics: {
      averageLongFingerTipDistanceRatio,
      fingerFanSpreadRatio,
      metrics,
      geometry,
    },
  };
}

function assignHandSlots(detections, thresholds = GESTURE_THRESHOLDS) {
  const analyzedHands = detections.map((detection) => ({
    ...detection,
    analysis: analyzeHandPose(detection.landmarks, detection.handedness, thresholds),
  }));

  const byHandedness = new Map();
  const unknownHands = [];

  analyzedHands.forEach((hand) => {
    const handedness = hand.handedness === 'Left' || hand.handedness === 'Right'
      ? hand.handedness
      : null;

    if (handedness && !byHandedness.has(handedness)) {
      byHandedness.set(handedness, hand);
    } else {
      unknownHands.push(hand);
    }
  });

  unknownHands.sort(
    (handA, handB) =>
      getMirroredScreenX(handA.analysis) - getMirroredScreenX(handB.analysis),
  );

  let leftHand = byHandedness.get('Left') ?? null;
  let rightHand = byHandedness.get('Right') ?? null;

  if (!leftHand && unknownHands.length) {
    leftHand = unknownHands.shift() ?? null;
  }

  if (!rightHand && unknownHands.length) {
    rightHand = unknownHands.pop() ?? null;
  }

  return {
    analyzedHands,
    leftHand,
    rightHand,
  };
}

function getPairMetrics(leftHand, rightHand) {
  const leftAnalysis = leftHand.analysis;
  const rightAnalysis = rightHand.analysis;
  const averagePalmSize =
    (leftAnalysis.geometry.palmSize + rightAnalysis.geometry.palmSize) / 2;
  const palmCenterDistanceRatio = createRatio(
    distance2D(leftAnalysis.geometry.palmCenter, rightAnalysis.geometry.palmCenter),
    averagePalmSize,
  );
  const wristDistanceRatio = createRatio(
    distance2D(leftAnalysis.geometry.wrist, rightAnalysis.geometry.wrist),
    averagePalmSize,
  );
  const verticalPalmOffsetRatio = createRatio(
    Math.abs(leftAnalysis.geometry.palmCenter.y - rightAnalysis.geometry.palmCenter.y),
    averagePalmSize,
  );
  const correspondingTipAlignmentRatio =
    [
      FINGER_POINTS.index.tip,
      FINGER_POINTS.middle.tip,
      FINGER_POINTS.ring.tip,
      FINGER_POINTS.pinky.tip,
    ].reduce(
      (total, tipIndex) =>
        total + distance2D(leftHand.landmarks[tipIndex], rightHand.landmarks[tipIndex]),
      0,
    ) /
    (4 * averagePalmSize);

  return {
    averagePalmSize,
    palmCenterDistanceRatio,
    wristDistanceRatio,
    verticalPalmOffsetRatio,
    correspondingTipAlignmentRatio,
  };
}

function getFireballPair(leftHand, rightHand) {
  const pairs = [
    { fistHand: leftHand, supportHand: rightHand },
    { fistHand: rightHand, supportHand: leftHand },
  ];

  return pairs.find(
    ({ fistHand, supportHand }) =>
      fistHand.analysis.handState === 'FIST' && supportHand.analysis.receivingHand,
  ) ?? null;
}

function classifyTwoHandGesture(
  detections,
  pairThresholds = TWO_HAND_THRESHOLDS,
  perHandThresholds = GESTURE_THRESHOLDS,
) {
  const { analyzedHands, leftHand, rightHand } = assignHandSlots(detections, perHandThresholds);
  const handCount = analyzedHands.length;
  const leftHandStateLabel = leftHand?.analysis.handStateLabel ?? 'No hand';
  const rightHandStateLabel = rightHand?.analysis.handStateLabel ?? 'No hand';

  if (handCount === 0) {
    return {
      handCount,
      leftHandStateLabel,
      rightHandStateLabel,
      candidateKey: 'WAITING_FOR_HANDS',
      candidateLabel: TWO_HAND_CANDIDATE_LABELS.WAITING_FOR_HANDS,
      spell: null,
      diagnostics: {
        analyzedHands,
      },
    };
  }

  if (handCount < 2 || !leftHand || !rightHand) {
    return {
      handCount,
      leftHandStateLabel,
      rightHandStateLabel,
      candidateKey: 'WAITING_FOR_SECOND_HAND',
      candidateLabel: TWO_HAND_CANDIDATE_LABELS.WAITING_FOR_SECOND_HAND,
      spell: null,
      diagnostics: {
        analyzedHands,
      },
    };
  }

  const pairMetrics = getPairMetrics(leftHand, rightHand);
  const leftOpenLike = leftHand.analysis.handState === 'OPEN' || leftHand.analysis.openLike;
  const rightOpenLike = rightHand.analysis.handState === 'OPEN' || rightHand.analysis.openLike;
  const bothOpenLike = leftOpenLike && rightOpenLike;
  const bothThreeFinger =
    leftHand.analysis.handState === 'THREE_FINGER' &&
    rightHand.analysis.handState === 'THREE_FINGER';
  const fireballPair = getFireballPair(leftHand, rightHand);

  let looksLikePrayer = false;
  let looksLikeFireball = false;
  let looksLikeLightning = false;
  let looksLikeBlock = false;
  let fireballDistanceRatio = null;

  if (bothOpenLike) {
    // Prayer and block care more about a deliberate two-hand relationship than
    // about every finger being perfectly straight, so we accept the softer
    // "open-like" state here and let the pair geometry do the heavy lifting.
    looksLikePrayer =
      pairMetrics.palmCenterDistanceRatio <= pairThresholds.prayerPalmDistanceRatio &&
      pairMetrics.correspondingTipAlignmentRatio <= pairThresholds.prayerTipAlignmentRatio &&
      pairMetrics.verticalPalmOffsetRatio <= pairThresholds.prayerVerticalOffsetRatio &&
      pairMetrics.wristDistanceRatio >= pairThresholds.prayerWristDistanceRatioMin;

    looksLikeBlock =
      !looksLikePrayer &&
      pairMetrics.palmCenterDistanceRatio >= pairThresholds.blockPalmDistanceRatioMin &&
      pairMetrics.palmCenterDistanceRatio <= pairThresholds.blockPalmDistanceRatioMax &&
      pairMetrics.verticalPalmOffsetRatio <= pairThresholds.blockVerticalOffsetRatio;
  }

  if (bothThreeFinger) {
    looksLikeLightning =
      pairMetrics.palmCenterDistanceRatio >= pairThresholds.lightningPalmDistanceRatioMin &&
      pairMetrics.palmCenterDistanceRatio <= pairThresholds.lightningPalmDistanceRatioMax;
  }

  if (fireballPair) {
    const receivingPoint = averagePoint([
      fireballPair.supportHand.analysis.geometry.palmCenter,
      fireballPair.supportHand.landmarks[9],
      fireballPair.supportHand.landmarks[13],
    ]);

    const fistToReceivingPointRatio = createRatio(
      distance2D(fireballPair.fistHand.analysis.geometry.palmCenter, receivingPoint),
      pairMetrics.averagePalmSize,
    );
    const fistToPalmCenterRatio = createRatio(
      distance2D(
        fireballPair.fistHand.analysis.geometry.palmCenter,
        fireballPair.supportHand.analysis.geometry.palmCenter,
      ),
      pairMetrics.averagePalmSize,
    );

    fireballDistanceRatio = Math.min(fistToReceivingPointRatio, fistToPalmCenterRatio);
    looksLikeFireball =
      fireballDistanceRatio <= pairThresholds.fireballChargeDistanceRatio &&
      fistToPalmCenterRatio <= pairThresholds.fireballPalmDistanceRatio;
  }

  let candidateKey = 'AMBIGUOUS_PAIR';

  if (looksLikePrayer) {
    candidateKey = 'PRAYER_POSE';
  } else if (looksLikeFireball) {
    candidateKey = 'FIREBALL_CHARGE';
  } else if (looksLikeLightning) {
    candidateKey = 'LIGHTNING_ARC';
  } else if (looksLikeBlock) {
    candidateKey = 'BLOCK_WARD';
  }

  return {
    handCount,
    leftHandStateLabel,
    rightHandStateLabel,
    candidateKey,
    candidateLabel: TWO_HAND_CANDIDATE_LABELS[candidateKey],
    spell: TWO_HAND_GESTURE_TO_SPELL[candidateKey] ?? null,
    diagnostics: {
      analyzedHands,
      leftHand,
      rightHand,
      pairMetrics: {
        ...pairMetrics,
        fireballDistanceRatio,
      },
    },
  };
}

export function classifyGesture(landmarks, handedness, thresholds = GESTURE_THRESHOLDS) {
  const analysis = analyzeHandPose(landmarks, handedness, thresholds);

  return {
    rawGesture: analysis.legacyRawGesture,
    rawGestureLabel: analysis.legacyRawGestureLabel,
    spell: analysis.legacySpell,
    handState: analysis.handState,
    handStateLabel: analysis.handStateLabel,
    fingerStates: analysis.fingerStates,
    diagnostics: analysis.diagnostics,
  };
}

export function classifyLegacyOneHandGesture(
  landmarks,
  handedness,
  thresholds = GESTURE_THRESHOLDS,
) {
  return classifyGesture(landmarks, handedness, thresholds);
}

function createIdlePayload(mode) {
  return {
    mode,
    modeLabel: MODE_LABELS[mode],
    handCount: 0,
    leftHandStateLabel: 'No hand',
    rightHandStateLabel: 'No hand',
    combinedCandidateKey:
      mode === GESTURE_MODES.TWO_HAND ? 'WAITING_FOR_HANDS' : 'NO_HAND',
    combinedCandidateLabel:
      mode === GESTURE_MODES.TWO_HAND
        ? TWO_HAND_CANDIDATE_LABELS.WAITING_FOR_HANDS
        : RAW_GESTURE_LABELS.NO_HAND,
    diagnostics: null,
  };
}

export function createGestureController({
  mode = GESTURE_MODE,
  stabilitySettings = {},
} = {}) {
  const settings = { ...STABILITY_SETTINGS, ...stabilitySettings };
  let lastObservedGesture = 'NO_INPUT';
  let consecutiveFrames = 0;
  let requireReleaseForGesture = null;
  const lastCastAtBySpell = {};
  let lastCast = {
    spell: null,
    gesture: null,
    at: -Infinity,
  };

  function updateTemporalState(observedGesture, observedLabel, spell, payload, now) {
    if (observedGesture === lastObservedGesture) {
      consecutiveFrames += 1;
    } else {
      lastObservedGesture = observedGesture;
      consecutiveFrames = observedGesture === 'NO_INPUT' ? 0 : 1;
    }

    if (requireReleaseForGesture && observedGesture !== requireReleaseForGesture) {
      requireReleaseForGesture = null;
    }

    const stableGesture = spell && consecutiveFrames >= settings.framesForConfirmation
      ? observedGesture
      : null;
    const stableSpell = stableGesture ? spell : null;
    const cooldownSpell = stableSpell ?? lastCast.spell;
    const lastCastAt = cooldownSpell
      ? (lastCastAtBySpell[cooldownSpell] ?? -Infinity)
      : -Infinity;
    const cooldownRemainingMs = Math.max(0, lastCastAt + settings.cooldownMs - now);

    let confirmedSpell = null;

    if (stableSpell && !requireReleaseForGesture && cooldownRemainingMs === 0) {
      confirmedSpell = stableSpell;
      lastCastAtBySpell[stableSpell] = now;
      lastCast = {
        spell: stableSpell,
        gesture: stableGesture,
        at: now,
      };
      requireReleaseForGesture = stableGesture;
    }

    return {
      ...payload,
      rawGesture: observedGesture,
      rawGestureLabel: observedLabel,
      stableGesture,
      stableSpell,
      confirmedSpell,
      framesHeld: consecutiveFrames,
      cooldown: {
        spell: cooldownSpell,
        remainingMs: cooldownRemainingMs,
        ready: cooldownRemainingMs === 0,
      },
    };
  }

  function evaluateDetections(detections, now = performance.now()) {
    const safeDetections = detections ?? [];

    if (mode === GESTURE_MODES.LEGACY_ONE_HAND) {
      if (!safeDetections.length) {
        return observeNoHand(now);
      }

      const primaryDetection = safeDetections[0];
      const legacyClassification = classifyLegacyOneHandGesture(
        primaryDetection.landmarks,
        primaryDetection.handedness,
      );
      const { leftHand, rightHand } = assignHandSlots([primaryDetection]);
      const payload = {
        mode,
        modeLabel: MODE_LABELS[mode],
        handCount: 1,
        leftHandStateLabel: leftHand?.analysis.handStateLabel ?? 'No hand',
        rightHandStateLabel: rightHand?.analysis.handStateLabel ?? 'No hand',
        combinedCandidateKey: legacyClassification.rawGesture,
        combinedCandidateLabel: legacyClassification.rawGestureLabel,
        diagnostics: {
          leftHand,
          rightHand,
        },
      };

      return updateTemporalState(
        legacyClassification.rawGesture,
        legacyClassification.rawGestureLabel,
        legacyClassification.spell,
        payload,
        now,
      );
    }

    const twoHandClassification = classifyTwoHandGesture(safeDetections);

    return updateTemporalState(
      twoHandClassification.candidateKey,
      twoHandClassification.candidateLabel,
      twoHandClassification.spell,
      {
        mode,
        modeLabel: MODE_LABELS[mode],
        handCount: twoHandClassification.handCount,
        leftHandStateLabel: twoHandClassification.leftHandStateLabel,
        rightHandStateLabel: twoHandClassification.rightHandStateLabel,
        combinedCandidateKey: twoHandClassification.candidateKey,
        combinedCandidateLabel: twoHandClassification.candidateLabel,
        diagnostics: twoHandClassification.diagnostics,
      },
      now,
    );
  }

  function evaluate(landmarks, handedness, now = performance.now()) {
    if (!landmarks) {
      return observeNoHand(now);
    }

    return evaluateDetections([{ landmarks, handedness }], now);
  }

  function observeNoHand(now = performance.now()) {
    const payload = createIdlePayload(mode);
    const observedGesture =
      mode === GESTURE_MODES.TWO_HAND ? 'WAITING_FOR_HANDS' : 'NO_HAND';
    const observedLabel = payload.combinedCandidateLabel;

    return updateTemporalState(observedGesture, observedLabel, null, payload, now);
  }

  return {
    evaluate,
    evaluateDetections,
    observeNoHand,
    settings,
    mode,
    modeLabel: MODE_LABELS[mode],
  };
}
