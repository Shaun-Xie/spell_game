import closedFistSvg from './assets/gestures/closed-fist.svg?raw';
import indexMiddleSvg from './assets/gestures/index-middle.svg?raw';
import indexPointSvg from './assets/gestures/index-point.svg?raw';
import thumbsUpSvg from './assets/gestures/thumbs-up.svg?raw';

function svgToDataUri(svgMarkup) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
}

export const GESTURE_ICON_ASSETS = {
  closedFist: {
    label: 'Closed fist',
    src: svgToDataUri(closedFistSvg),
  },
  indexPoint: {
    label: 'Index point',
    src: svgToDataUri(indexPointSvg),
  },
  indexMiddle: {
    label: 'Index + middle',
    src: svgToDataUri(indexMiddleSvg),
  },
  thumbsUp: {
    label: 'Thumbs up',
    src: svgToDataUri(thumbsUpSvg),
  },
};

export const SPELL_GESTURE_ICON_KEY = {
  Fireball: 'closedFist',
  Lightning: 'indexPoint',
  Heal: 'indexMiddle',
  Freeze: 'thumbsUp',
};

export function createGestureIconSprites() {
  if (typeof Image === 'undefined') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(GESTURE_ICON_ASSETS).map(([key, icon]) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = icon.src;

      return [key, { ...icon, image }];
    }),
  );
}

export function getGestureIconSprite(spellName, sprites) {
  const iconKey = SPELL_GESTURE_ICON_KEY[spellName];

  if (!iconKey) {
    return null;
  }

  return sprites[iconKey] ?? null;
}

export function getGestureIconAsset(spellName) {
  const iconKey = SPELL_GESTURE_ICON_KEY[spellName];

  if (!iconKey) {
    return null;
  }

  return GESTURE_ICON_ASSETS[iconKey] ?? null;
}
