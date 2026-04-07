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
    title: 'Raise one hand into view',
    hint: 'Hold a mapped one-hand pose steady for a few frames to cast into the battle lane.',
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
      title: 'No hand detected',
      hint: 'Raise one hand inside the webcam frame to begin casting.',
      tone: 'neutral',
      hidden: false,
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
    ui.setDebugMessage('Startup complete. Camera, tracker, and battle lane are live.');
    ui.pushDebugMessage('Startup complete. Camera, tracker, and battle lane are live.');
    return;
  }

  if (!modelResult.ok && !cameraResult.ok) {
    ui.setHandStatus('error', 'Startup blocked');
    ui.setDebugMessage('Camera and tracker both failed. The battle lane is running, but spellcasting is offline.');
    ui.pushDebugMessage('Startup incomplete: camera and tracker are both unavailable.');
    ui.setStageNotice({
      title: 'Spellcasting offline',
      hint: 'Camera and hand-tracker startup both failed. Fix permissions or network access, then retry.',
      tone: 'error',
      hidden: false,
      showRetry: true,
    });
    return;
  }

  if (!cameraResult.ok) {
    ui.setHandStatus('error', 'Camera unavailable');
    ui.setDebugMessage('The battle lane is running, but webcam access failed. Fix camera access, then retry.');
    ui.pushDebugMessage('Startup incomplete: webcam access failed.');
    return;
  }

  ui.setHandStatus('error', 'Tracker unavailable');
  ui.setDebugMessage('The battle lane is running, but hand tracking failed. Retry after the model finishes loading normally.');
  ui.pushDebugMessage('Startup incomplete: hand-tracker initialization failed.');
}

function handleTrackingRuntimeFailure(error) {
  const message = describeTrackingRuntimeError(error);

  stopRenderLoop();
  handPreviouslyVisible = false;
  lastRawGesture = 'NO_INPUT';
  modelReady = false;
  cameraReady = Boolean(cameraSession);
  handTracker?.dispose?.();
  handTracker = null;
  gestureController = createGestureController();

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
    hidden: false,
    showRetry: false,
  });
  ui.setHandStatus('ready', 'Tracking online');
  ui.setDebugMessage('Tracking loop active. Waiting for live video frames.');
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
        ui.setHandStatus('idle', 'No hand detected');
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
    logStartupPhase('ui', 'Creating the interface shell.');
    ui = createUI();
    ui.setGestureMode();
    ui.pushDebugMessage('Startup phase [ui]: interface shell ready.');
  } catch (error) {
    showEmergencyStartupError('UI startup failed', describeUiError(error), { showRetry: false });
    throw error;
  }

  try {
    logStartupPhase('game', 'Creating the battle lane and gesture systems.');
    gestureController = createGestureController();
    handTracker = createHandTracker();
    game = createGame({
      canvas: ui.refs.gameCanvas,
      onStateChange: (state) => {
        ui.renderGameState(state);
      },
      onBattleEvent: (message) => {
        ui.setDebugMessage(message);
        ui.pushDebugMessage(message);
      },
    });
    gameReady = true;
    ui.pushDebugMessage('Startup phase [game]: battle lane ready.');
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
  ui.setModelStatus('loading', 'Loading model');
  ui.pushDebugMessage('Startup phase [model]: loading the Hand Landmarker.');
  console.info('[Mage Hands] Loading Hand Landmarker...');

  try {
    await handTracker.init();
    modelReady = true;
    ui.setModelStatus('ready', 'Model online');
    ui.pushDebugMessage('MediaPipe Hand Landmarker loaded successfully.');
    console.info('[Mage Hands] Hand Landmarker ready.');
    return { ok: true };
  } catch (error) {
    modelReady = false;
    ui.setModelStatus('error', 'Model error');
    ui.setDebugMessage(describeModelError(error));
    ui.pushDebugMessage(describeModelError(error));
    ui.setStageNotice({
      title: 'Tracking model unavailable',
      hint: describeModelError(error),
      tone: 'error',
      hidden: false,
      showRetry: true,
    });
    console.error('[Mage Hands] Failed to load Hand Landmarker.', error);
    return { ok: false, error };
  }
}

