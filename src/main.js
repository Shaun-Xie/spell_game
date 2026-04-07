import './styles.css';
import { describeCameraSettings, startCamera, stopCamera } from './camera.js';
import { createGestureController } from './gestureClassifier.js';
import { createGame } from './game.js';
import { createHandTracker } from './handTracker.js';
import { createUI } from './ui.js';

let ui = null;
let handTracker = null;
let gestureController = null;
let game = null;
let cameraSession = null;
let animationFrameId = null;
let modelReady = false;
let cameraReady = false;
let gameReady = false;
let lastRawGesture = 'NO_INPUT';
let handPreviouslyVisible = false;
let modelInitTask = null;
let cameraInitTask = null;
let listenersBound = false;
let startupNoticeDelayId = null;
let startupNoticeEscalationId = null;
let gameStarted = false;
let instructionMenuVisible = false;

const startupPhases = {
  boot: { status: 'idle', detail: '' },
  ui: { status: 'idle', detail: '' },
  game: { status: 'idle', detail: '' },
  model: { status: 'idle', detail: '' },
  camera: { status: 'idle', detail: '' },
  tracking: { status: 'idle', detail: '' },
};

const STATUS_BADGE_CLASS_MAP = {
  idle: 'status-badge status-badge--idle',
  loading: 'status-badge status-badge--loading',
  ready: 'status-badge status-badge--ready',
  active: 'status-badge status-badge--active',
  error: 'status-badge status-badge--error',
};

function setDomText(id, text) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = text;
  }
}

function setDomBadge(id, text, tone = 'idle') {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = text;
    element.className = STATUS_BADGE_CLASS_MAP[tone] ?? STATUS_BADGE_CLASS_MAP.idle;
  }
}

function setDomStageNotice({ title, hint, tone = 'neutral', showRetry = false }) {
  const notice = document.getElementById('stageNotice');
  const titleElement = document.getElementById('stageNoticeTitle');
  const hintElement = document.getElementById('stageNoticeHint');
  const retryButton = document.getElementById('cameraRetryButton');

  if (notice && titleElement && hintElement) {
    titleElement.textContent = title;
    hintElement.textContent = hint;
    notice.classList.remove('is-hidden');
    notice.classList.toggle('stage-notice--error', tone === 'error');
    notice.classList.toggle('stage-notice--neutral', tone !== 'error');
  }

  if (retryButton) {
    retryButton.classList.toggle('hidden', !showRetry);
  }
}

function showEmergencyStartupError(title, hint, { showRetry = true } = {}) {
  console.error(`[Mage Hands] ${title}: ${hint}`);
  setDomStageNotice({ title, hint, tone: 'error', showRetry });
  setDomText('debugMessageText', hint);
  setDomText('cameraStatusText', 'Startup failed');
  setDomText('modelStatusText', 'Startup failed');
  setDomText('handStatusText', 'Startup blocked');
  setDomText('gameStateText', 'Startup failed');
  setDomBadge('cameraStatusBadge', 'Error', 'error');
  setDomBadge('modelStatusBadge', 'Error', 'error');
  setDomBadge('handStatusBadge', 'Error', 'error');
  setDomBadge('gameStateBadge', 'Startup Failed', 'error');

  if (!document.getElementById('stageNotice')) {
    const fallback = document.createElement('div');
    fallback.style.cssText = [
      'position:fixed',
      'inset:1rem',
      'z-index:9999',
      'border-radius:24px',
      'padding:1.25rem 1.4rem',
      'background:rgba(7,15,28,0.94)',
      'border:1px solid rgba(248,113,113,0.35)',
      'color:#f8fafc',
      'font:14px/1.6 system-ui,sans-serif',
      'box-shadow:0 18px 50px rgba(0,0,0,0.35)',
    ].join(';');
    fallback.innerHTML = `<strong style="display:block;margin-bottom:0.5rem">${title}</strong><span>${hint}</span>`;
    document.body.appendChild(fallback);
  }
}

