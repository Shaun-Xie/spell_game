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
  Snowflake,
  Sparkles,
  TriangleAlert,
  Video,
  WandSparkles,
  Zap,
  createIcons,
} from 'lucide';
import { animate, stagger } from 'motion';
import { Howl } from 'howler';
import { GESTURE_MODE_LABEL } from './gestureClassifier.js';
import {
  HAND_CONNECTIONS,
  SPELL_THEME,
  createToneDataUri,
  formatDuration,
  rgbaFromRgbString,
  timeStampLabel,
} from './utils.js';

const STATUS_BADGE_CLASS_MAP = {
  idle: 'status-badge status-badge--idle',
  loading: 'status-badge status-badge--loading',
  ready: 'status-badge status-badge--ready',
  active: 'status-badge status-badge--active',
  error: 'status-badge status-badge--error',
  cooldown: 'status-badge status-badge--cooldown',
};

const ACTIVE_PRESENTATION = {
  label: GESTURE_MODE_LABEL,
  pill: 'Legacy One-Hand',
  candidateLabel: 'Raw Gesture',
  spellbookDescription: 'Single-hand spellcasting is currently active.',
  spellbookBody:
    'Defend the left-side ward with one hand. Hold a mapped pose long enough for it to stabilize, then the battle lane responds to the confirmed spell.',
  spellbook: {
    fireball: { title: 'Fireball', hint: 'Closed fist' },
    freeze: { title: 'Freeze', hint: 'Thumbs up' },
    lightning: { title: 'Lightning', hint: 'Index finger only' },
    heal: { title: 'Heal', hint: 'Index + middle' },
  },
};

function createUiError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function createResizeBinding(target, callback) {
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(callback);
    observer.observe(target);

    return {
      disconnect() {
        observer.disconnect();
      },
    };
  }

  window.addEventListener('resize', callback);

  return {
    disconnect() {
      window.removeEventListener('resize', callback);
    },
  };
}

function getSpellTheme(spellName) {
  return SPELL_THEME[spellName] ?? SPELL_THEME.Neutral;
}

function animateBadge(element) {
  animate(
    element,
    { opacity: [0.82, 1], scale: [0.98, 1] },
    { duration: 0.24, easing: 'ease-out' },
  );
}

function formatFreezeStatus(freezeRemainingMs) {
  return freezeRemainingMs > 0
    ? `Frost echo · ${formatDuration(freezeRemainingMs)}`
    : 'Idle';
}

function formatHealth(playerHp, playerMaxHp) {
  return `${Math.max(0, Math.round(playerHp))} / ${playerMaxHp}`;
}

