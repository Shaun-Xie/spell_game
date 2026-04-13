# Mage Hands

Mage Hands is a browser-based spellcasting battle demo built with Vite, vanilla JavaScript, and HTML5 canvas. The current build combines a polished webcam tracking interface with a simple side-view combat lane: the player mage defends the left side of the arena while enemies advance from the right.

## Project overview

- Webcam hand tracking runs in the browser with MediaPipe Hand Landmarker.
- The active control scheme is legacy one-hand casting only.
- Stable confirmed gestures trigger gameplay spells inside the battle lane.
- The page opens to a main menu, then a short instruction overlay, then a guided in-game tutorial before the real wave battle begins.
- The game is designed for a quick class/demo presentation: readable, responsive, and visually polished without heavy asset requirements.

## Current active controls

- `Closed fist` -> `Fireball`
- `Index finger only` -> `Lightning`
- `Index + middle fingers` -> `Heal`
- `Thumbs up` -> `Freeze`

If no mapped pose is held steadily enough, the HUD shows `No spell`.

## Gameplay

- The player mage is anchored on the left side of the battlefield.
- Enemies now arrive in distinct waves instead of an endless stream.
- Each wave spawns on the right and advances left across the combat lane.
- There are three enemy archetypes:
  - `Briar Beast` has a red aura and is defeated by `Fireball`
  - `Rune Construct` has a yellow aura and is defeated by `Lightning`
  - `Shadow Wraith` has a blue-cyan aura and is defeated by `Freeze`
- Matching the correct spell defeats that enemy in one hit and awards score.
- Using the wrong attack spell shows impact feedback, but the enemy survives.
- `Heal` restores player HP and never damages enemies.
- `Heal` is limited to one use per wave and refreshes when the next combat wave begins.
- Click `Play`, read the short instruction panel, then begin the guided tutorial.
- The tutorial teaches gesture casting, aura matching, the three enemy weaknesses, heal timing, and the overall lane flow.
- Each enemy lesson requires the correct spell before the tutorial advances.
- The tutorial can be skipped from the in-game tutorial panel if you want to jump straight to Wave 1.
- When a wave is cleared, the game enters a short intermission before the next wave begins.
- Later waves now scale up faster through larger enemy counts, faster movement, tighter spawn pacing, and denser concurrent pressure.
- The battle ends when player HP reaches `0`.
- Use the on-screen restart button or press `R` / `Enter` after game over to reset the fight.

## Local setup

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, allow webcam access, and keep one hand inside the tracking panel.

Vite `8.0.5` in this project requires Node `20.19+` or `22.12+`.

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

## Deploy to GitHub Pages

1. Go to `Settings > Pages` in the GitHub repository.
2. Under `Build and deployment`, choose `GitHub Actions` as the source.
3. Push to `main` to trigger `.github/workflows/deploy.yml` and publish the site.

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
- Wave size, intermission timing, spawn pacing, and concurrent-enemy caps: `src/game.js` inside `WAVE_SETTINGS`
- Base spawn timing: `src/game.js` inside `GAME_SETTINGS.spawnIntervalMinMs` and `GAME_SETTINGS.spawnIntervalMaxMs`
- Heal availability per wave: `src/game.js` inside the wave state and `castSpell(...)`
- Contact damage: `src/game.js` inside `GAME_SETTINGS.enemyContactDamage`
- Wrong-spell feedback and pushback: `src/game.js` inside `MATCH_SETTINGS`
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