function pushStartupMessage(message, level = 'info') {
  const logger = console[level] ?? console.info;
  logger(`[Mage Hands] ${message}`);

  if (ui) {
    ui.setDebugMessage(message);
    ui.pushDebugMessage(message);
  } else {
    setDomText('debugMessageText', message);
  }
}

function logStartupPhase(phase, message, level = 'info') {
  pushStartupMessage(`Startup phase [${phase}]: ${message}`, level);
}

function getDiagnosticMessage() {
  if (startupPhases.tracking.status === 'error') {
    return startupPhases.tracking.detail;
  }

  if (startupPhases.camera.status === 'error' && startupPhases.model.status === 'error') {
    return 'Camera and tracker are unavailable. The battle lane is still running, but spellcasting is offline.';
  }

  if (startupPhases.camera.status === 'error') {
    return startupPhases.camera.detail;
  }

  if (startupPhases.model.status === 'error') {
    return startupPhases.model.detail;
  }

  if (startupPhases.tracking.status === 'active') {
    return startupPhases.tracking.detail;
  }

  if (startupPhases.camera.status === 'loading' && startupPhases.model.status === 'loading') {
    return 'Waiting for webcam permission and loading the hand tracker.';
  }

  if (startupPhases.camera.status === 'loading') {
    return startupPhases.camera.detail;
  }

  if (startupPhases.model.status === 'loading') {
    return startupPhases.model.detail;
  }

  if (startupPhases.game.status === 'ready' && startupPhases.tracking.status !== 'active') {
    return 'Battle lane ready. Spellcasting systems are still starting.';
  }

  return startupPhases.boot.detail || 'Boot sequence started.';
}

function refreshDiagnosticStatus() {
  const message = getDiagnosticMessage();

  if (ui) {
    ui.setDebugMessage(message);
  } else {
    setDomText('debugMessageText', message);
  }
}

function setStartupPhase(
  phase,
  status,
  detail,
  { level = status === 'error' ? 'error' : 'info', pushLog = false } = {},
) {
  startupPhases[phase] = { status, detail };
  console[level]?.(`[Mage Hands] Startup phase [${phase}] ${status}: ${detail}`);

  if (pushLog && ui) {
    ui.pushDebugMessage(`Startup phase [${phase}] ${status}: ${detail}`);
  }

  refreshDiagnosticStatus();
}

function clearStartupNoticeTimers() {
  if (startupNoticeDelayId) {
    window.clearTimeout(startupNoticeDelayId);
    startupNoticeDelayId = null;
  }

  if (startupNoticeEscalationId) {
    window.clearTimeout(startupNoticeEscalationId);
    startupNoticeEscalationId = null;
  }
}

function updatePendingStartupNotice() {
  if (!ui) {
    return;
  }

  const cameraLoading = startupPhases.camera.status === 'loading';
  const modelLoading = startupPhases.model.status === 'loading';
  const trackingActive = startupPhases.tracking.status === 'active';
  const hasError =
    startupPhases.camera.status === 'error' ||
    startupPhases.model.status === 'error' ||
    startupPhases.tracking.status === 'error';

  if (trackingActive || hasError || (!cameraLoading && !modelLoading)) {
    return;
  }

  let title = 'Starting spellcasting systems';
  let hint = 'Waiting for webcam permission and loading the hand tracker.';

  if (cameraLoading && modelLoading) {
    title = 'Spellcasting systems still starting';
    hint = 'The battle lane is already running. Finish the webcam prompt and give the hand tracker a moment to load.';
  } else if (cameraLoading) {
    title = 'Waiting for camera permission';
    hint = 'The battle lane is already running. Allow webcam access to bring spellcasting online.';
  } else if (modelLoading) {
    title = 'Loading hand tracker';
    hint = 'The battle lane is already running. Spellcasting will come online when the tracker finishes loading.';
  }

  ui.setStageNotice({
    title,
    hint,
    tone: 'neutral',
    hidden: false,
    showRetry: true,
  });
}

