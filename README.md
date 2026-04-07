# Mage Hands

Mage Hands is a browser-based spellcasting battle demo built with Vite, vanilla JavaScript, and HTML5 canvas. The current build combines a polished webcam tracking interface with a simple side-view combat lane: the player mage defends the left side of the arena while enemies advance from the right.

## Project overview

- Webcam hand tracking runs in the browser with MediaPipe Hand Landmarker.
- The active control scheme is legacy one-hand casting only.
- Stable confirmed gestures trigger gameplay spells inside the battle lane.
- The game is designed for a quick class/demo presentation: readable, responsive, and visually polished without heavy asset requirements.

## Current active controls

- `Closed fist` -> `Fireball`
- `Index finger only` -> `Lightning`
- `Index + middle fingers` -> `Heal`
- `Thumbs up` -> `Freeze`

If no mapped pose is held steadily enough, the HUD shows `No spell`.

## Gameplay

- The player mage is anchored on the left side of the battlefield.
- Enemies spawn on the right and move left across a horizontal combat lane.
- `Fireball` launches a glowing projectile that travels toward the nearest enemy.
- `Lightning` instantly strikes the nearest enemy with a beam.
- `Heal` restores player HP and plays a healing pulse around the mage.
- `Freeze` launches an icy shard with frost burst feedback on hit. It is a visual/control spell identity for now and does not slow enemies yet.
- Score increases when enemies are defeated.
- The battle ends when player HP reaches `0`.
- Use the on-screen restart button or press `R` / `Enter` after game over to reset the fight.

## Local setup

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, allow webcam access, and keep one hand inside the tracking panel.

To test the built app locally, serve it instead of opening `dist/index.html` directly:

```bash
npm run preview
```

## Build instructions

```bash
npm run build
```

## GitHub Pages deployment notes

- The Vite base path is configured for project-site deployment from the `spell_game` repository.
- The app expects to be served from `/spell_game/`.
- Production assets are emitted into `dist/` and are ready for GitHub Pages publishing after `npm run build`.

## Libraries used

- `Vite` for local development and production builds
- `Tailwind CSS v4` with `@tailwindcss/vite` for styling
- `@mediapipe/tasks-vision` for browser hand landmark detection
- `Lucide` for UI icons
- `motion` for restrained interface animation
- `howler` for lightweight spell-confirm sound feedback

## Project structure

```text
spell_game/
  index.html
  package.json
  vite.config.js
  src/
    camera.js
    game.js
    gestureClassifier.js
    handTracker.js
    main.js
    spells.js
    styles.css
    ui.js
    utils.js
```

## Tuning guide

Main gameplay tuning points:

- Enemy speed: `src/game.js` inside `GAME_SETTINGS.enemySpeedMin` and `GAME_SETTINGS.enemySpeedMax`
- Player HP: `src/game.js` inside `GAME_SETTINGS.playerMaxHp`
- Spawn behavior: `src/game.js` inside `GAME_SETTINGS.maxActiveEnemies`, `spawnIntervalMinMs`, and `spawnIntervalMaxMs`
- Contact damage: `src/game.js` inside `GAME_SETTINGS.enemyContactDamage`
- Fireball / lightning / heal / freeze numbers: `src/spells.js` inside `SPELL_CONFIG`
- Freeze cast pulse and projectile tuning: `src/spells.js` inside `SPELL_CONFIG.Freeze`
- Projectile speed: `src/spells.js` inside `SPELL_CONFIG.Fireball.projectileSpeed`

Gesture tuning points:

- One-hand thresholds: `src/gestureClassifier.js` inside `GESTURE_THRESHOLDS`
- Temporal smoothing and cooldown: `src/gestureClassifier.js` inside `STABILITY_SETTINGS`
- Active mapping and mode label: `src/gestureClassifier.js`

UI tuning points:

- Theme colors, spacing, and panel styling: `src/styles.css`
- HUD text and panel copy: `index.html` and `src/ui.js`

## Known limitations

- Webcam gesture reliability still depends on lighting, framing, and camera quality.
- The app uses frontend-only browser APIs, so it requires webcam permission and a supported browser.
- Opening `dist/index.html` directly with `file://` will not provide a secure webcam context. Use `npm run dev`, `npm run preview`, or HTTPS hosting instead.
- MediaPipe model assets are loaded at runtime, so offline or restricted-network environments may need additional setup later.
- Gameplay balance is intentionally simple and tuned for readability, not depth.
- Live webcam calibration was not visually verified in this headless environment.
