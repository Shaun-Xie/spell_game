# Mage Hands

Mage Hands is a gesture-controlled browser game that turns live webcam hand poses into spellcasting combat. Built with Vite, vanilla JavaScript, MediaPipe Hand Landmarker, and HTML5 canvas, it pairs real-time computer vision with a polished wave-defense arena.

The player defends the left side of the battlefield while enemies advance from the right. Stable one-hand poses map to spells, enemy auras communicate weaknesses, and later waves introduce combo enemies that require short spell sequences.

## Highlights

- Real-time hand tracking in the browser with MediaPipe Hand Landmarker.
- Custom gesture classifier with pose stabilization, cooldown handling, and spell mapping.
- Canvas-based battle arena with waves, enemy archetypes, combo sequences, spell effects, HP, score, and restart flow.
- Guided tutorial that teaches gestures, aura matching, healing, and combo enemies before live waves begin.
- Responsive interface with camera/model status feedback, retry handling, fullscreen support, and GitHub Pages deployment.

## Gameplay

- Start from the main menu, review the rules, then complete the guided tutorial or skip into Wave 1.
- Match each enemy aura with the correct spell to defeat standard enemies in one hit.
- Later enemies show a two-step spell sequence above them and must be hit in that order.
- Heal restores player HP once per wave and refreshes at the start of the next wave.
- The battle ends when player HP reaches 0. Use the restart button, `R`, or `Enter` to play again.

## Controls

| Gesture | Spell | Primary use |
| --- | --- | --- |
| Closed fist | Fireball | Red aura enemies, including Briar Beast |
| Index finger only | Lightning | Yellow aura enemies, including Rune Construct |
| Thumbs up | Freeze | Blue-cyan aura enemies, including Shadow Wraith |
| Index + middle fingers | Heal | Restore HP once per wave |

If no mapped pose is held steadily enough, the HUD shows `No spell`.

## Tech Stack

- Vite for local development and production builds.
- Vanilla JavaScript ES modules for application structure.
- HTML5 canvas for gameplay rendering and effects.
- MediaPipe Tasks Vision for browser hand landmark detection.
- Tailwind CSS v4 with `@tailwindcss/vite` for styling.
- Lucide, Motion, and Howler for icons, interface animation, and lightweight sound feedback.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the local development server:

```bash
npm run dev
```

Open the Vite URL shown in the terminal, allow webcam access, and keep one hand inside the tracking panel. Vite `8.0.5` requires Node `20.19+` or `22.12+`.

## Production Build

Create a production build:

```bash
npm run build
```

Preview the built site locally:

```bash
npm run preview
```

Use `npm run preview` or a static server for the built app. Opening `dist/index.html` directly with `file://` does not provide the secure browser context required for webcam access.

## Deployment

The project includes a GitHub Actions workflow at `.github/workflows/deploy.yml` for GitHub Pages.

1. In the repository settings, set Pages to deploy from GitHub Actions.
2. Push to `main`.
3. The workflow installs dependencies, builds the Vite app, uploads `dist/`, and deploys the site.

The Vite base path is currently configured for a repository named `mage_hands`. If the repository name changes, update `githubPagesBase` in `vite.config.js`.

## Project Structure

```text
mage_hands/
  index.html
  package.json
  vite.config.js
  public/
    mediapipe/wasm/
  src/
    camera.js              Webcam startup and teardown
    enemies.js             Enemy archetypes and wave helpers
    game.js                Game state, tutorial flow, waves, and canvas rendering
    gestureClassifier.js   Landmark heuristics, smoothing, and spell mapping
    handTracker.js         MediaPipe model and WASM initialization
    main.js                Application startup and render loop coordination
    spells.js              Spell behavior, projectiles, beams, and effects
    styles.css             Application styling
    ui.js                  DOM references and HUD updates
    utils.js               Shared math and utility helpers
```

## Tuning

- Gameplay values live in `src/game.js` under `GAME_SETTINGS`, `WAVE_SETTINGS`, and `MATCH_SETTINGS`.
- Spell numbers live in `src/spells.js` under `SPELL_CONFIG`.
- Gesture thresholds and timing live in `src/gestureClassifier.js` under `GESTURE_THRESHOLDS` and `STABILITY_SETTINGS`.
- MediaPipe initialization options live in `src/handTracker.js` under `HAND_TRACKER_DEFAULTS`.

## Browser Notes

- Webcam access requires `localhost` or HTTPS hosting.
- Gesture accuracy depends on lighting, camera quality, hand framing, and pose clarity.
- Video processing runs in the browser; there is no backend service in this project.
- The MediaPipe WASM runtime is served from the local `public/mediapipe/wasm` assets with a CDN fallback. The hand landmark model is loaded from MediaPipe's hosted model URL.

## Future Improvements

- Self-host the hand landmark model for fully offline deployment.
- Add keyboard or pointer fallback controls for accessibility and easier testing.
- Expand the spell roster, enemy behaviors, and score persistence.