function scheduleStartupNoticeTimers() {
  clearStartupNoticeTimers();

  startupNoticeDelayId = window.setTimeout(() => {
    updatePendingStartupNotice();
  }, 900);

  startupNoticeEscalationId = window.setTimeout(() => {
    if (!ui) {
      return;
    }

    updatePendingStartupNotice();
    ui.pushDebugMessage('Startup is taking longer than expected. Retry is available while camera/model loading continues.');
  }, 3200);
}

function describeCameraError(error) {
  if (error?.name === 'InsecureContextError') {
    return 'Webcam access needs localhost or HTTPS. Use npm run dev, npm run preview, or a secure deployed host.';
  }

  if (error?.name === 'NotAllowedError') {
    return 'Camera permission was denied. Allow webcam access and try again.';
  }

  if (error?.name === 'NotFoundError') {
    return 'No webcam was found on this device.';
  }

  if (error?.name === 'NotReadableError') {
    return 'The webcam is already in use by another app or browser tab.';
  }

  if (error?.name === 'CameraStartupTimeout') {
    return 'The webcam stream took too long to start. Retry setup and make sure the browser finishes the permission prompt.';
  }

  if (error?.name === 'GetUserMediaUnavailable') {
    return 'This browser cannot access getUserMedia. Use a current browser over localhost or HTTPS.';
  }

  return 'The webcam could not be started. Check browser permissions and camera availability.';
}

function describeModelError(error) {
  if (error?.name === 'MediaPipeWasmTimeout' || error?.name === 'HandLandmarkerInitTimeout') {
    return 'The hand tracker took too long to start. Refresh, then retry on a normal network connection.';
  }

  return 'The MediaPipe Hand Landmarker failed to load. Check your network connection and refresh.';
}

function describeGameError(error) {
  if (error?.name === 'GameCanvasMissingError') {
    return 'The battle canvas element could not be found in the page markup.';
  }

  if (error?.name === 'GameCanvasContextError') {
    return 'The browser could not create a 2D canvas context for the battle lane.';
  }

  return 'The battle lane failed to initialize. Refresh the page and check the browser console.';
}

function describeUiError(error) {
  if (error?.name === 'UIDomMissingError') {
    return error.message;
  }

  if (error?.name === 'UIOverlayContextError') {
    return 'The webcam overlay canvas failed to initialize.';
  }

  return 'The UI failed to initialize before startup could begin.';
}

function describeTrackingRuntimeError(error) {
  return error?.message
    ? `Live tracking stopped because of a runtime error: ${error.message}`
    : 'Live tracking stopped because of an unexpected runtime error.';
}

function stopRenderLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function getTrackingIdleCopy() {
  return {
    title: 'Spell lens ready',
    hint: 'Raise one hand into the lens whenever you are ready to cast.',
  };
}

function getTrackingMessage(state) {
  if (state.rawGesture === 'UNKNOWN') {
    return 'Hand detected, but the pose does not match one of the mapped spells yet.';
  }

  if (state.rawGesture === 'NO_HAND') {
    return 'Tracking is active, but no hand is currently visible.';
  }

  return `Detected raw gesture: ${state.rawGestureLabel}.`;
}

function updateStageNoticeForState(state) {
  if (!ui) {
    return;
  }

  if (!state.handVisible) {
    ui.setStageNotice({
      title: 'Spell lens ready',
      hint: 'Raise one hand inside the webcam frame whenever you are ready to cast.',
      tone: 'neutral',
      hidden: true,
      showRetry: false,
    });
    return;
  }

  ui.setStageNotice({
    title: 'Hand tracking locked',
    hint: 'Landmarks are updating in real time. Hold a mapped pose to cast into the battle lane.',
    tone: 'neutral',
    hidden: true,
    showRetry: false,
  });
}

