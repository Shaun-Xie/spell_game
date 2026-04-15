import {
  ENEMY_ARCHETYPE_KEYS,
  clamp,
  formatDuration,
  getEnemyArchetype,
  randomRange,
  rgbaFromRgbString,
} from './utils.js';
import {
  SPELL_CONFIG,
  applySpellCast,
  createBurstParticles,
  createRingEffect,
} from './spells.js';

export const GAME_SETTINGS = {
  playerMaxHp: 100,
  playerRadius: 34,
  enemyRadius: 28,
  enemySpeedMin: 82,
  enemySpeedMax: 118,
  enemyContactDamage: 16,
  spawnIntervalMinMs: 1200,
  spawnIntervalMaxMs: 2300,
  laneYFactors: [0.34, 0.54, 0.74],
};

export const MATCH_SETTINGS = {
  wrongSpellPushbackPx: 16,
  wrongSpellFlashMs: 260,
  wrongSpellParticleCount: 10,
};

export const WAVE_SETTINGS = {
  initialCountdownMs: 1400,
  intermissionDurationMs: 1900,
  baseEnemyCount: 6,
  enemyCountIncreasePerWave: 2,
  maxEnemyCount: 18,
  speedIncreasePerWave: 15,
  spawnReductionPerWaveMs: 170,
  spawnIntervalMinFloorMs: 560,
  spawnIntervalMaxFloorMs: 1160,
  maxConcurrentEnemiesBase: 3,
  maxConcurrentEnemiesIncreaseEvery: 1,
  maxConcurrentEnemiesCap: 6,
  spawnBackpressureMs: 180,
  waveBannerDurationMs: 1550,
};

const TUTORIAL_SETTINGS = {
  enemySpeed: 72,
  enemySpawnInsetFactor: 0.04,
  enemyHoldOffsetPx: 72,
  healLessonDamage: 30,
  stepAdvanceDelayMs: 520,
};

const TUTORIAL_STEPS = [
  {
    key: 'spell-signs',
    title: 'Step 1 · Spell Signs',
    description: 'Each one-hand sign casts a spell into the lane once the pose locks in.',
    objective: 'Cast any mapped spell to continue.',
    action: 'cast_any',
    accentSpell: 'Neutral',
    highlights: [
      'Closed fist -> Fireball',
      'Index only -> Lightning',
      'Index + middle -> Heal',
      'Thumbs up -> Freeze',
    ],
  },
  {
    key: 'aura-matching',
    title: 'Step 2 · Read The Aura',
    description: 'Aura color reveals the enemy weakness before you cast.',
    objective: 'Red means Fireball. Yellow means Lightning. Blue-cyan means Freeze.',
    action: 'auto',
    autoAdvanceDelayMs: 1700,
    accentSpell: 'Neutral',
    highlights: [
      'Red aura -> Fireball',
      'Yellow aura -> Lightning',
      'Blue-cyan aura -> Freeze',
    ],
  },
  {
    key: 'briar-beast',
    title: 'Step 3 · Briar Beast',
    description: 'The Briar Beast glows red, so it falls to Fireball.',
    objective: 'Cast Fireball to defeat the Briar Beast.',
    action: 'enemy',
    enemyType: 'EMBER',
    expectedSpell: 'Fireball',
    accentSpell: 'Fireball',
    highlights: [
      'Enemy: Briar Beast',
      'Aura: Red',
      'Weakness: Fireball',
    ],
  },
  {
    key: 'rune-construct',
    title: 'Step 4 · Rune Construct',
    description: 'The Rune Construct crackles with yellow energy, so answer with Lightning.',
    objective: 'Cast Lightning to defeat the Rune Construct.',
    action: 'enemy',
    enemyType: 'STORM',
    expectedSpell: 'Lightning',
    accentSpell: 'Lightning',
    highlights: [
      'Enemy: Rune Construct',
      'Aura: Yellow',
      'Weakness: Lightning',
    ],
  },
  {
    key: 'shadow-wraith',
    title: 'Step 5 · Shadow Wraith',
    description: 'The Shadow Wraith carries a blue-cyan aura and must be frozen.',
    objective: 'Cast Freeze to defeat the Shadow Wraith.',
    action: 'enemy',
    enemyType: 'FROST',
    expectedSpell: 'Freeze',
    accentSpell: 'Freeze',
    highlights: [
      'Enemy: Shadow Wraith',
      'Aura: Blue-cyan',
      'Weakness: Freeze',
    ],
  },
  {
    key: 'heal-lesson',
    title: 'Step 6 · Heal',
    description: 'Heal restores HP and refreshes once each real combat wave.',
    objective: 'Cast Heal now to restore the mage.',
    action: 'heal',
    accentSpell: 'Heal',
    highlights: [
      'Gesture: Index + middle',
      'Effect: Restores HP',
      'Limit: Once per wave',
    ],
  },
  {
    key: 'tutorial-complete',
    title: 'Tutorial Complete',
    description: 'You are ready for live waves: read the aura, answer with the matching spell, and save Heal for a rough moment.',
    objective: 'Press Start Wave 1 when you are ready.',
    action: 'continue',
    continueLabel: 'Start Wave 1',
    accentSpell: 'Neutral',
    progressLabel: 'Ready',
    showSkip: false,
    completed: true,
    highlights: [
      'Red -> Fireball',
      'Yellow -> Lightning',
      'Blue-cyan -> Freeze',
      'Heal: once per wave',
    ],
  },
];

function createGameError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function createResizeBinding(target, callback) {
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(callback);
    observer.observe(target);

    return {
      disconnect() {
        observer.disconnect();
      },
    };
  }

  window.addEventListener('resize', callback);

  return {
    disconnect() {
      window.removeEventListener('resize', callback);
    },
  };
}

function createInitialState() {
  const openingWave = getWaveProfile(1);

  return {
    player: {
      hp: GAME_SETTINGS.playerMaxHp,
      maxHp: GAME_SETTINGS.playerMaxHp,
      radius: GAME_SETTINGS.playerRadius,
      x: 0,
      y: 0,
      freezeCastMs: 0,
      healPulseMs: 0,
      damageFlashMs: 0,
    },
    enemies: [],
    projectiles: [],
    particles: [],
    beams: [],
    rings: [],
    score: 0,
    defeatedEnemies: 0,
    spawnCooldownMs: 0,
    gameOver: false,
    currentWave: 1,
    waveSize: openingWave.enemyCount,
    waveSpawned: 0,
    waveResolved: 0,
    waveState: 'intermission',
    healUsedThisWave: false,
    nextWaveCountdownMs: WAVE_SETTINGS.initialCountdownMs,
    waveBannerLabel: 'NEXT WAVE',
    waveBannerText: 'Wave 1',
    waveBannerMs: WAVE_SETTINGS.waveBannerDurationMs,
    waveBannerMaxMs: WAVE_SETTINGS.waveBannerDurationMs,
    feedText: 'Wave 1 is gathering. Read the aura: red for Fireball, yellow for Lightning, blue-cyan for Freeze.',
    tutorial: {
      active: false,
      completed: false,
      stepIndex: -1,
      pendingStepIndex: null,
      pendingAdvanceAt: 0,
      targetEnemyId: null,
    },
    nextEnemyId: 1,
    nextProjectileId: 1,
  };
}

function getSpellImpactColor(spellName) {
  if (spellName === 'Fireball') {
    return '251 146 60';
  }

  if (spellName === 'Lightning') {
    return '250 204 21';
  }

  if (spellName === 'Freeze') {
    return '191 219 254';
  }

  if (spellName === 'Heal') {
    return '52 211 153';
  }

  return '110 231 249';
}

function getWaveProfile(waveNumber) {
  const waveIndex = Math.max(0, waveNumber - 1);

  return {
    enemyCount: Math.min(
      WAVE_SETTINGS.baseEnemyCount + waveIndex * WAVE_SETTINGS.enemyCountIncreasePerWave,
      WAVE_SETTINGS.maxEnemyCount,
    ),
    enemySpeedMin: GAME_SETTINGS.enemySpeedMin + waveIndex * WAVE_SETTINGS.speedIncreasePerWave,
    enemySpeedMax: GAME_SETTINGS.enemySpeedMax + waveIndex * WAVE_SETTINGS.speedIncreasePerWave,
    spawnIntervalMinMs: Math.max(
      WAVE_SETTINGS.spawnIntervalMinFloorMs,
      GAME_SETTINGS.spawnIntervalMinMs - waveIndex * WAVE_SETTINGS.spawnReductionPerWaveMs,
    ),
    spawnIntervalMaxMs: Math.max(
      WAVE_SETTINGS.spawnIntervalMaxFloorMs,
      GAME_SETTINGS.spawnIntervalMaxMs - waveIndex * WAVE_SETTINGS.spawnReductionPerWaveMs,
    ),
    maxConcurrentEnemies: Math.min(
      WAVE_SETTINGS.maxConcurrentEnemiesBase
        + Math.floor(waveIndex / WAVE_SETTINGS.maxConcurrentEnemiesIncreaseEvery),
      WAVE_SETTINGS.maxConcurrentEnemiesCap,
    ),
  };
}

