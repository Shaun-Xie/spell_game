const DEFAULT_CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

const CAMERA_START_TIMEOUT_MS = 12000;

function createCameraError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function waitForVideoReady(videoElement, timeoutMs = CAMERA_START_TIMEOUT_MS) {
  if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      videoElement.removeEventListener('loadedmetadata', onReady);
      videoElement.removeEventListener('loadeddata', onReady);
      videoElement.removeEventListener('canplay', onReady);
    };

    const finish = (callback) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const onReady = () => {
      finish(resolve);
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(
        createCameraError(
          'CameraStartupTimeout',
          'Timed out while waiting for the webcam video stream to become ready.',
        ),
      ));
    }, timeoutMs);

    videoElement.addEventListener('loadedmetadata', onReady);
    videoElement.addEventListener('loadeddata', onReady);
    videoElement.addEventListener('canplay', onReady);
  });
}

export async function startCamera(videoElement, constraints = DEFAULT_CAMERA_CONSTRAINTS) {
  if (!window.isSecureContext) {
    throw createCameraError(
      'InsecureContextError',
      'Webcam access requires localhost or HTTPS. Serve the app with npm run dev, npm run preview, or a secure host.',
    );
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw createCameraError(
      'GetUserMediaUnavailable',
      'This browser does not support getUserMedia.',
    );
  }

  stopCamera(videoElement);

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  videoElement.srcObject = stream;
  videoElement.autoplay = true;
  videoElement.muted = true;
  videoElement.playsInline = true;

  const playAttempt = videoElement.play();
  await waitForVideoReady(videoElement);

  if (playAttempt?.catch) {
    await playAttempt.catch(() => {});
  }

  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings?.() ?? {};

  return {
    stream,
    settings,
    stop() {
      stopCamera(videoElement);
    },
  };
}

export function stopCamera(videoElement) {
  const activeStream = videoElement?.srcObject;

  if (activeStream instanceof MediaStream) {
    activeStream.getTracks().forEach((track) => track.stop());
  }

  if (videoElement) {
    videoElement.srcObject = null;
  }
}

export function describeCameraSettings(settings = {}) {
  const width = settings.width ?? 0;
  const height = settings.height ?? 0;
  const frameRate = settings.frameRate ? Math.round(settings.frameRate) : null;

  if (!width || !height) {
    return 'Live webcam';
  }

  return frameRate ? `${width}x${height} @ ${frameRate}fps` : `${width}x${height}`;
}
