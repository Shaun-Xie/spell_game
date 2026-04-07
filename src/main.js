import './styles.css';
import { describeCameraSettings, startCamera, stopCamera } from './camera.js';
import { GESTURE_MODE, GESTURE_MODES, createGestureController } from './gestureClassifier.js';
import { createHandTracker } from './handTracker.js';
import { createUI } from './ui.js';

const ui = createUI();
const handTracker = createHandTracker();
const gestureController = createGestureController({ mode: GESTURE_MODE });

ui.setGestureMode(gestureController.mode);

let cameraSession = null;
let animationFrameId = null;
let modelReady = false;
let cameraReady = false;
let lastCandidateKey = 'NO_INPUT';
let handPreviouslyVisible = false;

function describeCameraError(error) {
  if (error?.name === 'NotAllowedError') {
    return 'Camera permission was denied. Allow webcam access and try again.';
  }

  if (error?.name === 'NotFoundError') {
    return 'No webcam was found on this device.';
  }

  return 'The webcam could not be started. Check browser permissions and camera availability.';
}

function describeModelError() {
  return 'The MediaPipe Hand Landmarker failed to load. Check your network connection and refresh.';
}

function stopRenderLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function getTrackingIdleCopy() {
  if (gestureController.mode === GESTURE_MODES.TWO_HAND) {
    return {
      title: 'Raise both hands into view',
      hint: 'Hold a mapped two-hand pose steady for a few frames to confirm a spell.',
    };
  }

  return {
    title: 'Raise one hand into view',
    hint: 'Hold a mapped pose steady for a few frames to confirm a spell.',
  };
}

function getTrackingMessage(state) {
  if (state.mode === GESTURE_MODES.TWO_HAND) {
    if (state.handCount === 0) {
      return 'Tracking is active, but no hands are currently visible.';
    }

    if (state.handCount === 1) {
      return 'One hand detected. A second hand is required for two-hand spell casting.';
    }

    if (!state.combinedCandidateKey || state.combinedCandidateKey === 'AMBIGUOUS_PAIR') {
      return 'Two hands detected, but the pair pose does not match a mapped spell yet.';
    }

    return `Detected pair candidate: ${state.combinedCandidateLabel}.`;
  }

  if (state.rawGesture === 'UNKNOWN') {
    return 'Hand detected, but the pose does not match one of the mapped spells yet.';
  }

  if (state.rawGesture === 'NO_HAND') {
    return 'Tracking is active, but no hand is currently visible.';
  }

  return `Detected raw gesture: ${state.rawGestureLabel}.`;
}

function updateStageNoticeForState(state) {
  if (state.mode === GESTURE_MODES.TWO_HAND) {
    if (state.handCount === 0) {
      ui.setStageNotice({
        title: 'Two hands needed',
        hint: 'Lift both hands into the webcam frame to begin pair casting.',
        tone: 'neutral',
        hidden: false,
        showRetry: false,
      });
      return;
    }

    if (state.handCount === 1) {
      ui.setStageNotice({
        title: 'Second hand needed',
        hint: 'Pair spells only trigger when both hands are visible and held intentionally.',
        tone: 'neutral',
        hidden: false,
        showRetry: false,
      });
      return;
    }
  } else if (state.handCount === 0) {
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
    hint: 'Landmarks are updating in real time. Hold a mapped pose to confirm a spell.',
    tone: 'neutral',
    hidden: true,
    showRetry: false,
  });
}

function describeTrackedHands(count) {
  return `${count} ${count === 1 ? 'hand' : 'hands'} visible`;
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

  const renderLoop = (timestamp) => {
    animationFrameId = requestAnimationFrame(renderLoop);

    const result = handTracker.detect(ui.refs.video, timestamp);

    if (!result) {
      return;
    }

    const detections = handTracker.getDetections(result);

    if (!detections.length) {
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

      lastCandidateKey = noHandState.combinedCandidateKey ?? 'NO_INPUT';
      return;
    }

    const gestureState = gestureController.evaluateDetections(detections, timestamp);
    handPreviouslyVisible = true;
    ui.setHandStatus('active', describeTrackedHands(gestureState.handCount));
    updateStageNoticeForState(gestureState);

    ui.renderGestureState(gestureState);
    ui.drawHandOverlay(detections, gestureState.stableSpell ?? gestureState.confirmedSpell);

    if ((gestureState.combinedCandidateKey ?? gestureState.rawGesture) !== lastCandidateKey) {
      ui.setDebugMessage(getTrackingMessage(gestureState));
      lastCandidateKey = gestureState.combinedCandidateKey ?? gestureState.rawGesture;
    }

    if (gestureState.confirmedSpell) {
      ui.setDebugMessage(`${gestureState.confirmedSpell} confirmed and cooldown started.`);
      ui.pushDebugMessage(
        `${gestureState.confirmedSpell} confirmed from ${gestureState.combinedCandidateLabel.toLowerCase()}.`,
      );
      ui.playSpellConfirm(gestureState.confirmedSpell);
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
    ui.setDebugMessage(describeModelError());
    ui.pushDebugMessage(describeModelError());
    ui.setStageNotice({
      title: 'Tracking model unavailable',
      hint: describeModelError(),
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

  await Promise.allSettled([initializeModel(), initializeCamera()]);
  maybeStartLoop();
}

async function retrySetup() {
  stopRenderLoop();
  lastCandidateKey = 'NO_INPUT';
  handPreviouslyVisible = false;

  if (!modelReady) {
    await initializeModel();
  }

  if (!cameraReady) {
    await initializeCamera();
  }

  maybeStartLoop();
}

ui.bindRetry(() => {
  retrySetup().catch((error) => {
    console.error('[Mage Hands] Retry failed.', error);
  });
});

window.addEventListener('beforeunload', () => {
  stopRenderLoop();
  stopCamera(ui.refs.video);
  handTracker.dispose();
});

boot().catch((error) => {
  console.error('[Mage Hands] Fatal startup error.', error);
  ui.setDebugMessage('A fatal startup error occurred. Check the console for details.');
  ui.pushDebugMessage('A fatal startup error occurred.');
});