function summarizeStartup(modelResult, cameraResult) {
  if (modelResult.ok && cameraResult.ok) {
    ui.pushDebugMessage('Startup complete. Camera, tracker, and battle lane are live.');
    refreshDiagnosticStatus();
    return;
  }

  if (!modelResult.ok && !cameraResult.ok) {
    ui.setHandStatus('error', 'Startup blocked');
    ui.pushDebugMessage('Startup incomplete: camera and tracker are both unavailable.');
    ui.setStageNotice({
      title: 'Spellcasting offline',
      hint: 'Camera and hand-tracker startup both failed. Fix permissions or network access, then retry.',
      tone: 'error',
      hidden: false,
      showRetry: true,
    });
    refreshDiagnosticStatus();
    return;
  }

  if (!cameraResult.ok) {
    ui.setHandStatus('error', 'Camera unavailable');
    ui.pushDebugMessage('Startup incomplete: webcam access failed.');
    refreshDiagnosticStatus();
    return;
  }

  ui.setHandStatus('error', 'Tracker unavailable');
  ui.pushDebugMessage('Startup incomplete: hand-tracker initialization failed.');
  refreshDiagnosticStatus();
}

function handleTrackingRuntimeFailure(error) {
  const message = describeTrackingRuntimeError(error);

  stopRenderLoop();
  clearStartupNoticeTimers();
  handPreviouslyVisible = false;
  lastRawGesture = 'NO_INPUT';
  modelReady = false;
  cameraReady = Boolean(cameraSession);
  handTracker?.dispose?.();
  handTracker = null;
  gestureController = createGestureController();
  modelInitTask = null;
  setStartupPhase('tracking', 'error', message, { pushLog: true });
  setStartupPhase('model', 'error', 'Tracking crashed. Retry to reload the hand tracker.', { pushLog: false });

  if (!ui) {
    showEmergencyStartupError('Tracking runtime failed', message, { showRetry: true });
    return;
  }

  ui.clearOverlay();
  ui.setModelStatus('error', 'Tracking error');
  ui.setHandStatus('error', 'Tracking stopped');
  ui.setDebugMessage(message);
  ui.pushDebugMessage(message);
  ui.setStageNotice({
    title: 'Tracking stopped unexpectedly',
    hint: 'A runtime error interrupted live tracking. Retry setup to restart the model and camera loop.',
    tone: 'error',
    hidden: false,
    showRetry: true,
  });
  console.error('[Mage Hands] Tracking loop crashed.', error);
}

function startTrackingLoop() {
  if (!ui || !handTracker || !gestureController) {
    return false;
  }

  if (!modelReady || !cameraReady || animationFrameId) {
    return false;
  }

  const idleCopy = getTrackingIdleCopy();
  ui.setStageNotice({
    title: idleCopy.title,
    hint: idleCopy.hint,
    tone: 'neutral',
    hidden: true,
    showRetry: false,
  });
  ui.setHandStatus('ready', 'Tracking online');
  setStartupPhase('tracking', 'active', 'Tracking online. Waiting for live video frames.', { pushLog: true });
  ui.pushDebugMessage('Tracking loop started.');

  const renderLoop = (timestamp) => {
    animationFrameId = requestAnimationFrame(renderLoop);

    try {
      const result = handTracker.detect(ui.refs.video, timestamp);

      if (!result) {
        return;
      }

      const detection = handTracker.getPrimaryDetection(result);

      if (!detection) {
        const noHandState = gestureController.observeNoHand(timestamp);
        ui.clearOverlay();
        ui.setHandStatus('idle', 'Stand By');
        ui.renderGestureState(noHandState);
        ui.setDebugMessage(getTrackingMessage(noHandState));
        updateStageNoticeForState(noHandState);

        if (handPreviouslyVisible) {
          ui.pushDebugMessage('Hand left the frame.');
          handPreviouslyVisible = false;
        }

        lastRawGesture = noHandState.rawGesture;
        return;
      }

      const gestureState = gestureController.evaluateDetection(detection, timestamp);
      handPreviouslyVisible = true;
      ui.setHandStatus('active', 'Hand tracked');
      updateStageNoticeForState(gestureState);
      ui.renderGestureState(gestureState);
      ui.drawHandOverlay(detection, gestureState.stableSpell ?? gestureState.confirmedSpell);

      if (gestureState.rawGesture !== lastRawGesture) {
        ui.setDebugMessage(getTrackingMessage(gestureState));
        lastRawGesture = gestureState.rawGesture;
      }

      if (gestureState.confirmedSpell) {
        if (!gameStarted) {
          ui.setDebugMessage(
            instructionMenuVisible
              ? 'Tracking is ready. Press X or Begin Battle to start the fight.'
              : 'Tracking is ready. Press Play to continue.',
          );
          return;
        }

        ui.playSpellConfirm(gestureState.confirmedSpell);
        const castResult = game.castSpell(gestureState.confirmedSpell, timestamp);

        if (!castResult.accepted) {
          ui.setDebugMessage(`${castResult.headline}. ${castResult.detail}`);
        }
      }
    } catch (error) {
      handleTrackingRuntimeFailure(error);
    }
  };

  animationFrameId = requestAnimationFrame(renderLoop);
  return true;
}

