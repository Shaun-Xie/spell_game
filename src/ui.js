import {
  CircleHelp,
  Cpu,
  Flame,
  Gauge,
  Hand,
  HeartPulse,
  Radar,
  RefreshCw,
  ScrollText,
  Shield,
  Sparkles,
  TriangleAlert,
  Video,
  WandSparkles,
  Zap,
  createIcons,
} from 'lucide';
import { animate, stagger } from 'motion';
import { Howl } from 'howler';
import { GESTURE_MODES } from './gestureClassifier.js';
import { HAND_CONNECTIONS, SPELL_THEME, createToneDataUri, formatDuration, timeStampLabel } from './utils.js';

const STATUS_BADGE_CLASS_MAP = {
  idle: 'status-badge status-badge--idle',
  loading: 'status-badge status-badge--loading',
  ready: 'status-badge status-badge--ready',
  active: 'status-badge status-badge--active',
  error: 'status-badge status-badge--error',
  cooldown: 'status-badge status-badge--cooldown',
};

function getSpellTheme(spellName) {
  return SPELL_THEME[spellName] ?? SPELL_THEME.Neutral;
}

const MODE_PRESENTATION = {
  [GESTURE_MODES.TWO_HAND]: {
    label: 'Two-hand arcana',
    pill: 'Two-Hand Mode',
    candidateLabel: 'Combined Candidate',
    spellbookDescription: 'Mapped hand poses for the current recognition mode.',
    spellbookBody:
      'Bring both hands into frame, hold the pair pose deliberately, and pause for a few frames so the combined spell can stabilize.',
    spellbook: {
      fireball: { title: 'Fireball', hint: 'Fist into other hand' },
      block: { title: 'Block', hint: 'Two open hands' },
      lightning: { title: 'Lightning', hint: 'Three fingers on both hands' },
      heal: { title: 'Heal', hint: 'Prayer pose' },
    },
  },
  [GESTURE_MODES.LEGACY_ONE_HAND]: {
    label: 'Legacy one-hand',
    pill: 'Legacy One-Hand',
    candidateLabel: 'Raw Gesture',
    spellbookDescription: 'Original single-hand mappings are currently active.',
    spellbookBody:
      'Use a single visible hand and hold one of the mapped poses steady for a few frames to confirm a cast.',
    spellbook: {
      fireball: { title: 'Fireball', hint: 'Closed fist' },
      block: { title: 'Block', hint: 'Thumbs up' },
      lightning: { title: 'Lightning', hint: 'Index finger only' },
      heal: { title: 'Heal', hint: 'Index + middle' },
    },
  },
};

function animateBadge(element) {
  animate(
    element,
    { opacity: [0.82, 1], scale: [0.98, 1] },
    { duration: 0.24, easing: 'ease-out' },
  );
}

