import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const LOCAL_WASM_ROOT = `${import.meta.env.BASE_URL}mediapipe/wasm`;

function createTrackerError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function withTimeout(promise, timeoutMs, name, message) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(createTrackerError(name, message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export const HAND_TRACKER_DEFAULTS = {
  // The model still comes from MediaPipe's hosted asset, but the WASM runtime
  // is served locally first so startup is less dependent on CDN availability.
  modelAssetPath:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  wasmRoot: LOCAL_WASM_ROOT,
  wasmFallbackRoots: [
    LOCAL_WASM_ROOT,
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm',
  ],
  runningMode: 'VIDEO',
  numHands: 1,
  minHandDetectionConfidence: 0.55,
  minHandPresenceConfidence: 0.55,
  minTrackingConfidence: 0.5,
  initTimeoutMs: 12000,
};

export function createHandTracker(customOptions = {}) {
  const options = { ...HAND_TRACKER_DEFAULTS, ...customOptions };
  let handLandmarker = null;
  let lastVideoTime = -1;

  async function init() {
    if (handLandmarker) {
      return handLandmarker;
    }

    const wasmRoots = Array.from(
      new Set([options.wasmRoot, ...(options.wasmFallbackRoots ?? [])].filter(Boolean)),
    );
    let lastError = null;

    for (const wasmRoot of wasmRoots) {
      try {
        const vision = await withTimeout(
          FilesetResolver.forVisionTasks(wasmRoot),
          options.initTimeoutMs,
          'MediaPipeWasmTimeout',
          'Timed out while loading the MediaPipe runtime.',
        );

        handLandmarker = await withTimeout(
          HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: options.modelAssetPath,
            },
            runningMode: options.runningMode,
            numHands: options.numHands,
            minHandDetectionConfidence: options.minHandDetectionConfidence,
            minHandPresenceConfidence: options.minHandPresenceConfidence,
            minTrackingConfidence: options.minTrackingConfidence,
          }),
          options.initTimeoutMs,
          'HandLandmarkerInitTimeout',
          'Timed out while creating the Hand Landmarker.',
        );

        return handLandmarker;
      } catch (error) {
        lastError = error;
        console.warn('[Mage Hands] Hand tracker init failed for runtime:', wasmRoot, error);
      }
    }

    throw lastError ?? createTrackerError('HandTrackerInitError', 'Failed to initialize the hand tracker.');
  }

  function detect(videoElement, timestampMs = performance.now()) {
    if (!handLandmarker || !videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    if (videoElement.currentTime === lastVideoTime) {
      return null;
    }

    lastVideoTime = videoElement.currentTime;
    return handLandmarker.detectForVideo(videoElement, timestampMs);
  }

  function getPrimaryDetection(result) {
    if (!result?.landmarks?.[0]) {
      return null;
    }

    return {
      landmarks: result.landmarks[0],
      worldLandmarks: result.worldLandmarks?.[0] ?? null,
      handedness: result.handedness?.[0]?.[0]?.categoryName ?? 'Unknown',
      handednessScore: result.handedness?.[0]?.[0]?.score ?? 0,
    };
  }

  function dispose() {
    if (handLandmarker?.close) {
      handLandmarker.close();
    }

    handLandmarker = null;
    lastVideoTime = -1;
  }

  return {
    init,
    detect,
    getPrimaryDetection,
    dispose,
    options,
  };
}