async function initializeCamera() {
  ui.setCameraStatus('loading', 'Requesting camera');
  ui.pushDebugMessage('Startup phase [camera]: requesting webcam access.');
  console.info('[Mage Hands] Requesting webcam access...');

  try {
    cameraSession = await startCamera(ui.refs.video);
    cameraReady = true;
    ui.setCameraMeta(describeCameraSettings(cameraSession.settings));
    ui.setCameraStatus('ready', 'Camera live');
    ui.pushDebugMessage('Webcam connected and ready for live tracking.');
    ui.syncOverlaySize();
    console.info('[Mage Hands] Webcam ready.');
    return { ok: true };
  } catch (error) {
    cameraReady = false;
    stopCamera(ui.refs.video);
    ui.setCameraStatus('error', 'Camera error');
    ui.setDebugMessage(describeCameraError(error));
    ui.pushDebugMessage(describeCameraError(error));
    ui.setStageNotice({
      title: 'Camera access needed',
      hint: describeCameraError(error),
      tone: 'error',
      hidden: false,
      showRetry: true,
    });
    console.error('[Mage Hands] Failed to access webcam.', error);
    return { ok: false, error };
  }
}

function startGameLoop() {
  if (!game || !gameReady) {
    return;
  }

  try {
    logStartupPhase('game', 'Starting the battle lane loop.');
    game.start();
    ui.pushDebugMessage('Battle lane initialized successfully.');
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

async function boot() {
  logStartupPhase('boot', 'Boot sequence started.');
  createSubsystems();

  ui.setCameraStatus('loading', 'Starting');
  ui.setModelStatus('loading', 'Loading');
  ui.setHandStatus('idle', 'Stand by');
  ui.renderGestureState(gestureController.observeNoHand());
  ui.renderGameState(game.getState());
  startGameLoop();

  const [modelResult, cameraResult] = await Promise.all([
    initializeModel(),
    initializeCamera(),
  ]);

  if (modelResult.ok && cameraResult.ok) {
    ui.pushDebugMessage('Startup phase [tracking]: starting the live tracking loop.');
    startTrackingLoop();
  }

  summarizeStartup(modelResult, cameraResult);
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
  lastRawGesture = 'NO_INPUT';
  handPreviouslyVisible = false;
  ui.clearOverlay();
  ui.setDebugMessage('Retrying startup sequence...');
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

  const [modelResult, cameraResult] = await Promise.all([
    modelReady ? Promise.resolve({ ok: true }) : initializeModel(),
    cameraReady ? Promise.resolve({ ok: true }) : initializeCamera(),
  ]);

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
  ui.setDebugMessage('Battle reset. Raise one hand and defend the lane again.');
}

function bindGlobalListeners() {
  ui.bindRetry(() => {
    retrySetup().catch((error) => {
      console.error('[Mage Hands] Retry failed.', error);
      ui.setDebugMessage('Retry failed. Check the console for details.');
      ui.pushDebugMessage('Retry failed unexpectedly.');
    });
  });

  ui.bindGameRestart(() => {
    restartBattle();
  });

  window.addEventListener('keydown', (event) => {
    if ((event.key === 'r' || event.key === 'R' || event.key === 'Enter') && game?.getState().gameOver) {
      restartBattle();
    }
  });

  window.addEventListener('beforeunload', () => {
    stopRenderLoop();
    stopCamera(ui?.refs?.video);
    handTracker?.dispose();
    ui?.dispose?.();
    game?.dispose();
  });
}

boot()
  .then(() => {
    if (ui) {
      bindGlobalListeners();
    }
  })
  .catch((error) => {
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