function createSubsystems() {
  try {
    setStartupPhase('ui', 'loading', 'Creating the interface shell.');
    logStartupPhase('ui', 'Creating the interface shell.');
    ui = createUI();
    ui.setGestureMode();
    setStartupPhase('ui', 'ready', 'Interface shell ready.', { pushLog: true });
    bindGlobalListeners();
  } catch (error) {
    showEmergencyStartupError('UI startup failed', describeUiError(error), { showRetry: false });
    throw error;
  }

  try {
    setStartupPhase('game', 'loading', 'Creating the battle lane and gesture systems.');
    logStartupPhase('game', 'Creating the battle lane and gesture systems.');
    gestureController = createGestureController();
    handTracker = createHandTracker();
    game = createGame({
      canvas: ui.refs.gameCanvas,
      onStateChange: (state) => {
        ui.renderGameState(state);
      },
      onBattleEvent: (message) => {
        ui.pushDebugMessage(`[Battle] ${message}`);
      },
    });
    gameReady = true;
    setStartupPhase('game', 'ready', 'Battle lane ready.', { pushLog: true });
  } catch (error) {
    const message = error?.name?.startsWith('Game')
      ? describeGameError(error)
      : 'A core subsystem failed before startup could continue.';
    ui.setDebugMessage(message);
    ui.pushDebugMessage(message);
    ui.setStageNotice({
      title: 'Battle lane unavailable',
      hint: message,
      tone: 'error',
      hidden: false,
      showRetry: false,
    });
    showEmergencyStartupError('Game startup failed', message, { showRetry: false });
    throw error;
  }
}

async function initializeModel() {
  if (modelReady) {
    return { ok: true };
  }

  if (modelInitTask) {
    return modelInitTask;
  }

  modelInitTask = (async () => {
    ui.setModelStatus('loading', 'Loading model');
    setStartupPhase('model', 'loading', 'Loading the hand tracker model...', { pushLog: true });
    scheduleStartupNoticeTimers();

    try {
      await handTracker.init();
      modelReady = true;
      ui.setModelStatus('ready', 'Model online');
      ui.pushDebugMessage('MediaPipe Hand Landmarker loaded successfully.');
      setStartupPhase('model', 'ready', 'Hand tracker model ready.');
      updatePendingStartupNotice();
      console.info('[Mage Hands] Hand Landmarker ready.');
      return { ok: true };
    } catch (error) {
      modelReady = false;
      ui.setModelStatus('error', 'Model error');
      setStartupPhase('model', 'error', describeModelError(error), { pushLog: true });
      ui.setStageNotice({
        title: 'Tracking model unavailable',
        hint: describeModelError(error),
        tone: 'error',
        hidden: false,
        showRetry: true,
      });
      console.error('[Mage Hands] Failed to load Hand Landmarker.', error);
      return { ok: false, error };
    } finally {
      modelInitTask = null;
    }
  })();

  return modelInitTask;
}

