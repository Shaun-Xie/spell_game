import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export const HAND_TRACKER_DEFAULTS = {
  // Keep this easy to swap if you later self-host the task file on GitHub Pages.
  modelAssetPath:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  wasmRoot: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  runningMode: 'VIDEO',
  numHands: 2,
  minHandDetectionConfidence: 0.55,
  minHandPresenceConfidence: 0.55,
  minTrackingConfidence: 0.5,
};

export function createHandTracker(customOptions = {}) {
  const options = { ...HAND_TRACKER_DEFAULTS, ...customOptions };
  let handLandmarker = null;
  let lastVideoTime = -1;

  async function init() {
    if (handLandmarker) {
      return handLandmarker;
    }

    const vision = await FilesetResolver.forVisionTasks(options.wasmRoot);

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: options.modelAssetPath,
      },
      runningMode: options.runningMode,
      numHands: options.numHands,
      minHandDetectionConfidence: options.minHandDetectionConfidence,
      minHandPresenceConfidence: options.minHandPresenceConfidence,
      minTrackingConfidence: options.minTrackingConfidence,
    });

    return handLandmarker;
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
    return getDetections(result)[0] ?? null;
  }

  function getDetections(result) {
    if (!result?.landmarks?.length) {
      return [];
    }

    return result.landmarks.map((landmarks, index) => ({
      landmarks,
      worldLandmarks: result.worldLandmarks?.[index] ?? null,
      handedness: result.handedness?.[index]?.[0]?.categoryName ?? 'Unknown',
      handednessScore: result.handedness?.[index]?.[0]?.score ?? 0,
    }));
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
    getDetections,
    getPrimaryDetection,
    dispose,
    options,
  };
}
