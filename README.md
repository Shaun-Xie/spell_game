# Mage Hands

Mage Hands is a browser-based prototype that turns webcam hand poses into spell casts. This first pass focuses on reliable camera input, MediaPipe hand tracking, rule-based gesture recognition, temporal smoothing, cooldowns, and a polished demo-ready HUD.

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

Vite will start a local dev server. Open the printed localhost URL, allow webcam access, and hold one hand in frame.

## Build for production

```bash
npm run build
```

The Vite base path is configured for GitHub Pages project deployment from the `spell_game` repository.

## Gesture mappings

- `Closed fist` -> `Fireball`
- `Open palm` -> `Shield`
- `Index finger only` -> `Lightning`
- `Index + middle fingers` -> `Heal`

If no mapped pose is stable, the HUD shows `No spell`.

## Libraries used

- `Vite` for local development and bundling
- `Tailwind CSS v4` with `@tailwindcss/vite` for styling
- `@mediapipe/tasks-vision` for browser hand landmark detection
- `Lucide` for interface icons
- `motion` for light panel and emphasis animations
- `howler` for lightweight spell confirmation audio

## Project structure

```text
spell_game/
  index.html
  package.json
  vite.config.js
  src/
    main.js
    styles.css
    camera.js
    handTracker.js
    gestureClassifier.js
    ui.js
    utils.js
```

## Tuning guide

- Gesture thresholds live in `src/gestureClassifier.js` inside `GESTURE_THRESHOLDS`.
- Smoothing and cooldown live in `src/gestureClassifier.js` inside `STABILITY_SETTINGS`.
- Theme colors, spacing, panel styles, and animation polish live in `src/styles.css`.
- The GitHub Pages deployment base path lives in `vite.config.js`.

## Finger-extension logic

The classifier treats each finger as extended when two checks agree:

1. The finger is mostly straight, based on the angle through its joints.
2. The fingertip reaches farther from the palm than the middle joint by a minimum ratio.

For the thumb, the code also checks horizontal spread relative to handedness, because the thumb opens sideways instead of straight upward like the other fingers.