function getWaveBannerState(state) {
  if (!state.waveBannerText || state.waveBannerMs <= 0 || state.gameOver) {
    return {
      visible: false,
      label: '',
      text: '',
      opacity: 0,
      offsetY: 12,
      scale: 0.98,
    };
  }

  const progress = 1 - state.waveBannerMs / Math.max(state.waveBannerMaxMs, 1);
  const fadeIn = Math.min(progress / 0.16, 1);
  const fadeOut = Math.min(state.waveBannerMs / 360, 1);
  const opacity = Math.min(fadeIn, fadeOut);

  return {
    visible: opacity > 0.01,
    label: state.waveBannerLabel || 'NEXT WAVE',
    text: state.waveBannerText,
    opacity,
    offsetY: (1 - opacity) * 10,
    scale: 0.985 + opacity * 0.015,
  };
}

function resolveLayout(width, height) {
  const laneYs = GAME_SETTINGS.laneYFactors.map((factor) => height * factor);

  return {
    width,
    height,
    laneYs,
    playerX: width * 0.16,
    playerY: laneYs[1],
    spawnX: width * 0.93,
    contactX: width * 0.23,
    floorY: height * 0.83,
  };
}

export function createGame({
  canvas,
  onStateChange = () => {},
  onBattleEvent = () => {},
  autoStart = false,
} = {}) {
  if (!canvas) {
    throw createGameError('GameCanvasMissingError', 'The battle canvas element is missing.');
  }

  const context = canvas.getContext?.('2d');

  if (!context) {
    throw createGameError(
      'GameCanvasContextError',
      'The battle canvas could not create a 2D rendering context.',
    );
  }

  const state = createInitialState();
  let animationFrameId = null;
  let lastFrameTime = 0;
  let viewportWidth = 960;
  let viewportHeight = 540;
  let layout = resolveLayout(viewportWidth, viewportHeight);

  function pushBattleEvent(headline, detail = '') {
    const message = detail ? `${headline}. ${detail}` : headline;
    state.feedText = message;
    onBattleEvent(message);
  }

  function syncLayout() {
    const bounds = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;

    viewportWidth = Math.max(bounds.width, 1);
    viewportHeight = Math.max(bounds.height, 1);
    canvas.width = Math.round(viewportWidth * devicePixelRatio);
    canvas.height = Math.round(viewportHeight * devicePixelRatio);
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    layout = resolveLayout(viewportWidth, viewportHeight);
    state.player.x = layout.playerX;
    state.player.y = layout.playerY;
  }

  const resizeBinding = createResizeBinding(canvas, syncLayout);
  syncLayout();

  function getTutorialStep(stepIndex = state.tutorial.stepIndex) {
    return TUTORIAL_STEPS[stepIndex] ?? null;
  }

  function clearCombatActors({ keepEffects = false } = {}) {
    state.enemies = [];
    state.projectiles = [];
    state.beams = [];

    if (!keepEffects) {
      state.particles = [];
      state.rings = [];
    }
  }

  function queueTutorialAdvance(nextStepIndex, now, delayMs = TUTORIAL_SETTINGS.stepAdvanceDelayMs) {
    if (!state.tutorial.active) {
      return;
    }

    state.tutorial.pendingStepIndex = nextStepIndex;
    state.tutorial.pendingAdvanceAt = now + delayMs;
  }

  function spawnTutorialEnemy(typeKey, now) {
    const archetype = getEnemyArchetype(typeKey);
    const tutorialHoldX = Math.max(
      layout.contactX + GAME_SETTINGS.enemyRadius + TUTORIAL_SETTINGS.enemyHoldOffsetPx,
      viewportWidth * 0.52,
    );
    const enemy = createEnemy(now, getWaveProfile(1), {
      typeKey,
      laneIndex: 1,
      speed: TUTORIAL_SETTINGS.enemySpeed,
      spawnX: layout.spawnX - viewportWidth * TUTORIAL_SETTINGS.enemySpawnInsetFactor,
      tutorialStopX: tutorialHoldX,
      preventContactDamage: true,
    });

    state.enemies.push(enemy);
    state.tutorial.targetEnemyId = enemy.id;
    state.particles.push(
      ...createBurstParticles({
        x: enemy.x,
        y: getEnemyY(enemy, now),
        color: archetype.rgb,
        count: 12,
        minSpeed: 30,
        maxSpeed: 140,
        lifeMs: 460,
      }),
    );
    state.rings.push(
      createRingEffect({
        x: enemy.x,
        y: getEnemyY(enemy, now),
        color: archetype.rgb,
        maxRadius: enemy.radius * 1.8,
        lifeMs: 420,
        lineWidth: 2,
      }),
    );
  }

  function enterTutorialStep(stepIndex, now = performance.now()) {
    const step = getTutorialStep(stepIndex);

    if (!step) {
      return;
    }

    state.tutorial.stepIndex = stepIndex;
    state.tutorial.pendingStepIndex = null;
    state.tutorial.pendingAdvanceAt = 0;
    state.tutorial.targetEnemyId = null;
    state.tutorial.completed = Boolean(step.completed);
    state.waveState = 'tutorial';
    state.spawnCooldownMs = 0;
    state.nextWaveCountdownMs = 0;
    state.waveBannerMs = 0;
    state.waveBannerMaxMs = 0;
    state.waveBannerLabel = '';
    state.waveBannerText = '';
    clearCombatActors();

    if (step.action === 'heal') {
      state.player.hp = Math.max(
        Math.round(state.player.maxHp * 0.65),
        state.player.maxHp - TUTORIAL_SETTINGS.healLessonDamage,
      );
      state.player.damageFlashMs = 180;
    } else {
      state.player.hp = state.player.maxHp;
      state.player.damageFlashMs = 0;
    }

    if (step.action === 'enemy') {
      spawnTutorialEnemy(step.enemyType, now);
    }

    if (step.action === 'auto') {
      queueTutorialAdvance(
        state.tutorial.stepIndex + 1,
        now,
        step.autoAdvanceDelayMs ?? TUTORIAL_SETTINGS.stepAdvanceDelayMs,
      );
    }

    pushBattleEvent(step.title, step.objective);
  }

  function startTutorial(now = performance.now()) {
    state.tutorial.active = true;
    state.tutorial.completed = false;
    state.tutorial.stepIndex = -1;
    state.tutorial.pendingStepIndex = null;
    state.tutorial.pendingAdvanceAt = 0;
    state.tutorial.targetEnemyId = null;
    enterTutorialStep(0, now);
  }

  function beginMainGame(now = performance.now(), { skipped = false } = {}) {
    const freshState = createInitialState();
    Object.assign(state, freshState);
    syncLayout();
    state.feedText = skipped
      ? 'Tutorial skipped. Wave 1 is gathering. Read the aura before you cast.'
      : 'Tutorial complete. Wave 1 is gathering beyond the gate.';
    state.waveBannerLabel = skipped ? 'WAVE 1' : 'TUTORIAL COMPLETE';
    state.waveBannerText = 'Wave 1';
    state.waveBannerMs = WAVE_SETTINGS.waveBannerDurationMs;
    state.waveBannerMaxMs = WAVE_SETTINGS.waveBannerDurationMs;
    onBattleEvent(
      skipped
        ? 'Tutorial skipped. Wave 1 begins after a short pause.'
        : 'Tutorial complete. Wave 1 begins after a short pause.',
    );
  }

  function updateTutorialProgress(now) {
    if (!state.tutorial.active || state.tutorial.pendingStepIndex == null) {
      return;
    }

    if (now < state.tutorial.pendingAdvanceAt) {
      return;
    }

    const nextStepIndex = state.tutorial.pendingStepIndex;
    state.tutorial.pendingStepIndex = null;
    state.tutorial.pendingAdvanceAt = 0;

    if (nextStepIndex >= TUTORIAL_STEPS.length) {
      beginMainGame(now);
      return;
    }

    enterTutorialStep(nextStepIndex, now);
  }

  function getTutorialSnapshot() {
    if (!state.tutorial.active) {
      return { active: false };
    }

    const step = getTutorialStep();

    if (!step) {
      return { active: false };
    }

    return {
      active: true,
      key: step.key,
      title: step.title,
      description: step.description,
      objective: step.objective,
      accentSpell: step.accentSpell ?? 'Neutral',
      highlights: step.highlights ?? [],
      canContinue: step.action === 'continue',
      continueLabel: step.continueLabel ?? 'Continue',
      showSkip: step.showSkip ?? true,
      progressLabel:
        step.progressLabel ?? `Lesson ${state.tutorial.stepIndex + 1} / ${TUTORIAL_STEPS.length}`,
    };
  }

  function scheduleNextSpawn() {
    const waveProfile = getWaveProfile(state.currentWave);
    state.spawnCooldownMs = randomRange(
      waveProfile.spawnIntervalMinMs,
      waveProfile.spawnIntervalMaxMs,
    );
  }

  function getEnemyY(enemy, now = performance.now()) {
    if (enemy.type === 'FROST') {
      return layout.laneYs[enemy.laneIndex]
        + Math.sin(now / 230 + enemy.bobOffset) * 8
        + Math.cos(now / 510 + enemy.bobOffset * 0.7) * 3;
    }

    if (enemy.type === 'STORM') {
      return layout.laneYs[enemy.laneIndex] + Math.sin(now / 440 + enemy.bobOffset) * 3;
    }

    return layout.laneYs[enemy.laneIndex]
      + Math.sin(now / 260 + enemy.bobOffset) * 4
      + Math.sin(now / 610 + enemy.bobOffset * 1.2) * 2;
  }

  function createEnemy(now, waveProfile, options = {}) {
    const laneIndex = Number.isInteger(options.laneIndex)
      ? clamp(options.laneIndex, 0, layout.laneYs.length - 1)
      : Math.floor(randomRange(0, layout.laneYs.length));
    const typeKey = options.typeKey
      ?? ENEMY_ARCHETYPE_KEYS[Math.floor(randomRange(0, ENEMY_ARCHETYPE_KEYS.length))];
    const archetype = getEnemyArchetype(typeKey);

    return {
      id: state.nextEnemyId++,
      type: archetype.key,
      weaknessSpell: archetype.spell,
      x: options.spawnX ?? (layout.spawnX + randomRange(0, viewportWidth * 0.08)),
      y: layout.laneYs[laneIndex],
      laneIndex,
      radius: GAME_SETTINGS.enemyRadius,
      speed: options.speed ?? randomRange(waveProfile.enemySpeedMin, waveProfile.enemySpeedMax),
      hp: 1,
      maxHp: 1,
      bobOffset: randomRange(0, Math.PI * 2),
      hitFlash: 0,
      hitFlashMs: 0,
      hitFlashColor: archetype.rgb,
      spawnFlashMs: 260,
      tutorialStopX: options.tutorialStopX ?? null,
      preventContactDamage: Boolean(options.preventContactDamage),
    };
  }

  function spawnEnemy(now) {
    if (state.gameOver || state.waveState !== 'combat') {
      return;
    }

    if (state.waveSpawned >= state.waveSize) {
      state.spawnCooldownMs = 0;
      return;
    }

    const waveProfile = getWaveProfile(state.currentWave);

    if (state.enemies.length >= waveProfile.maxConcurrentEnemies) {
      state.spawnCooldownMs = WAVE_SETTINGS.spawnBackpressureMs;
      return;
    }

    const enemy = createEnemy(now, waveProfile);
    const archetype = getEnemyArchetype(enemy.type);
    state.enemies.push(enemy);
    state.waveSpawned += 1;
    state.particles.push(
      ...createBurstParticles({
        x: enemy.x,
        y: getEnemyY(enemy, now),
        color: archetype.rgb,
        count: 12,
        minSpeed: 30,
        maxSpeed: 140,
        lifeMs: 460,
      }),
    );
    state.rings.push(
      createRingEffect({
        x: enemy.x,
        y: getEnemyY(enemy, now),
        color: archetype.rgb,
        maxRadius: enemy.radius * 1.8,
        lifeMs: 420,
        lineWidth: 2,
      }),
    );

    if (state.waveSpawned < state.waveSize) {
      scheduleNextSpawn();
    } else {
      state.spawnCooldownMs = 0;
    }
  }

  function damagePlayer(baseDamage, now) {
    const finalDamage = Math.max(1, Math.round(baseDamage));
    state.player.hp = clamp(state.player.hp - finalDamage, 0, state.player.maxHp);
    state.player.damageFlashMs = 240;
    pushBattleEvent(`The mage took ${finalDamage} damage`);

    if (state.player.hp <= 0) {
      state.gameOver = true;
      pushBattleEvent('Game over', 'The right-side assault broke through the defense line.');
    }
  }

  function defeatEnemy(enemy, now, spellName = 'Neutral') {
    const archetype = getEnemyArchetype(enemy.type);
    const scoreValue = SPELL_CONFIG[spellName]?.scoreValue ?? 10;
    const burstColor = getSpellImpactColor(spellName);
    const isTutorialEnemy = state.tutorial.active;

    if (!isTutorialEnemy) {
      state.score += scoreValue;
      state.defeatedEnemies += 1;
      state.waveResolved += 1;
    }
    state.rings.push(
      createRingEffect({
        x: enemy.x,
        y: getEnemyY(enemy, now),
        color: burstColor,
        maxRadius: enemy.radius * 2.4,
        lifeMs: 420,
        lineWidth: 3,
      }),
    );
    state.particles.push(
      ...createBurstParticles({
        x: enemy.x,
        y: getEnemyY(enemy, now),
        color: burstColor,
        count: 20,
        minSpeed: 60,
        maxSpeed: 230,
        lifeMs: 520,
      }),
    );
    pushBattleEvent(
      'Correct spell',
      isTutorialEnemy
        ? `${spellName} shattered the ${archetype.label}.`
        : `${spellName} shattered the ${archetype.label} enemy. Score +${scoreValue}.`,
    );

    if (isTutorialEnemy) {
      const tutorialStep = getTutorialStep();

      if (
        tutorialStep?.action === 'enemy'
        && tutorialStep.expectedSpell === spellName
        && enemy.id === state.tutorial.targetEnemyId
      ) {
        state.tutorial.targetEnemyId = null;
        queueTutorialAdvance(state.tutorial.stepIndex + 1, now);
      }
    }
  }

  function startWave(now) {
    state.waveState = 'combat';
    state.nextWaveCountdownMs = 0;
    state.waveSpawned = 0;
    state.waveResolved = 0;
    state.healUsedThisWave = false;
    state.spawnCooldownMs = 0;
    state.rings.push(
      createRingEffect({
        x: layout.spawnX - 12,
        y: layout.playerY,
        color: '110 231 249',
        maxRadius: viewportHeight * 0.18,
        lifeMs: 520,
        lineWidth: 2,
      }),
    );
    pushBattleEvent(
      `Wave ${state.currentWave} begins`,
      `${state.waveSize} enemies are advancing through the lane.`,
    );
    spawnEnemy(now);
  }

  function queueNextWave(now) {
    const clearedWave = state.currentWave;
    const nextWave = state.currentWave + 1;
    const nextProfile = getWaveProfile(nextWave);

    state.waveState = 'intermission';
    state.currentWave = nextWave;
    state.waveSize = nextProfile.enemyCount;
    state.waveSpawned = 0;
    state.waveResolved = 0;
    state.spawnCooldownMs = 0;
    state.nextWaveCountdownMs = WAVE_SETTINGS.intermissionDurationMs;
    state.waveBannerLabel = 'NEXT WAVE';
    state.waveBannerText = `Wave ${nextWave}`;
    state.waveBannerMs = WAVE_SETTINGS.waveBannerDurationMs;
    state.waveBannerMaxMs = WAVE_SETTINGS.waveBannerDurationMs;
    state.rings.push(
      createRingEffect({
        x: layout.playerX,
        y: layout.playerY,
        color: '110 231 249',
        maxRadius: viewportHeight * 0.12,
        lifeMs: 460,
        lineWidth: 2,
      }),
    );
    pushBattleEvent(
      `Wave ${clearedWave} cleared`,
      `Wave ${nextWave} begins in ${(WAVE_SETTINGS.intermissionDurationMs / 1000).toFixed(1)}s.`,
    );
  }

  function resolveSpellHit(enemy, spellName, now) {
    const archetype = getEnemyArchetype(enemy.type);
    const impactColor = getSpellImpactColor(spellName);
    const impactX = enemy.x;
    const impactY = getEnemyY(enemy, now);

    enemy.hitFlash = 1;
    enemy.hitFlashMs = MATCH_SETTINGS.wrongSpellFlashMs;
    enemy.hitFlashColor = impactColor;

    if (spellName === archetype.spell) {
      enemy.hp = 0;
      state.rings.push(
        createRingEffect({
          x: impactX,
          y: impactY,
          color: impactColor,
          maxRadius: enemy.radius * 2.3,
          lifeMs: 360,
          lineWidth: 3,
        }),
      );
      state.particles.push(
        ...createBurstParticles({
          x: impactX,
          y: impactY,
          color: impactColor,
          count: 22,
          minSpeed: 60,
          maxSpeed: 220,
          lifeMs: 420,
        }),
      );
      return { matched: true, defeated: true };
    }

    enemy.x = Math.min(enemy.x + MATCH_SETTINGS.wrongSpellPushbackPx, viewportWidth - enemy.radius * 0.7);
    state.rings.push(
      createRingEffect({
        x: impactX,
        y: impactY,
        color: impactColor,
        maxRadius: enemy.radius * 1.55,
        lifeMs: 250,
        lineWidth: 2,
      }),
    );
    state.particles.push(
      ...createBurstParticles({
        x: impactX,
        y: impactY,
        color: impactColor,
        count: MATCH_SETTINGS.wrongSpellParticleCount,
        minSpeed: 32,
        maxSpeed: 110,
        lifeMs: 260,
      }),
      ...createBurstParticles({
        x: impactX,
        y: impactY,
        color: archetype.rgb,
        count: 6,
        minSpeed: 16,
        maxSpeed: 64,
        minRadius: 1,
        maxRadius: 3,
        lifeMs: 240,
      }),
    );
    pushBattleEvent('Wrong spell', `${spellName} does not break the ${archetype.label} enemy.`);
    return { matched: false, defeated: false };
  }

  function updateEnemies(deltaSeconds, now) {
    for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = state.enemies[index];

      enemy.y = getEnemyY(enemy, now);
      enemy.x -= enemy.speed * deltaSeconds;
      if (enemy.preventContactDamage && enemy.tutorialStopX != null && enemy.x <= enemy.tutorialStopX) {
        enemy.x = enemy.tutorialStopX;
      }
      enemy.hitFlashMs = Math.max(0, enemy.hitFlashMs - deltaSeconds * 1000);
      enemy.hitFlash = enemy.hitFlashMs > 0 ? enemy.hitFlashMs / 180 : 0;
      enemy.spawnFlashMs = Math.max(0, enemy.spawnFlashMs - deltaSeconds * 1000);

      if (enemy.hp <= 0) {
        state.enemies.splice(index, 1);
        continue;
      }

      if (enemy.preventContactDamage) {
        continue;
      }

      if (enemy.x - enemy.radius <= layout.contactX) {
        state.particles.push(
          ...createBurstParticles({
            x: enemy.x,
            y: getEnemyY(enemy, now),
            color: '248 113 113',
            count: 14,
            minSpeed: 40,
            maxSpeed: 180,
            lifeMs: 360,
          }),
        );
        state.waveResolved += 1;
        damagePlayer(GAME_SETTINGS.enemyContactDamage, now);
        state.enemies.splice(index, 1);
      }
    }
  }

  function updateProjectiles(deltaSeconds, now) {
    for (let index = state.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = state.projectiles[index];
      projectile.life -= deltaSeconds * 1000;
      projectile.x += projectile.vx * deltaSeconds;
      projectile.y += projectile.vy * deltaSeconds;

      state.particles.push(
        ...createBurstParticles({
          x: projectile.x,
          y: projectile.y,
          color: projectile.spellName === 'Freeze' ? '224 242 254' : projectile.color,
          count: projectile.spellName === 'Freeze' ? 2 : 1,
          minSpeed: projectile.spellName === 'Freeze' ? 10 : 8,
          maxSpeed: projectile.spellName === 'Freeze' ? 34 : 26,
          minRadius: 1,
          maxRadius: projectile.spellName === 'Freeze' ? 4 : 3,
          lifeMs: projectile.spellName === 'Freeze' ? 260 : 220,
        }),
      );

      if (
        projectile.life <= 0 ||
        projectile.x > viewportWidth + projectile.radius ||
        projectile.y < -40 ||
        projectile.y > viewportHeight + 40
      ) {
        state.projectiles.splice(index, 1);
        continue;
      }

      const hitEnemy = state.enemies.find((enemy) => {
        const enemyY = getEnemyY(enemy, now);
        return Math.hypot(projectile.x - enemy.x, projectile.y - enemyY) <= projectile.radius + enemy.radius;
      });

      if (!hitEnemy) {
        continue;
      }

      const spellName = projectile.spellName ?? 'Fireball';
      const result = resolveSpellHit(hitEnemy, spellName, now);

      if (projectile.spellName === 'Freeze') {
        state.rings.push(
          createRingEffect({
            x: hitEnemy.x,
            y: getEnemyY(hitEnemy, now),
            color: '103 232 249',
            maxRadius: hitEnemy.radius * 2.2,
            lifeMs: result.matched ? 420 : 260,
            lineWidth: 2,
          }),
        );
      }

      if (result.defeated) {
        defeatEnemy(hitEnemy, now, spellName);
        state.enemies = state.enemies.filter((enemy) => enemy.id !== hitEnemy.id);
      }

      state.projectiles.splice(index, 1);
    }
  }

  function updateEffects(deltaSeconds) {
    state.player.freezeCastMs = Math.max(0, state.player.freezeCastMs - deltaSeconds * 1000);
    state.player.healPulseMs = Math.max(0, state.player.healPulseMs - deltaSeconds * 1000);
    state.player.damageFlashMs = Math.max(0, state.player.damageFlashMs - deltaSeconds * 1000);
    state.waveBannerMs = Math.max(0, state.waveBannerMs - deltaSeconds * 1000);

    state.beams = state.beams
      .map((beam) => ({ ...beam, life: beam.life - deltaSeconds * 1000 }))
      .filter((beam) => beam.life > 0);

    state.rings = state.rings
      .map((ring) => ({
        ...ring,
        life: ring.life - deltaSeconds * 1000,
        radius: ring.maxRadius * (1 - (ring.life - deltaSeconds * 1000) / ring.maxLife),
      }))
      .filter((ring) => ring.life > 0);

    state.particles = state.particles
      .map((particle) => ({
        ...particle,
        life: particle.life - deltaSeconds * 1000,
        x: particle.x + particle.vx * deltaSeconds,
        y: particle.y + particle.vy * deltaSeconds,
        vx: particle.vx * 0.98,
        vy: particle.vy * 0.98,
      }))
      .filter((particle) => particle.life > 0);
  }

  function updateWaveState(deltaMs, now) {
    if (state.gameOver) {
      return;
    }

    if (state.tutorial.active) {
      return;
    }

    if (state.waveState === 'intermission') {
      state.nextWaveCountdownMs = Math.max(0, state.nextWaveCountdownMs - deltaMs);

      if (state.nextWaveCountdownMs <= 0) {
        startWave(now);
      }

      return;
    }

    const waveFinished =
      state.waveState === 'combat'
      && state.waveSpawned >= state.waveSize
      && state.waveResolved >= state.waveSize
      && state.enemies.length === 0;

    if (waveFinished) {
      queueNextWave(now);
    }
  }

  function getSnapshot(now = performance.now()) {
    const freezeRemainingMs = state.player.freezeCastMs;
    const tutorial = getTutorialSnapshot();
    const betweenWaves = !state.gameOver && !tutorial.active && state.waveState === 'intermission';
    const threatsRemaining = Math.max(state.waveSize - state.waveResolved, 0);
    const healAvailable = tutorial.active
      ? tutorial.key === 'heal-lesson'
      : !state.gameOver && state.waveState === 'combat' && !state.healUsedThisWave;
    const waveBanner = getWaveBannerState(state);
    const gameStateLabel = state.gameOver
      ? 'Game over'
      : tutorial.active
        ? 'Tutorial'
      : betweenWaves
        ? 'Between waves'
        : 'In combat';
    const phaseDisplayLabel = tutorial.active
      ? tutorial.progressLabel
      : state.gameOver
        ? 'Game over'
        : betweenWaves
          ? `Intermission · ${formatDuration(state.nextWaveCountdownMs)}`
          : `Combat · ${threatsRemaining} left`;

    return {
      playerHp: state.player.hp,
      playerMaxHp: state.player.maxHp,
      score: state.score,
      defeatedEnemies: state.defeatedEnemies,
      currentWave: state.currentWave,
      waveSize: state.waveSize,
      threatsRemaining,
      enemiesAlive: state.enemies.length,
      betweenWaves,
      nextWaveCountdownMs: betweenWaves ? state.nextWaveCountdownMs : 0,
      healAvailable,
      healUsedThisWave: state.healUsedThisWave,
      healStatusLabel: tutorial.active
        ? tutorial.key === 'heal-lesson'
          ? 'Cast it now'
          : 'Tutorial lesson'
        : state.gameOver
          ? 'Stopped'
          : state.waveState !== 'combat'
            ? 'Ready next wave'
            : state.healUsedThisWave
              ? 'Used this wave'
              : 'Ready this wave',
      freezeRemainingMs,
      freezeActive: freezeRemainingMs > 0,
      waveBanner,
      gameOver: state.gameOver,
      gameStateLabel,
      waveDisplayLabel: tutorial.active ? 'Tutorial' : `Wave ${state.currentWave}`,
      phaseDisplayLabel,
      feedText: state.feedText,
      tutorial,
    };
  }

  function renderBackground(now) {
    const skyGradient = context.createLinearGradient(0, 0, 0, viewportHeight);
    skyGradient.addColorStop(0, '#07111d');
    skyGradient.addColorStop(0.5, '#08141f');
    skyGradient.addColorStop(1, '#04070d');
    context.fillStyle = skyGradient;
    context.fillRect(0, 0, viewportWidth, viewportHeight);

    const playerGlow = context.createRadialGradient(
      layout.playerX,
      layout.playerY - 30,
      0,
      layout.playerX,
      layout.playerY - 30,
      viewportWidth * 0.32,
    );
    playerGlow.addColorStop(0, rgbaFromRgbString('56 189 248', 0.18));
    playerGlow.addColorStop(1, rgbaFromRgbString('56 189 248', 0));
    context.fillStyle = playerGlow;
    context.fillRect(0, 0, viewportWidth, viewportHeight);

    const gateGlow = context.createRadialGradient(
      viewportWidth * 0.88,
      layout.playerY,
      0,
      viewportWidth * 0.88,
      layout.playerY,
      viewportWidth * 0.24,
    );
    gateGlow.addColorStop(0, rgbaFromRgbString('251 146 60', 0.14));
    gateGlow.addColorStop(1, rgbaFromRgbString('251 146 60', 0));
    context.fillStyle = gateGlow;
    context.fillRect(0, 0, viewportWidth, viewportHeight);

    context.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let index = 0; index < 18; index += 1) {
      const x = (index / 18) * viewportWidth;
      const y = 36 + Math.sin(now / 1800 + index * 0.6) * 12;
      context.beginPath();
      context.arc(x, y, 1.3, 0, Math.PI * 2);
      context.fill();
    }

    context.strokeStyle = rgbaFromRgbString('148 163 184', 0.14);
    context.lineWidth = 1;
    layout.laneYs.forEach((laneY, laneIndex) => {
      context.beginPath();
      context.moveTo(layout.playerX - 40, laneY + laneIndex * 2);
      context.lineTo(viewportWidth * 0.94, laneY + laneIndex * 2);
      context.stroke();
    });

    context.fillStyle = 'rgba(255, 255, 255, 0.04)';
    context.beginPath();
    context.ellipse(layout.playerX, layout.floorY, 120, 20, 0, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = rgbaFromRgbString('110 231 249', 0.2);
    context.lineWidth = 2;
    context.beginPath();
    context.arc(layout.playerX, layout.playerY, 52, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = rgbaFromRgbString('251 146 60', 0.18);
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(viewportWidth * 0.91, layout.playerY, 42, 92, 0, 0, Math.PI * 2);
    context.stroke();
  }

  function drawHealthBar(x, y, width, progress, color) {
    context.fillStyle = 'rgba(15, 23, 42, 0.8)';
    context.fillRect(x, y, width, 6);
    context.fillStyle = color;
    context.fillRect(x, y, width * progress, 6);
  }

  function drawSparkStar(x, y, outerRadius, color, { innerRadius = outerRadius * 0.42, alpha = 1 } = {}) {
    context.save();
    context.translate(x, y);
    context.fillStyle = color;
    context.globalAlpha = alpha;
    context.beginPath();

    for (let index = 0; index < 8; index += 1) {
      const radius = index % 2 === 0 ? outerRadius : innerRadius;
      const angle = -Math.PI / 2 + (Math.PI / 4) * index;
      const pointX = Math.cos(angle) * radius;
      const pointY = Math.sin(angle) * radius;

      if (index === 0) {
        context.moveTo(pointX, pointY);
      } else {
        context.lineTo(pointX, pointY);
      }
    }

    context.closePath();
    context.fill();
    context.restore();
  }

  function renderEnemyAura(enemy, y, archetype, now) {
    const pulse = 0.72 + Math.sin(now / 260 + enemy.bobOffset) * 0.14;
    const isFrost = enemy.type === 'FROST';
    const outerRadius = enemy.radius * (isFrost ? 2.55 + pulse * 0.24 : 2.2 + pulse * 0.18);
    const aura = context.createRadialGradient(enemy.x, y, 0, enemy.x, y, outerRadius);

    if (isFrost) {
      aura.addColorStop(0, rgbaFromRgbString('224 242 254', 0.28 + pulse * 0.12));
      aura.addColorStop(0.34, rgbaFromRgbString(archetype.rgb, 0.22 + pulse * 0.08));
      aura.addColorStop(0.72, rgbaFromRgbString('56 189 248', 0.12 + pulse * 0.04));
      aura.addColorStop(1, rgbaFromRgbString('56 189 248', 0));
    } else {
      aura.addColorStop(0, rgbaFromRgbString(archetype.rgb, 0.18 + pulse * 0.08));
      aura.addColorStop(0.55, rgbaFromRgbString(archetype.rgb, 0.1 + pulse * 0.04));
      aura.addColorStop(1, rgbaFromRgbString(archetype.rgb, 0));
    }

    context.fillStyle = aura;
    context.beginPath();
    context.arc(enemy.x, y, outerRadius, 0, Math.PI * 2);
    context.fill();

    if (isFrost) {
      context.fillStyle = rgbaFromRgbString('224 242 254', 0.08 + pulse * 0.05);
      context.beginPath();
      context.ellipse(enemy.x, y + enemy.radius * 0.46, enemy.radius * 1.36, enemy.radius * 0.46, 0, 0, Math.PI * 2);
      context.fill();
    }

    context.strokeStyle = isFrost
      ? rgbaFromRgbString('191 219 254', 0.24 + pulse * 0.1)
      : rgbaFromRgbString(archetype.rgb, 0.16 + pulse * 0.08);
    context.lineWidth = 2;
    context.beginPath();
    context.arc(enemy.x, y, enemy.radius * (isFrost ? 1.58 + pulse * 0.1 : 1.45 + pulse * 0.08), 0, Math.PI * 2);
    context.stroke();

    if (isFrost) {
      context.strokeStyle = rgbaFromRgbString('56 189 248', 0.16 + pulse * 0.08);
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(enemy.x, y, enemy.radius * (1.94 + pulse * 0.08), 0, Math.PI * 2);
      context.stroke();
    }

    context.fillStyle = rgbaFromRgbString(isFrost ? '191 219 254' : archetype.rgb, 0.18 + pulse * 0.08);
    for (let index = 0; index < (isFrost ? 4 : 3); index += 1) {
      const angle = enemy.bobOffset + now / (isFrost ? 380 : 460) + index * ((Math.PI * 2) / (isFrost ? 4 : 3));
      const moteRadius = enemy.radius * (isFrost ? 1.18 + index * 0.18 : 1.3 + index * 0.16);
      const moteX = enemy.x + Math.cos(angle) * moteRadius;
      const moteY = y + Math.sin(angle) * moteRadius * (isFrost ? 0.52 : 0.58);
      context.beginPath();
      context.arc(moteX, moteY, (isFrost ? 2.6 : 2.2) + index * 0.4, 0, Math.PI * 2);
      context.fill();
    }
  }

  function renderBriarBeast(enemy, y, archetype, now) {
    const sway = Math.sin(now / 230 + enemy.bobOffset) * 2.4;

    context.strokeStyle = archetype.bodySecondary;
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(enemy.x - 10, y - 4);
    context.lineTo(enemy.x - enemy.radius * 0.92, y - 10 + sway);
    context.lineTo(enemy.x - enemy.radius * 1.08, y + enemy.radius * 0.2);
    context.moveTo(enemy.x + 10, y - 5);
    context.lineTo(enemy.x + enemy.radius * 0.88, y - 16 - sway * 0.6);
    context.lineTo(enemy.x + enemy.radius * 1.06, y + enemy.radius * 0.04);
    context.stroke();

    context.fillStyle = archetype.bodyPrimary;
    context.beginPath();
    context.moveTo(enemy.x, y - enemy.radius * 1.02);
    context.lineTo(enemy.x + enemy.radius * 0.7, y - enemy.radius * 0.34);
    context.lineTo(enemy.x + enemy.radius * 0.82, y + enemy.radius * 0.38);
    context.lineTo(enemy.x + enemy.radius * 0.3, y + enemy.radius * 0.88);
    context.lineTo(enemy.x - enemy.radius * 0.34, y + enemy.radius * 0.94);
    context.lineTo(enemy.x - enemy.radius * 0.84, y + enemy.radius * 0.34);
    context.lineTo(enemy.x - enemy.radius * 0.7, y - enemy.radius * 0.42);
    context.closePath();
    context.fill();

    context.fillStyle = archetype.bodyShadow;
    context.beginPath();
    context.ellipse(enemy.x - 4, y + 5, enemy.radius * 0.48, enemy.radius * 0.56, -0.16, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = rgbaFromRgbString(archetype.outline, 0.82);
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(enemy.x - enemy.radius * 0.3, y + enemy.radius * 0.54);
    context.lineTo(enemy.x - enemy.radius * 0.48, y + enemy.radius * 0.98);
    context.moveTo(enemy.x + enemy.radius * 0.06, y + enemy.radius * 0.58);
    context.lineTo(enemy.x + enemy.radius * 0.24, y + enemy.radius * 1.02);
    context.stroke();

    context.fillStyle = archetype.detail;
    context.beginPath();
    context.ellipse(enemy.x - enemy.radius * 0.2, y - enemy.radius * 0.58, 7, 4, -0.6, 0, Math.PI * 2);
    context.ellipse(enemy.x + enemy.radius * 0.22, y - enemy.radius * 0.46, 8, 4.5, 0.4, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = archetype.highlight;
    context.beginPath();
    context.arc(enemy.x - 7, y - 8, 3.6, 0, Math.PI * 2);
    context.arc(enemy.x + 7, y - 6, 3.2, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = rgbaFromRgbString('245 158 11', 0.76);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(enemy.x - enemy.radius * 0.38, y - enemy.radius * 0.88);
    context.lineTo(enemy.x - enemy.radius * 0.22, y - enemy.radius * 1.18);
    context.lineTo(enemy.x - enemy.radius * 0.08, y - enemy.radius * 0.84);
    context.moveTo(enemy.x + enemy.radius * 0.1, y - enemy.radius * 0.82);
    context.lineTo(enemy.x + enemy.radius * 0.28, y - enemy.radius * 1.12);
    context.lineTo(enemy.x + enemy.radius * 0.42, y - enemy.radius * 0.8);
    context.stroke();
  }

  function renderRuneConstruct(enemy, y, archetype, now) {
    const pulse = 0.78 + Math.sin(now / 310 + enemy.bobOffset) * 0.18;

    context.fillStyle = archetype.bodySecondary;
    context.beginPath();
    context.moveTo(enemy.x, y - enemy.radius * 1.08);
    context.lineTo(enemy.x + enemy.radius * 0.66, y - enemy.radius * 0.6);
    context.lineTo(enemy.x + enemy.radius * 0.84, y + enemy.radius * 0.18);
    context.lineTo(enemy.x + enemy.radius * 0.32, y + enemy.radius * 0.9);
    context.lineTo(enemy.x - enemy.radius * 0.34, y + enemy.radius * 0.9);
    context.lineTo(enemy.x - enemy.radius * 0.84, y + enemy.radius * 0.18);
    context.lineTo(enemy.x - enemy.radius * 0.68, y - enemy.radius * 0.6);
    context.closePath();
    context.fill();

    context.fillStyle = archetype.bodyPrimary;
    context.beginPath();
    context.moveTo(enemy.x, y - enemy.radius * 0.92);
    context.lineTo(enemy.x + enemy.radius * 0.5, y - enemy.radius * 0.46);
    context.lineTo(enemy.x + enemy.radius * 0.64, y + enemy.radius * 0.16);
    context.lineTo(enemy.x + enemy.radius * 0.2, y + enemy.radius * 0.72);
    context.lineTo(enemy.x - enemy.radius * 0.2, y + enemy.radius * 0.72);
    context.lineTo(enemy.x - enemy.radius * 0.64, y + enemy.radius * 0.16);
    context.lineTo(enemy.x - enemy.radius * 0.5, y - enemy.radius * 0.46);
    context.closePath();
    context.fill();

    context.fillStyle = archetype.bodyShadow;
    context.fillRect(enemy.x - enemy.radius * 0.32, y - enemy.radius * 0.28, enemy.radius * 0.64, enemy.radius * 0.7);
    context.fillRect(enemy.x - enemy.radius * 0.88, y - enemy.radius * 0.26, enemy.radius * 0.24, enemy.radius * 0.7);
    context.fillRect(enemy.x + enemy.radius * 0.64, y - enemy.radius * 0.26, enemy.radius * 0.24, enemy.radius * 0.7);

    context.strokeStyle = rgbaFromRgbString(archetype.outline, 0.92);
    context.lineWidth = 2.6;
    context.beginPath();
    context.moveTo(enemy.x - enemy.radius * 0.12, y - enemy.radius * 0.5);
    context.lineTo(enemy.x + enemy.radius * 0.08, y - enemy.radius * 0.16);
    context.lineTo(enemy.x - enemy.radius * 0.04, y + enemy.radius * 0.2);
    context.lineTo(enemy.x + enemy.radius * 0.16, y + enemy.radius * 0.5);
    context.moveTo(enemy.x - enemy.radius * 0.36, y - enemy.radius * 0.1);
    context.lineTo(enemy.x - enemy.radius * 0.08, y + enemy.radius * 0.08);
    context.lineTo(enemy.x - enemy.radius * 0.3, y + enemy.radius * 0.32);
    context.stroke();

    context.strokeStyle = rgbaFromRgbString(archetype.rgb, 0.55 + pulse * 0.22);
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(enemy.x - enemy.radius * 0.18, y - enemy.radius * 0.36);
    context.lineTo(enemy.x + enemy.radius * 0.12, y - enemy.radius * 0.18);
    context.lineTo(enemy.x - enemy.radius * 0.02, y + enemy.radius * 0.12);
    context.lineTo(enemy.x + enemy.radius * 0.18, y + enemy.radius * 0.4);
    context.stroke();

    context.fillStyle = archetype.highlight;
    context.beginPath();
    context.arc(enemy.x - 6, y - 12, 3.5, 0, Math.PI * 2);
    context.arc(enemy.x + 7, y - 10, 3.1, 0, Math.PI * 2);
    context.fill();
  }

  function renderShadowWraith(enemy, y, archetype, now) {
    const drift = Math.sin(now / 270 + enemy.bobOffset) * 4;

    const shroud = context.createLinearGradient(enemy.x, y - enemy.radius * 1.2, enemy.x, y + enemy.radius * 1.15);
    shroud.addColorStop(0, '#0f172a');
    shroud.addColorStop(0.55, '#1e293b');
    shroud.addColorStop(1, 'rgba(30, 41, 59, 0.08)');
    context.fillStyle = shroud;
    context.beginPath();
    context.moveTo(enemy.x, y - enemy.radius * 1.16);
    context.quadraticCurveTo(
      enemy.x + enemy.radius * 0.78,
      y - enemy.radius * 0.34,
      enemy.x + enemy.radius * 0.48,
      y + enemy.radius * 0.48,
    );
    context.quadraticCurveTo(
      enemy.x + drift * 0.2,
      y + enemy.radius * 1.34,
      enemy.x - enemy.radius * 0.22,
      y + enemy.radius * 0.86,
    );
    context.quadraticCurveTo(
      enemy.x - enemy.radius * 0.82,
      y + enemy.radius * 1.28,
      enemy.x - enemy.radius * 0.58,
      y + enemy.radius * 0.38,
    );
    context.quadraticCurveTo(
      enemy.x - enemy.radius * 0.78,
      y - enemy.radius * 0.26,
      enemy.x,
      y - enemy.radius * 1.16,
    );
    context.closePath();
    context.fill();

    context.fillStyle = rgbaFromRgbString('226 232 240', 0.12);
    context.beginPath();
    context.ellipse(enemy.x - 2, y - enemy.radius * 0.18, enemy.radius * 0.36, enemy.radius * 0.62, 0.08, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = archetype.bodySecondary;
    context.beginPath();
    context.arc(enemy.x, y - enemy.radius * 0.72, enemy.radius * 0.34, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = rgbaFromRgbString('148 163 184', 0.42);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(enemy.x - enemy.radius * 0.42, y + enemy.radius * 0.4);
    context.quadraticCurveTo(enemy.x - enemy.radius * 0.18, y + enemy.radius * 0.98, enemy.x - enemy.radius * 0.46, y + enemy.radius * 1.24);
    context.moveTo(enemy.x + enemy.radius * 0.08, y + enemy.radius * 0.48);
    context.quadraticCurveTo(enemy.x + enemy.radius * 0.46, y + enemy.radius * 1.02, enemy.x + enemy.radius * 0.18, y + enemy.radius * 1.3);
    context.stroke();

    context.fillStyle = archetype.highlight;
    context.beginPath();
    context.ellipse(enemy.x - 6, y - enemy.radius * 0.72, 4.2, 2.1, -0.1, 0, Math.PI * 2);
    context.ellipse(enemy.x + 7, y - enemy.radius * 0.68, 4.4, 2.2, 0.1, 0, Math.PI * 2);
    context.fill();
  }

  function renderPlayer(now) {
    const { player } = state;
    const bob = Math.sin(now / 620) * 2.6;
    const freezeStrength =
      player.freezeCastMs > 0 ? player.freezeCastMs / SPELL_CONFIG.Freeze.castPulseMs : 0;
    const healStrength = player.healPulseMs > 0 ? player.healPulseMs / SPELL_CONFIG.Heal.pulseDurationMs : 0;
    const damageStrength = player.damageFlashMs > 0 ? player.damageFlashMs / 240 : 0;
    const playerY = player.y + bob;
    const staffX = player.x + 26;
    const staffTopY = playerY - 92;

    context.fillStyle = 'rgba(0, 0, 0, 0.28)';
    context.beginPath();
    context.ellipse(player.x, layout.floorY - 6, 52, 14, 0, 0, Math.PI * 2);
    context.fill();

    const wardGlow = context.createRadialGradient(player.x - 4, layout.floorY - 28, 0, player.x - 4, layout.floorY - 28, 92);
    wardGlow.addColorStop(0, rgbaFromRgbString('147 51 234', 0.18 + healStrength * 0.08));
    wardGlow.addColorStop(0.7, rgbaFromRgbString('56 189 248', 0.08 + freezeStrength * 0.12));
    wardGlow.addColorStop(1, rgbaFromRgbString('56 189 248', 0));
    context.fillStyle = wardGlow;
    context.beginPath();
    context.ellipse(player.x - 4, layout.floorY - 28, 92, 58, 0, 0, Math.PI * 2);
    context.fill();

    if (freezeStrength > 0) {
      context.strokeStyle = rgbaFromRgbString('191 219 254', 0.24 + freezeStrength * 0.38);
      context.lineWidth = 3;
      context.shadowColor = rgbaFromRgbString('103 232 249', 0.3);
      context.shadowBlur = 18;
      context.beginPath();
      context.arc(player.x + 24, playerY - 66, 28 + freezeStrength * 10, -1.2, 0.8);
      context.stroke();
      context.shadowBlur = 0;
    }

    const robeGradient = context.createLinearGradient(player.x, playerY - 84, player.x, playerY + 58);
    robeGradient.addColorStop(0, damageStrength > 0 ? '#f87171' : '#8b5cf6');
    robeGradient.addColorStop(0.55, damageStrength > 0 ? '#991b1b' : '#6d28d9');
    robeGradient.addColorStop(1, '#24103f');
    context.fillStyle = robeGradient;
    context.beginPath();
    context.moveTo(player.x - 10, playerY - 58);
    context.lineTo(player.x - 20, playerY - 6);
    context.lineTo(player.x - 46, playerY + 46);
    context.lineTo(player.x + 38, playerY + 46);
    context.lineTo(player.x + 20, playerY - 8);
    context.closePath();
    context.fill();

    context.fillStyle = rgbaFromRgbString('17 24 39', 0.22);
    context.beginPath();
    context.ellipse(player.x - 2, playerY + 18, 28, 20, 0, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#3b0764';
    context.beginPath();
    context.ellipse(player.x - 1, playerY - 58, 19, 18, 0, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#f8fafc';
    context.beginPath();
    context.arc(player.x - 2, playerY - 58, 11, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = rgbaFromRgbString('49 46 129', 0.72);
    context.beginPath();
    context.ellipse(player.x - 1, playerY - 43, 13, 8, 0, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = rgbaFromRgbString('191 219 254', 0.24);
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(player.x - 1, playerY - 47, 12, 0.18 * Math.PI, 0.82 * Math.PI);
    context.stroke();

    const hatGradient = context.createLinearGradient(player.x, playerY - 146, player.x, playerY - 62);
    hatGradient.addColorStop(0, '#c4b5fd');
    hatGradient.addColorStop(0.18, '#7c3aed');
    hatGradient.addColorStop(0.78, '#581c87');
    hatGradient.addColorStop(1, '#2e1065');
    context.fillStyle = hatGradient;
    context.beginPath();
    context.moveTo(player.x - 22, playerY - 69);
    context.quadraticCurveTo(player.x - 10, playerY - 118, player.x + 10, playerY - 146);
    context.quadraticCurveTo(player.x + 23, playerY - 108, player.x + 18, playerY - 72);
    context.closePath();
    context.fill();

    context.fillStyle = rgbaFromRgbString('191 219 254', 0.2);
    context.beginPath();
    context.arc(player.x + 2, playerY - 110, 4.6, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#4c1d95';
    context.beginPath();
    context.ellipse(player.x - 1, playerY - 68, 25, 7.8, -0.02, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = rgbaFromRgbString('196 181 253', 0.38);
    context.lineWidth = 1.5;
    context.stroke();

    context.fillStyle = '#0f172a';
    context.beginPath();
    context.arc(player.x - 6, playerY - 60, 1.8, 0, Math.PI * 2);
    context.arc(player.x + 2, playerY - 60, 1.8, 0, Math.PI * 2);
    context.fill();

    drawSparkStar(player.x - 16, playerY - 2, 4.2, '#fef08a', { alpha: 0.88 });
    drawSparkStar(player.x + 10, playerY + 12, 3.8, '#bfdbfe', { alpha: 0.92 });
    drawSparkStar(player.x - 2, playerY + 26, 3.2, '#fde68a', { alpha: 0.86 });

    context.strokeStyle = '#8b6b4a';
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(player.x + 14, playerY - 14);
    context.lineTo(staffX, staffTopY);
    context.stroke();

    context.strokeStyle = '#c4b5fd';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(player.x + 10, playerY - 8);
    context.lineTo(staffX - 4, playerY - 48);
    context.stroke();

    const orbGlow = context.createRadialGradient(staffX, staffTopY, 0, staffX, staffTopY, 20);
    orbGlow.addColorStop(0, healStrength > 0 ? '#86efac' : freezeStrength > 0 ? '#e0f2fe' : '#fef3c7');
    orbGlow.addColorStop(1, 'rgba(248, 250, 252, 0)');
    context.fillStyle = orbGlow;
    context.beginPath();
    context.arc(staffX, staffTopY, 20, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = healStrength > 0 ? '#bbf7d0' : freezeStrength > 0 ? '#e0f2fe' : '#fef3c7';
    context.beginPath();
    context.arc(staffX, staffTopY, 7, 0, Math.PI * 2);
    context.fill();

    drawHealthBar(player.x - 40, playerY + 58, 82, player.hp / player.maxHp, '#34d399');
  }

  function renderEnemy(enemy, now) {
    const y = getEnemyY(enemy, now);
    const archetype = getEnemyArchetype(enemy.type);

    context.fillStyle = 'rgba(0, 0, 0, 0.26)';
    context.beginPath();
    context.ellipse(enemy.x, layout.floorY - 4, enemy.radius * 0.95, 12, 0, 0, Math.PI * 2);
    context.fill();

    renderEnemyAura(enemy, y, archetype, now);

    if (enemy.spawnFlashMs > 0) {
      context.fillStyle = rgbaFromRgbString(archetype.rgb, 0.16 + (enemy.spawnFlashMs / 260) * 0.16);
      context.beginPath();
      context.arc(enemy.x, y, enemy.radius * 1.32, 0, Math.PI * 2);
      context.fill();
    }

    if (enemy.type === 'EMBER') {
      renderBriarBeast(enemy, y, archetype, now);
    } else if (enemy.type === 'STORM') {
      renderRuneConstruct(enemy, y, archetype, now);
    } else {
      renderShadowWraith(enemy, y, archetype, now);
    }

    if (enemy.hitFlash > 0) {
      context.fillStyle = rgbaFromRgbString(enemy.hitFlashColor ?? archetype.rgb, 0.22 * enemy.hitFlash);
      context.beginPath();
      context.arc(enemy.x, y, enemy.radius * 1.08, 0, Math.PI * 2);
      context.fill();
    }

    drawHealthBar(
      enemy.x - enemy.radius,
      y - enemy.radius - 16,
      enemy.radius * 2,
      Math.max(enemy.hp, 0) / enemy.maxHp,
      '#fb7185',
    );
  }

  function renderProjectile(projectile) {
    if (projectile.spellName === 'Freeze') {
      const gradient = context.createRadialGradient(
        projectile.x,
        projectile.y,
        0,
        projectile.x,
        projectile.y,
        projectile.radius * 2.5,
      );
      gradient.addColorStop(0, '#f8fdff');
      gradient.addColorStop(0.42, '#bfdbfe');
      gradient.addColorStop(1, 'rgba(191, 219, 254, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(projectile.x, projectile.y, projectile.radius * 2.5, 0, Math.PI * 2);
      context.fill();

      const angle = Math.atan2(projectile.vy, projectile.vx);
      const tailLength = projectile.radius * 2.2;
      context.strokeStyle = rgbaFromRgbString('191 219 254', 0.72);
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(projectile.x, projectile.y);
      context.lineTo(
        projectile.x - Math.cos(angle) * tailLength,
        projectile.y - Math.sin(angle) * tailLength,
      );
      context.stroke();

      context.fillStyle = '#e0f2fe';
      context.beginPath();
      context.moveTo(projectile.x + Math.cos(angle) * projectile.radius, projectile.y + Math.sin(angle) * projectile.radius);
      context.lineTo(
        projectile.x - Math.cos(angle) * projectile.radius * 0.7 + Math.sin(angle) * 4,
        projectile.y - Math.sin(angle) * projectile.radius * 0.7 - Math.cos(angle) * 4,
      );
      context.lineTo(
        projectile.x - Math.cos(angle) * projectile.radius * 0.7 - Math.sin(angle) * 4,
        projectile.y - Math.sin(angle) * projectile.radius * 0.7 + Math.cos(angle) * 4,
      );
      context.closePath();
      context.fill();
      return;
    }

    const gradient = context.createRadialGradient(
      projectile.x,
      projectile.y,
      0,
      projectile.x,
      projectile.y,
      projectile.radius * 2.2,
    );
    gradient.addColorStop(0, '#fff7ed');
    gradient.addColorStop(0.45, '#fb923c');
    gradient.addColorStop(1, 'rgba(251, 146, 60, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(projectile.x, projectile.y, projectile.radius * 2.2, 0, Math.PI * 2);
    context.fill();
  }

  function renderRing(ring) {
    const progress = 1 - ring.life / ring.maxLife;
    context.strokeStyle = rgbaFromRgbString(ring.color, 0.46 * (1 - progress));
    context.lineWidth = ring.lineWidth;
    context.beginPath();
    context.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    context.stroke();
  }

  function renderBeam(beam) {
    const intensity = beam.life / beam.maxLife;
    context.strokeStyle = rgbaFromRgbString(beam.color, 0.18 * intensity);
    context.lineWidth = 14;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.beginPath();
    beam.points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.stroke();

    context.strokeStyle = rgbaFromRgbString(beam.color, 0.9 * intensity);
    context.lineWidth = 4;
    context.beginPath();
    beam.points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.stroke();
  }

  function renderParticle(particle) {
    const alpha = particle.life / particle.maxLife;
    context.fillStyle = rgbaFromRgbString(particle.color, alpha);
    context.beginPath();
    context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    context.fill();
  }

  function render(now) {
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    renderBackground(now);
    state.rings.forEach(renderRing);
    renderPlayer(now);
    state.projectiles.forEach(renderProjectile);
    state.enemies.forEach((enemy) => renderEnemy(enemy, now));
    state.beams.forEach(renderBeam);
    state.particles.forEach(renderParticle);
  }

  function step(now) {
    if (!lastFrameTime) {
      lastFrameTime = now;
    }

    const deltaMs = Math.min(now - lastFrameTime, 40);
    lastFrameTime = now;
    const deltaSeconds = deltaMs / 1000;

    if (!state.gameOver) {
      if (state.waveState === 'combat') {
        state.spawnCooldownMs -= deltaMs;

        if (state.spawnCooldownMs <= 0) {
          spawnEnemy(now);
        }
      }

      updateEnemies(deltaSeconds, now);
      updateProjectiles(deltaSeconds, now);
      updateWaveState(deltaMs, now);
      updateTutorialProgress(now);
    }

    updateEffects(deltaSeconds);
    render(now);
    onStateChange(getSnapshot(now));
    animationFrameId = requestAnimationFrame(step);
  }

  function castSpell(spellName, now = performance.now()) {
    const tutorialStep = getTutorialStep();

    if (spellName === 'Heal') {
      const tutorialAllowsHeal = state.tutorial.active
        && tutorialStep
        && (tutorialStep.action === 'cast_any' || tutorialStep.action === 'heal');

      if (state.tutorial.active && !tutorialAllowsHeal) {
        const result = {
          accepted: false,
          headline: 'Heal held in reserve',
          detail: 'The tutorial saves Heal for a safe utility lesson near the end.',
        };
        pushBattleEvent(result.headline, result.detail);
        onStateChange(getSnapshot(now));
        return result;
      }

      if (!state.tutorial.active && state.waveState !== 'combat') {
        const result = {
          accepted: false,
          headline: 'Heal unavailable',
          detail: 'Heal refreshes when the next wave begins.',
        };
        pushBattleEvent(result.headline, result.detail);
        onStateChange(getSnapshot(now));
        return result;
      }

      if (!state.tutorial.active && state.healUsedThisWave) {
        const result = {
          accepted: false,
          headline: 'Heal unavailable',
          detail: 'Heal already used this wave.',
        };
        pushBattleEvent(result.headline, result.detail);
        onStateChange(getSnapshot(now));
        return result;
      }
    }

    const result = applySpellCast(state, spellName, {
      now,
      width: viewportWidth,
    });

    if (result.accepted) {
      if (spellName === 'Heal' && !state.tutorial.active) {
        state.healUsedThisWave = true;
      }

      pushBattleEvent(result.headline, result.detail);

      if (result.instantTargetId) {
        const targetEnemy = state.enemies.find((enemy) => enemy.id === result.instantTargetId);

        if (targetEnemy) {
          const hitResult = resolveSpellHit(targetEnemy, spellName, now);

          if (hitResult.defeated) {
            defeatEnemy(targetEnemy, now, spellName);
            state.enemies = state.enemies.filter((enemy) => enemy.id !== targetEnemy.id);
          }
        }
      }

      if (state.tutorial.active && tutorialStep?.action === 'cast_any') {
        queueTutorialAdvance(state.tutorial.stepIndex + 1, now, 320);
      }

      if (state.tutorial.active && tutorialStep?.action === 'heal' && spellName === 'Heal') {
        queueTutorialAdvance(state.tutorial.stepIndex + 1, now, 560);
      }
    }

    onStateChange(getSnapshot(now));
    return result;
  }

  function continueTutorial(now = performance.now()) {
    if (!state.tutorial.active) {
      return {
        accepted: false,
        headline: 'Tutorial inactive',
        detail: 'The tutorial panel is not active right now.',
      };
    }

    const tutorialStep = getTutorialStep();

    if (tutorialStep?.action !== 'continue') {
      return {
        accepted: false,
        headline: 'Follow the objective',
        detail: tutorialStep?.objective ?? 'This lesson advances after the required spell action.',
      };
    }

    const nextStepIndex = state.tutorial.stepIndex + 1;

    if (nextStepIndex >= TUTORIAL_STEPS.length) {
      beginMainGame(now);
      onStateChange(getSnapshot(now));

      return {
        accepted: true,
        headline: 'Tutorial complete',
        detail: 'Wave 1 is gathering now.',
      };
    } else {
      enterTutorialStep(nextStepIndex, now);
    }

    onStateChange(getSnapshot(now));

    return {
      accepted: true,
      headline: 'Tutorial advanced',
      detail: 'The next lesson is ready.',
    };
  }

  function skipTutorial(now = performance.now()) {
    if (!state.tutorial.active) {
      return {
        accepted: false,
        headline: 'Tutorial inactive',
        detail: 'The tutorial is not currently running.',
      };
    }

    beginMainGame(now, { skipped: true });
    onStateChange(getSnapshot(now));

    return {
      accepted: true,
      headline: 'Tutorial skipped',
      detail: 'Wave 1 is gathering now.',
    };
  }

  function restart({ runTutorial = false } = {}) {
    const freshState = createInitialState();
    Object.assign(state, freshState);
    syncLayout();
    const now = performance.now();

    if (runTutorial) {
      startTutorial(now);
      onBattleEvent('Tutorial started. Learn the spells, then the real battle begins.');
    } else {
      state.feedText = 'Battle reset. Wave 1 is gathering. Read the aura: red for Fireball, yellow for Lightning, blue-cyan for Freeze.';
      onBattleEvent('Battle reset. Wave 1 begins after a short pause.');
    }

    render(now);
    onStateChange(getSnapshot(now));
  }

  function dispose() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    resizeBinding.disconnect();
  }

  render(performance.now());
  onStateChange(getSnapshot(performance.now()));

  function start() {
    if (animationFrameId) {
      return;
    }

    lastFrameTime = 0;
    animationFrameId = requestAnimationFrame(step);
  }

  if (autoStart) {
    start();
  }

  return {
    castSpell,
    continueTutorial,
    dispose,
    getState: () => getSnapshot(performance.now()),
    restart,
    skipTutorial,
    start,
  };
}