export function createUI() {
  try {
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
        Snowflake,
        Sparkles,
        TriangleAlert,
        Video,
        WandSparkles,
        Zap,
      },
    });
  } catch (error) {
    console.warn('[Mage Hands] Lucide icon startup failed.', error);
  }

  const refs = {
    appShell: document.getElementById('appShell'),
    gameCanvas: document.getElementById('gameCanvas'),
    gameStateBadge: document.getElementById('gameStateBadge'),
    arenaHpValue: document.getElementById('arenaHpValue'),
    arenaScoreValue: document.getElementById('arenaScoreValue'),
    arenaEnemiesValue: document.getElementById('arenaEnemiesValue'),
    arenaFreezeValue: document.getElementById('arenaFreezeValue'),
    arenaFeedText: document.getElementById('arenaFeedText'),
    gameOverOverlay: document.getElementById('gameOverOverlay'),
    gameOverTitle: document.getElementById('gameOverTitle'),
    gameOverText: document.getElementById('gameOverText'),
    gameRestartButton: document.getElementById('gameRestartButton'),
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
    handPoseText: document.getElementById('handPoseText'),
    rawGestureLabel: document.getElementById('rawGestureLabel'),
    rawGestureText: document.getElementById('rawGestureText'),
    stableSpellText: document.getElementById('stableSpellText'),
    cooldownText: document.getElementById('cooldownText'),
    playerHpText: document.getElementById('playerHpText'),
    freezeStatusText: document.getElementById('freezeStatusText'),
    enemiesText: document.getElementById('enemiesText'),
    scoreText: document.getElementById('scoreText'),
    defeatedText: document.getElementById('defeatedText'),
    gameStateText: document.getElementById('gameStateText'),
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
    spellCardFreezeTitle: document.getElementById('spellCardFreezeTitle'),
    spellCardFreezeHint: document.getElementById('spellCardFreezeHint'),
    spellCardLightningTitle: document.getElementById('spellCardLightningTitle'),
    spellCardLightningHint: document.getElementById('spellCardLightningHint'),
    spellCardHealTitle: document.getElementById('spellCardHealTitle'),
    spellCardHealHint: document.getElementById('spellCardHealHint'),
    debugLog: document.getElementById('debugLog'),
  };

  const missingRefs = Object.entries(refs)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingRefs.length) {
    throw createUiError(
      'UIDomMissingError',
      `Missing required UI elements: ${missingRefs.join(', ')}`,
    );
  }

  const overlayContext = refs.overlay.getContext('2d');

  if (!overlayContext) {
    throw createUiError(
      'UIOverlayContextError',
      'Could not create the webcam overlay canvas context.',
    );
  }

  const stageGestureLabel =
    refs.stageGestureBadge.querySelector('span') ?? refs.stageGestureBadge;
  const confirmSound = (() => {
    try {
      return new Howl({
        src: [createToneDataUri()],
        volume: 0.24,
      });
    } catch (error) {
      console.warn('[Mage Hands] UI sound startup failed.', error);

      return {
        play() {
          return null;
        },
        rate() {},
      };
    }
  })();

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

    // The video uses object-contain, so the overlay must be drawn inside the
    // displayed video rectangle rather than stretched across the full panel.
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

  const resizeBinding = createResizeBinding(refs.stageViewport, syncOverlaySize);
  syncOverlaySize();

  try {
    animate(
      '[data-reveal]',
      { opacity: [0, 1], transform: ['translateY(18px)', 'translateY(0px)'] },
      {
        duration: 0.58,
        delay: stagger(0.07),
        easing: [0.22, 1, 0.36, 1],
      },
    );
  } catch (error) {
    console.warn('[Mage Hands] Intro animation startup failed.', error);
  }

  function setGestureMode() {
    refs.trackingModePill.textContent = ACTIVE_PRESENTATION.pill;
    refs.gestureModeText.textContent = ACTIVE_PRESENTATION.label;
    refs.rawGestureLabel.textContent = ACTIVE_PRESENTATION.candidateLabel;
    refs.stageRawGestureLabel.textContent = ACTIVE_PRESENTATION.candidateLabel;
    refs.spellbookModeDescription.textContent = ACTIVE_PRESENTATION.spellbookDescription;
    refs.spellbookBodyText.textContent = ACTIVE_PRESENTATION.spellbookBody;
    refs.spellCardFireballTitle.textContent = ACTIVE_PRESENTATION.spellbook.fireball.title;
    refs.spellCardFireballHint.textContent = ACTIVE_PRESENTATION.spellbook.fireball.hint;
    refs.spellCardFreezeTitle.textContent = ACTIVE_PRESENTATION.spellbook.freeze.title;
    refs.spellCardFreezeHint.textContent = ACTIVE_PRESENTATION.spellbook.freeze.hint;
    refs.spellCardLightningTitle.textContent = ACTIVE_PRESENTATION.spellbook.lightning.title;
    refs.spellCardLightningHint.textContent = ACTIVE_PRESENTATION.spellbook.lightning.hint;
    refs.spellCardHealTitle.textContent = ACTIVE_PRESENTATION.spellbook.heal.title;
    refs.spellCardHealHint.textContent = ACTIVE_PRESENTATION.spellbook.heal.hint;
  }

  function setStatusBadge(element, text, tone) {
    element.textContent = text;
    element.className = STATUS_BADGE_CLASS_MAP[tone] ?? STATUS_BADGE_CLASS_MAP.idle;
    animateBadge(element);
  }

  function setGameStateBadge(text, tone) {
    setStatusBadge(refs.gameStateBadge, text, tone);
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

  function bindGameRestart(handler) {
    refs.gameRestartButton.addEventListener('click', handler);
  }

  function clearOverlay() {
    const { viewportWidth, viewportHeight } = getStageMetrics();
    overlayContext.clearRect(0, 0, viewportWidth, viewportHeight);
  }

  function drawHandOverlay(handDetection, spellName = 'Neutral') {
    const landmarks = handDetection?.landmarks ?? handDetection;

    if (!landmarks) {
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

    overlayContext.lineWidth = 2.05 * scale;
    overlayContext.strokeStyle = rgbaFromRgbString(theme.rgb, 0.82);
    overlayContext.fillStyle = rgbaFromRgbString(theme.rgb, 0.94);
    overlayContext.shadowColor = rgbaFromRgbString(theme.rgb, 0.34);
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
  }

  function playSpellConfirm(spellName) {
    const playbackRate = {
      Fireball: 0.95,
      Freeze: 0.84,
      Lightning: 1.12,
      Heal: 0.78,
    }[spellName] ?? 1;

    try {
      const soundId = confirmSound.play();
      confirmSound.rate(playbackRate, soundId);
    } catch (error) {
      console.warn('[Mage Hands] Spell confirm audio failed.', error);
    }
  }

  function renderGestureState(state) {
    const stableSpell = state.stableSpell ?? 'No spell';
    const cooldownLabel =
      state.cooldown.remainingMs > 0 && state.cooldown.spell
        ? `${state.cooldown.spell} recharging · ${formatDuration(state.cooldown.remainingMs)}`
        : 'Ready';

    refs.gestureModeText.textContent = state.modeLabel ?? ACTIVE_PRESENTATION.label;
    refs.handPoseText.textContent = state.handVisible ? state.handStateLabel : 'No hand';
    refs.rawGestureText.textContent = state.rawGestureLabel;
    refs.stableSpellText.textContent = stableSpell;
    refs.cooldownText.textContent = cooldownLabel;
    refs.stageRawGesture.textContent = state.rawGestureLabel;
    refs.stageCooldown.textContent = cooldownLabel;
    refs.stageSpellName.textContent = stableSpell;
    refs.stageSpellDetail.textContent = state.stableSpell
      ? `${state.framesHeld} steady frames locked. Release or switch poses to cast something else.`
      : state.handVisible
        ? 'Hold a mapped one-hand pose steady for a few frames to cast into the battle lane.'
        : 'Raise one hand inside the webcam frame to begin casting.';
    stageGestureLabel.textContent = stableSpell;

    refs.appShell.dataset.spellTheme = state.stableSpell ?? state.confirmedSpell ?? 'Neutral';

    if (state.confirmedSpell) {
      refs.spellReadoutCard.classList.remove('spell-confirmed');
      void refs.spellReadoutCard.offsetWidth;
      refs.spellReadoutCard.classList.add('spell-confirmed');
    }
  }

  function renderGameState(state) {
    refs.playerHpText.textContent = formatHealth(state.playerHp, state.playerMaxHp);
    refs.freezeStatusText.textContent = formatFreezeStatus(state.freezeRemainingMs);
    refs.enemiesText.textContent = `${state.enemiesAlive}`;
    refs.scoreText.textContent = `${state.score}`;
    refs.defeatedText.textContent = `${state.defeatedEnemies}`;
    refs.gameStateText.textContent = state.gameStateLabel;

    refs.arenaHpValue.textContent = formatHealth(state.playerHp, state.playerMaxHp);
    refs.arenaScoreValue.textContent = `${state.score}`;
    refs.arenaEnemiesValue.textContent = `${state.enemiesAlive}`;
    refs.arenaFreezeValue.textContent = state.freezeActive ? 'Active' : 'Idle';
    refs.arenaFeedText.textContent = state.feedText;

    if (state.gameOver) {
      setGameStateBadge('Game Over', 'error');
    } else if (state.freezeActive) {
      setGameStateBadge('Freeze Cast', 'active');
    } else {
      setGameStateBadge('Battle Running', 'ready');
    }

    refs.gameOverOverlay.classList.toggle('is-hidden', !state.gameOver);
    refs.gameOverTitle.textContent = state.gameOver ? 'The Ward Has Fallen' : 'Battle Paused';
    refs.gameOverText.textContent = state.gameOver
      ? `Final score ${state.score}. Enemies defeated: ${state.defeatedEnemies}.`
      : '';
  }

  return {
    refs,
    bindGameRestart,
    bindRetry,
    clearOverlay,
    drawHandOverlay,
    playSpellConfirm,
    pushDebugMessage,
    renderGameState,
    renderGestureState,
    setCameraMeta,
    setCameraStatus,
    setDebugMessage,
    setGestureMode,
    setHandStatus,
    setModelStatus,
    setStageNotice,
    syncOverlaySize,
    dispose() {
      resizeBinding.disconnect();
    },
  };
}