async function initializeCamera() {
  if (cameraReady) {
    return { ok: true };
  }

  if (cameraInitTask) {
    return cameraInitTask;
  }

  cameraInitTask = (async () => {
    ui.setCameraStatus('loading', 'Requesting camera');
    setStartupPhase('camera', 'loading', 'Waiting for webcam permission...', { pushLog: true });
    scheduleStartupNoticeTimers();
    console.info('[Mage Hands] Requesting webcam access...');

    try {
      cameraSession = await startCamera(ui.refs.video);
      cameraReady = true;
      ui.setCameraMeta(describeCameraSettings(cameraSession.settings));
      ui.setCameraStatus('ready', 'Camera live');
      ui.pushDebugMessage('Webcam connected and ready for live tracking.');
      setStartupPhase('camera', 'ready', 'Webcam connected.');
      updatePendingStartupNotice();
      ui.syncOverlaySize();
      console.info('[Mage Hands] Webcam ready.');
      return { ok: true };
    } catch (error) {
      cameraReady = false;
      stopCamera(ui.refs.video);
      ui.setCameraStatus('error', 'Camera error');
      setStartupPhase('camera', 'error', describeCameraError(error), { pushLog: true });
      ui.setStageNotice({
        title: 'Camera access needed',
        hint: describeCameraError(error),
        tone: 'error',
        hidden: false,
        showRetry: true,
      });
      console.error('[Mage Hands] Failed to access webcam.', error);
      return { ok: false, error };
    } finally {
      cameraInitTask = null;
    }
  })();

  return cameraInitTask;
}

function startGameLoop() {
  if (!game || !gameReady) {
    return;
  }

  try {
    logStartupPhase('game', 'Starting the battle lane loop.');
    game.start();
    ui.pushDebugMessage('Battle lane initialized successfully.');
    setStartupPhase('game', 'ready', 'Battle lane running.');
  } catch (error) {
    const message = describeGameError(error);
    ui.setDebugMessage(message);
    ui.pushDebugMessage(message);
    ui.setStageNotice({
      title: 'Battle lane unavailable',
      hint: message,
      tone: 'error',
      hidden: false,
      showRetry: false,
    });
    throw error;
  }
}

function startBattleFromMenu() {
  if (!game || !gameReady || !ui) {
    showEmergencyStartupError(
      'Battle lane unavailable',
      'The battle lane is not ready yet. Refresh the page and try again.',
      { showRetry: false },
    );
    return;
  }

  if (gameStarted) {
    ui.setMainMenuVisible(false);
    return;
  }

  ui.setMainMenuVisible(false);
  ui.setInstructionMenuVisible(true);
  instructionMenuVisible = true;
  ui.setDebugMessage('Spell briefing opened. Press X when you are ready to begin.');
  ui.pushDebugMessage('Main menu dismissed. Spell briefing opened.');
}

function beginBattleFromInstructions() {
  if (!game || !gameReady || !ui) {
    showEmergencyStartupError(
      'Battle lane unavailable',
      'The battle lane is not ready yet. Refresh the page and try again.',
      { showRetry: false },
    );
    return;
  }

  instructionMenuVisible = false;
  ui.setInstructionMenuVisible(false);
  ui.setMainMenuVisible(false);

  if (!gameStarted) {
    game.restart();
    startGameLoop();
    gameStarted = true;
    ui.setDebugMessage('Battle started. Wave 1 is gathering behind the ward.');
    ui.pushDebugMessage('Spell briefing dismissed. Battle lane is now live.');
  }
}

async function boot() {
  setStartupPhase('boot', 'loading', 'Boot sequence started.', { pushLog: true });
  createSubsystems();

  ui.setCameraStatus('loading', 'Starting');
  ui.setModelStatus('loading', 'Loading');
  ui.setHandStatus('idle', 'Stand by');
  ui.setStageNotice({
    title: 'Starting spellcasting systems',
    hint: 'Waiting for webcam permission and loading the hand tracker.',
    tone: 'neutral',
    hidden: false,
    showRetry: false,
  });
  ui.renderGestureState(gestureController.observeNoHand());
  ui.renderGameState(game.getState());
  ui.setMainMenuVisible(true);
  ui.setInstructionMenuVisible(false);

  const [modelResult, cameraResult] = await Promise.all([
    initializeModel(),
    initializeCamera(),
  ]);

  clearStartupNoticeTimers();

  if (modelResult.ok && cameraResult.ok) {
    ui.pushDebugMessage('Startup phase [tracking]: starting the live tracking loop.');
    startTrackingLoop();
  }

  summarizeStartup(modelResult, cameraResult);
  setStartupPhase('boot', 'ready', 'Boot sequence settled.');
}