export function createUI() {
  createIcons({
    icons: {
      CircleHelp,
      Cpu,
      Flame,
      Gauge,
      Hand,
      HeartPulse,
      Radar,
      RefreshCw,
      ScrollText,
      Shield,
      Sparkles,
      TriangleAlert,
      Video,
      WandSparkles,
      Zap,
    },
  });

  const refs = {
    appShell: document.getElementById('appShell'),
    video: document.getElementById('webcam'),
    overlay: document.getElementById('landmarkOverlay'),
    stageViewport: document.getElementById('stageViewport'),
    trackingModePill: document.getElementById('trackingModePill'),
    cameraRetryButton: document.getElementById('cameraRetryButton'),
    stageNotice: document.getElementById('stageNotice'),
    stageNoticeTitle: document.getElementById('stageNoticeTitle'),
    stageNoticeHint: document.getElementById('stageNoticeHint'),
    stageGestureBadge: document.getElementById('stageGestureBadge'),
    cameraStatusBadge: document.getElementById('cameraStatusBadge'),
    modelStatusBadge: document.getElementById('modelStatusBadge'),
    handStatusBadge: document.getElementById('handStatusBadge'),
    cameraStatusText: document.getElementById('cameraStatusText'),
    modelStatusText: document.getElementById('modelStatusText'),
    handStatusText: document.getElementById('handStatusText'),
    gestureModeText: document.getElementById('gestureModeText'),
    handCountText: document.getElementById('handCountText'),
    leftHandStateText: document.getElementById('leftHandStateText'),
    rightHandStateText: document.getElementById('rightHandStateText'),
    rawGestureLabel: document.getElementById('rawGestureLabel'),
    rawGestureText: document.getElementById('rawGestureText'),
    stableSpellText: document.getElementById('stableSpellText'),
    cooldownText: document.getElementById('cooldownText'),
    debugMessageText: document.getElementById('debugMessageText'),
    stageSpellName: document.getElementById('stageSpellName'),
    stageSpellDetail: document.getElementById('stageSpellDetail'),
    stageRawGestureLabel: document.getElementById('stageRawGestureLabel'),
    stageRawGesture: document.getElementById('stageRawGesture'),
    stageCooldown: document.getElementById('stageCooldown'),
    spellReadoutCard: document.getElementById('spellReadoutCard'),
    cameraResolution: document.getElementById('cameraResolution'),
    spellbookModeDescription: document.getElementById('spellbookModeDescription'),
    spellbookBodyText: document.getElementById('spellbookBodyText'),
    spellCardFireballTitle: document.getElementById('spellCardFireballTitle'),
    spellCardFireballHint: document.getElementById('spellCardFireballHint'),
    spellCardBlockTitle: document.getElementById('spellCardBlockTitle'),
    spellCardBlockHint: document.getElementById('spellCardBlockHint'),
    spellCardLightningTitle: document.getElementById('spellCardLightningTitle'),
    spellCardLightningHint: document.getElementById('spellCardLightningHint'),
    spellCardHealTitle: document.getElementById('spellCardHealTitle'),
    spellCardHealHint: document.getElementById('spellCardHealHint'),
    debugLog: document.getElementById('debugLog'),
  };

  const overlayContext = refs.overlay.getContext('2d');
  const confirmSound = new Howl({
    src: [createToneDataUri()],
    volume: 0.24,
  });

  function getStageMetrics() {
    const viewportWidth = refs.stageViewport.clientWidth;
    const viewportHeight = refs.stageViewport.clientHeight;
    const videoWidth = refs.video.videoWidth || viewportWidth || 1;
    const videoHeight = refs.video.videoHeight || viewportHeight || 1;
    const viewportAspectRatio = viewportWidth / Math.max(viewportHeight, 1);
    const videoAspectRatio = videoWidth / Math.max(videoHeight, 1);

    let contentWidth = viewportWidth;
    let contentHeight = viewportHeight;
    let offsetX = 0;
    let offsetY = 0;

    // The video uses object-contain, so landmarks must be drawn inside the
    // displayed video rectangle rather than stretched across the whole stage.
    if (viewportAspectRatio > videoAspectRatio) {
      contentHeight = viewportHeight;
      contentWidth = contentHeight * videoAspectRatio;
      offsetX = (viewportWidth - contentWidth) / 2;
    } else {
      contentWidth = viewportWidth;
      contentHeight = contentWidth / videoAspectRatio;
      offsetY = (viewportHeight - contentHeight) / 2;
    }

    return {
      viewportWidth,
      viewportHeight,
      contentWidth,
      contentHeight,
      offsetX,
      offsetY,
    };
  }

  function syncOverlaySize() {
    const bounds = refs.stageViewport.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;

    refs.overlay.width = Math.round(bounds.width * devicePixelRatio);
    refs.overlay.height = Math.round(bounds.height * devicePixelRatio);
    overlayContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  const resizeObserver = new ResizeObserver(syncOverlaySize);
  resizeObserver.observe(refs.stageViewport);
  syncOverlaySize();

  animate(
    '[data-reveal]',
    { opacity: [0, 1], transform: ['translateY(18px)', 'translateY(0px)'] },
    {
      duration: 0.58,
      delay: stagger(0.07),
      easing: [0.22, 1, 0.36, 1],
    },
  );

  function setGestureMode(mode) {
    const presentation = MODE_PRESENTATION[mode] ?? MODE_PRESENTATION[GESTURE_MODES.TWO_HAND];

    refs.trackingModePill.textContent = presentation.pill;
    refs.gestureModeText.textContent = presentation.label;
    refs.rawGestureLabel.textContent = presentation.candidateLabel;
    refs.stageRawGestureLabel.textContent = presentation.candidateLabel;
    refs.spellbookModeDescription.textContent = presentation.spellbookDescription;
    refs.spellbookBodyText.textContent = presentation.spellbookBody;
    refs.spellCardFireballTitle.textContent = presentation.spellbook.fireball.title;
    refs.spellCardFireballHint.textContent = presentation.spellbook.fireball.hint;
    refs.spellCardBlockTitle.textContent = presentation.spellbook.block.title;
    refs.spellCardBlockHint.textContent = presentation.spellbook.block.hint;
    refs.spellCardLightningTitle.textContent = presentation.spellbook.lightning.title;
    refs.spellCardLightningHint.textContent = presentation.spellbook.lightning.hint;
    refs.spellCardHealTitle.textContent = presentation.spellbook.heal.title;
    refs.spellCardHealHint.textContent = presentation.spellbook.heal.hint;
  }

  function formatHandCount(count) {
    return `${count} ${count === 1 ? 'hand' : 'hands'}`;
  }

  function setStatusBadge(element, text, tone) {
    element.textContent = text;
    element.className = STATUS_BADGE_CLASS_MAP[tone] ?? STATUS_BADGE_CLASS_MAP.idle;
    animateBadge(element);
  }

  function setCameraStatus(tone, text) {
    setStatusBadge(refs.cameraStatusBadge, text, tone);
    refs.cameraStatusText.textContent = text;
  }

  function setModelStatus(tone, text) {
    setStatusBadge(refs.modelStatusBadge, text, tone);
    refs.modelStatusText.textContent = text;
  }

  function setHandStatus(tone, text) {
    setStatusBadge(refs.handStatusBadge, text, tone);
    refs.handStatusText.textContent = text;
  }

  function setCameraMeta(text) {
    refs.cameraResolution.textContent = text;
  }

  function setDebugMessage(message) {
    refs.debugMessageText.textContent = message;
  }

  function pushDebugMessage(message) {
    const entry = document.createElement('li');
    entry.className = 'debug-entry';
    entry.innerHTML = `
      <span class="debug-entry__time">${timeStampLabel()}</span>
      <span class="debug-entry__text">${message}</span>
    `;

    refs.debugLog.prepend(entry);

    while (refs.debugLog.children.length > 6) {
      refs.debugLog.lastElementChild?.remove();
    }
  }

  function setStageNotice({ title, hint, tone = 'neutral', hidden = false, showRetry = false }) {
    refs.stageNoticeTitle.textContent = title;
    refs.stageNoticeHint.textContent = hint;
    refs.stageNotice.classList.toggle('is-hidden', hidden);
    refs.stageNotice.classList.toggle('stage-notice--error', tone === 'error');
    refs.stageNotice.classList.toggle('stage-notice--neutral', tone !== 'error');
    refs.cameraRetryButton.classList.toggle('hidden', !showRetry);
  }

  function bindRetry(handler) {
    refs.cameraRetryButton.addEventListener('click', handler);
  }

  function clearOverlay() {
    const { viewportWidth, viewportHeight } = getStageMetrics();
    overlayContext.clearRect(0, 0, viewportWidth, viewportHeight);
  }

  function drawHandOverlay(handDetections, spellName = 'Neutral') {
    const hands = Array.isArray(handDetections)
      ? handDetections
      : handDetections
        ? [{ landmarks: handDetections }]
        : [];

    if (!hands.length) {
      clearOverlay();
      return;
    }

    clearOverlay();

    const {
      contentWidth,
      contentHeight,
      offsetX,
      offsetY,
    } = getStageMetrics();
    const theme = getSpellTheme(spellName);
    const scale = Math.max(0.8, Math.min(contentWidth / 960, 1.05));

    hands.forEach((hand, handIndex) => {
      const landmarks = hand.landmarks ?? hand;
      const opacity = hands.length > 1 ? (handIndex === 0 ? 0.82 : 0.64) : 0.78;

      overlayContext.lineWidth = 2.05 * scale;
      overlayContext.strokeStyle = `rgba(${theme.rgb}, ${opacity})`;
      overlayContext.fillStyle = `rgba(${theme.rgb}, ${Math.min(opacity + 0.12, 0.96)})`;
      overlayContext.shadowColor = `rgba(${theme.rgb}, 0.34)`;
      overlayContext.shadowBlur = 15 * scale;

      HAND_CONNECTIONS.forEach(([startIndex, endIndex]) => {
        const start = landmarks[startIndex];
        const end = landmarks[endIndex];

        overlayContext.beginPath();
        overlayContext.moveTo(offsetX + start.x * contentWidth, offsetY + start.y * contentHeight);
        overlayContext.lineTo(offsetX + end.x * contentWidth, offsetY + end.y * contentHeight);
        overlayContext.stroke();
      });

      landmarks.forEach((landmark, index) => {
        const radius = (index % 4 === 0 ? 4 : 3) * scale;

        overlayContext.beginPath();
        overlayContext.arc(
          offsetX + landmark.x * contentWidth,
          offsetY + landmark.y * contentHeight,
          radius,
          0,
          Math.PI * 2,
        );
        overlayContext.fill();
      });
    });
  }

  function playSpellConfirm(spellName) {
    const playbackRate = {
      Fireball: 0.95,
      Shield: 0.88,
      Block: 0.88,
      Lightning: 1.12,
      Heal: 0.78,
    }[spellName] ?? 1;

    const soundId = confirmSound.play();
    confirmSound.rate(playbackRate, soundId);
  }

  function renderGestureState(state) {
    const stableSpell = state.stableSpell ?? 'No spell';
    const candidateLabel = state.combinedCandidateLabel ?? state.rawGestureLabel;
    const cooldownLabel =
      state.cooldown.remainingMs > 0 && state.cooldown.spell
        ? `${state.cooldown.spell} recharging · ${formatDuration(state.cooldown.remainingMs)}`
        : 'Ready';

    refs.gestureModeText.textContent = state.modeLabel ?? MODE_PRESENTATION[GESTURE_MODES.TWO_HAND].label;
    refs.handCountText.textContent = formatHandCount(state.handCount ?? 0);
    refs.leftHandStateText.textContent = state.leftHandStateLabel ?? 'No hand';
    refs.rightHandStateText.textContent = state.rightHandStateLabel ?? 'No hand';
    refs.rawGestureText.textContent = candidateLabel;
    refs.stableSpellText.textContent = stableSpell;
    refs.cooldownText.textContent = cooldownLabel;
    refs.stageRawGesture.textContent = candidateLabel;
    refs.stageCooldown.textContent = cooldownLabel;
    refs.stageSpellName.textContent = stableSpell;
    refs.stageSpellDetail.textContent = state.stableSpell
      ? `${state.framesHeld} steady frames locked. Hold or release to switch spells.`
      : state.mode === GESTURE_MODES.TWO_HAND
        ? state.handCount === 1
          ? 'One hand is visible. Bring the second hand into frame for pair casting.'
          : 'Hold a mapped two-hand pose for a few frames to stabilize recognition.'
        : 'Hold a mapped one-hand pose for a few frames to stabilize recognition.';
    refs.stageGestureBadge.querySelector('span').textContent = stableSpell;

    const themeSpell = state.stableSpell ?? state.confirmedSpell ?? 'Neutral';
    refs.appShell.dataset.spellTheme = themeSpell;

    if (state.confirmedSpell) {
      refs.spellReadoutCard.classList.remove('spell-confirmed');
      void refs.spellReadoutCard.offsetWidth;
      refs.spellReadoutCard.classList.add('spell-confirmed');
    }
  }

  return {
    refs,
    bindRetry,
    clearOverlay,
    drawHandOverlay,
    playSpellConfirm,
    pushDebugMessage,
    renderGestureState,
    setGestureMode,
    setCameraMeta,
    setCameraStatus,
    setDebugMessage,
    setHandStatus,
    setModelStatus,
    setStageNotice,
    syncOverlaySize,
  };
}
