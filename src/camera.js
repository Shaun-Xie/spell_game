const DEFAULT_CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

function waitForMetadata(videoElement) {
  if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    videoElement.onloadedmetadata = () => resolve();
  });
}

export async function startCamera(videoElement, constraints = DEFAULT_CAMERA_CONSTRAINTS) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support getUserMedia.');
  }

  stopCamera(videoElement);

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  videoElement.srcObject = stream;
  videoElement.autoplay = true;
  videoElement.muted = true;
  videoElement.playsInline = true;

  await waitForMetadata(videoElement);
  await videoElement.play();

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