async function retrySetup() {
  if (!ui || !handTracker || !gestureController) {
    showEmergencyStartupError(
      'Retry unavailable',
      'Core UI startup failed before retry could be wired. Refresh the page to try again.',
      { showRetry: false },
    );
    return;
  }

  stopRenderLoop();
  clearStartupNoticeTimers();
  lastRawGesture = 'NO_INPUT';
  handPreviouslyVisible = false;
  ui.clearOverlay();
  setStartupPhase('boot', 'loading', 'Retrying startup sequence...', { pushLog: true });
  ui.pushDebugMessage('Retry requested by the user.');
  ui.setHandStatus('loading', 'Restarting');

  if (!gestureController) {
    gestureController = createGestureController();
  }

  if (!handTracker || !modelReady) {
    handTracker?.dispose?.();
    handTracker = createHandTracker();
    gestureController = createGestureController();
    ui.renderGestureState(gestureController.observeNoHand());
  }

  if (cameraInitTask || modelInitTask) {
    ui.pushDebugMessage('Retry joined the current startup attempt.');
    updatePendingStartupNotice();
  }

  const [modelResult, cameraResult] = await Promise.all([
    modelReady ? Promise.resolve({ ok: true }) : initializeModel(),
    cameraReady ? Promise.resolve({ ok: true }) : initializeCamera(),
  ]);

  clearStartupNoticeTimers();

  if (modelResult.ok && cameraResult.ok) {
    startTrackingLoop();
  }

  summarizeStartup(modelResult, cameraResult);
}

function restartBattle() {
  if (!game) {
    showEmergencyStartupError(
      'Battle lane unavailable',
      'The game subsystem is not available, so the battle cannot be restarted.',
      { showRetry: false },
    );
    return;
  }

  game.restart();
  gameStarted = true;
  instructionMenuVisible = false;
  ui?.setMainMenuVisible(false);
  ui?.setInstructionMenuVisible(false);
  ui.setDebugMessage('Battle reset. Wave 1 is regrouping and the lane will reopen after a short pause.');
}

function bindGlobalListeners() {
  if (listenersBound || !ui) {
    return;
  }

  listenersBound = true;

  ui.bindRetry(() => {
    retrySetup().catch((error) => {
      console.error('[Mage Hands] Retry failed.', error);
      ui.setDebugMessage('Retry failed. Check the console for details.');
      ui.pushDebugMessage('Retry failed unexpectedly.');
    });
  });

  ui.bindGameStart(() => {
    startBattleFromMenu();
  });

  ui.bindInstructionStart(() => {
    beginBattleFromInstructions();
  });

  ui.bindGameRestart(() => {
    restartBattle();
  });

  window.addEventListener('keydown', (event) => {
    if (instructionMenuVisible && (event.key === 'x' || event.key === 'X')) {
      event.preventDefault();
      beginBattleFromInstructions();
      return;
    }

    if ((event.key === 'r' || event.key === 'R' || event.key === 'Enter') && game?.getState().gameOver) {
      restartBattle();
    }
  });

  window.addEventListener('beforeunload', () => {
    stopRenderLoop();
    clearStartupNoticeTimers();
    stopCamera(ui?.refs?.video);
    handTracker?.dispose();
    ui?.dispose?.();
    game?.dispose();
  });
}

boot().catch((error) => {
    const message =
      error?.name?.startsWith('UI')
        ? describeUiError(error)
        : error?.name?.startsWith('Game')
          ? describeGameError(error)
          : 'A fatal startup error occurred before the app could finish initializing.';

    console.error('[Mage Hands] Fatal startup error.', error);

    if (ui) {
      ui.setDebugMessage(message);
      ui.pushDebugMessage(message);
      ui.setStageNotice({
        title: 'Fatal startup error',
        hint: message,
        tone: 'error',
        hidden: false,
        showRetry: false,
      });
      ui.setHandStatus('error', 'Startup blocked');
    } else {
      showEmergencyStartupError('Fatal startup error', message, { showRetry: false });
    }
  });
