export const SPELL_THEME = {
  Neutral: { accent: '#6ee7f9', rgb: '110 231 249' },
  Fireball: { accent: '#fb923c', rgb: '251 146 60' },
  Freeze: { accent: '#bfdbfe', rgb: '191 219 254' },
  Lightning: { accent: '#facc15', rgb: '250 204 21' },
  Heal: { accent: '#34d399', rgb: '52 211 153' },
};

export {
  COMBO_ENEMY_ARCHETYPE_KEYS,
  ENEMY_ARCHETYPE_KEYS,
  ENEMY_ARCHETYPES,
  NORMAL_ENEMY_ARCHETYPE_KEYS,
  getEnemyArchetype,
  getEnemySequence,
  getEnemySpawnPool,
  getWaveComboLimit,
  isComboEnemyType,
} from './enemies.js';

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function rgbaFromRgbString(rgb, alpha = 1) {
  const normalizedAlpha = clamp(alpha, 0, 1);
  const channels = `${rgb ?? ''}`
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((value) => Number(value));

  if (channels.length !== 3 || channels.some((value) => Number.isNaN(value))) {
    return `rgba(255, 255, 255, ${normalizedAlpha})`;
  }

  const [red, green, blue] = channels;
  return `rgba(${red}, ${green}, ${blue}, ${normalizedAlpha})`;
}

export function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export function distance2D(pointA, pointB) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

export function averagePoint(points) {
  const total = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
      z: accumulator.z + (point.z ?? 0),
    }),
    { x: 0, y: 0, z: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
}

export function calculateAngle(pointA, pointB, pointC) {
  const vectorAB = {
    x: pointA.x - pointB.x,
    y: pointA.y - pointB.y,
  };
  const vectorCB = {
    x: pointC.x - pointB.x,
    y: pointC.y - pointB.y,
  };

  const magnitudeAB = Math.hypot(vectorAB.x, vectorAB.y);
  const magnitudeCB = Math.hypot(vectorCB.x, vectorCB.y);

  if (!magnitudeAB || !magnitudeCB) {
    return 0;
  }

  const dotProduct = vectorAB.x * vectorCB.x + vectorAB.y * vectorCB.y;
  const normalized = clamp(dotProduct / (magnitudeAB * magnitudeCB), -1, 1);

  return (Math.acos(normalized) * 180) / Math.PI;
}

export function formatDuration(milliseconds) {
  if (milliseconds <= 0) {
    return 'Ready';
  }

  return `${(milliseconds / 1000).toFixed(1)}s`;
}

export function timeStampLabel(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function createToneDataUri({
  sampleRate = 22050,
  durationMs = 180,
  frequencies = [523.25, 659.25, 783.99],
} = {}) {
  const frameCount = Math.floor((sampleRate * durationMs) / 1000);
  const buffer = new ArrayBuffer(44 + frameCount * 2);
  const view = new DataView(buffer);

  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  const dataSize = frameCount * 2;

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / sampleRate;
    const decay = Math.exp(-7 * (time / (durationMs / 1000)));
    const sample = frequencies.reduce((total, frequency, index) => {
      const weight = 1 / (index + 1.4);
      return total + Math.sin(2 * Math.PI * frequency * time) * weight;
    }, 0);

    const value = clamp(sample * decay * 0.55, -1, 1);
    view.setInt16(44 + frame * 2, value * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
}
