import './styles.css';
import { describeCameraSettings, startCamera, stopCamera } from './camera.js';
import { createGestureController } from './gestureClassifier.js';
import { createGame } from './game.js';
import { createHandTracker } from './handTracker.js';
import { createUI } from './ui.js';

const ui = createUI();
const handTracker = createHandTracker();
const gestureController = createGestureController();
const game = createGame({
  canvas: ui.refs.gameCanvas,
  onStateChange: (state) => {
    ui.renderGameState(state);
  },
  onBattleEvent: (message) => {
    ui.setDebugMessage(message);
    ui.pushDebugMessage(message);
  },
});

ui.setGestureMode();

let cameraSession = null;
let animationFrameId = null;
let modelReady = false;
let cameraReady = false;
let lastRawGesture = 'NO_INPUT';
let handPreviouslyVisible = false;

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

function maybeStartLoop() {
  if (!modelReady || !cameraReady || animationFrameId) {
    return;
  }

  const idleCopy = getTrackingIdleCopy();
  ui.setStageNotice({
    title: idleCopy.title,
    hint: idleCopy.hint,
    tone: 'neutral',
    hidden: false,
    showRetry: false,
  });

  game.start();

  const renderLoop = (timestamp) => {
    animationFrameId = requestAnimationFrame(renderLoop);

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
  };

  animationFrameId = requestAnimationFrame(renderLoop);
}

async function initializeModel() {
  if (modelReady) {
    return;
  }

  ui.setModelStatus('loading', 'Loading model');
  console.info('[Mage Hands] Loading Hand Landmarker...');

  try {
    await handTracker.init();
    modelReady = true;
    ui.setModelStatus('ready', 'Model online');
    ui.pushDebugMessage('MediaPipe Hand Landmarker loaded successfully.');
    console.info('[Mage Hands] Hand Landmarker ready.');
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
  }
}

async function initializeCamera() {
  ui.setCameraStatus('loading', 'Requesting camera');
  console.info('[Mage Hands] Requesting webcam access...');

  try {
    cameraSession = await startCamera(ui.refs.video);
    cameraReady = true;
    ui.setCameraMeta(describeCameraSettings(cameraSession.settings));
    ui.setCameraStatus('ready', 'Camera live');
    ui.pushDebugMessage('Webcam connected and ready for live tracking.');
    ui.syncOverlaySize();
    console.info('[Mage Hands] Webcam ready.');
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
  }
}

async function boot() {
  ui.pushDebugMessage('Mage Hands boot sequence started.');
  ui.setDebugMessage('Boot sequence started.');
  ui.setCameraStatus('loading', 'Starting');
  ui.setModelStatus('loading', 'Loading');
  ui.setHandStatus('idle', 'Stand by');
  ui.renderGestureState(gestureController.observeNoHand());
  ui.renderGameState(game.getState());

  await Promise.allSettled([initializeModel(), initializeCamera()]);
  maybeStartLoop();
}

async function retrySetup() {
  stopRenderLoop();
  lastRawGesture = 'NO_INPUT';
  handPreviouslyVisible = false;

  if (!modelReady) {
    await initializeModel();
  }

  if (!cameraReady) {
    await initializeCamera();
  }

  maybeStartLoop();
}

function restartBattle() {
  game.restart();
  ui.setDebugMessage('Battle reset. Raise one hand and defend the lane again.');
}

ui.bindRetry(() => {
  retrySetup().catch((error) => {
    console.error('[Mage Hands] Retry failed.', error);
  });
});

ui.bindGameRestart(() => {
  restartBattle();
});

window.addEventListener('keydown', (event) => {
  if ((event.key === 'r' || event.key === 'R' || event.key === 'Enter') && game.getState().gameOver) {
    restartBattle();
  }
});

window.addEventListener('beforeunload', () => {
  stopRenderLoop();
  stopCamera(ui.refs.video);
  handTracker.dispose();
  game.dispose();
});

boot().catch((error) => {
  console.error('[Mage Hands] Fatal startup error.', error);
  ui.setDebugMessage('A fatal startup error occurred. Check the console for details.');
  ui.pushDebugMessage('A fatal startup error occurred.');
});
