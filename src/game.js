import { clamp, randomRange, rgbaFromRgbString } from './utils.js';
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
  enemyHpMin: 34,
  enemyHpMax: 48,
  enemySpeedMin: 62,
  enemySpeedMax: 92,
  enemyContactDamage: 16,
  maxActiveEnemies: 3,
  spawnIntervalMinMs: 1200,
  spawnIntervalMaxMs: 2300,
  laneYFactors: [0.34, 0.54, 0.74],
};

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
  return {
    player: {
      hp: GAME_SETTINGS.playerMaxHp,
      maxHp: GAME_SETTINGS.playerMaxHp,
      radius: GAME_SETTINGS.playerRadius,
      x: 0,
      y: 0,
      blockUntil: 0,
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
    spawnCooldownMs: 900,
    gameOver: false,
    feedText: 'Raise one hand, cast a spell, and defend the lane.',
    nextEnemyId: 1,
    nextProjectileId: 1,
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

  function scheduleNextSpawn() {
    state.spawnCooldownMs = randomRange(
      GAME_SETTINGS.spawnIntervalMinMs,
      GAME_SETTINGS.spawnIntervalMaxMs,
    );
  }

  function getEnemyY(enemy, now = performance.now()) {
    return layout.laneYs[enemy.laneIndex] + Math.sin(now / 320 + enemy.bobOffset) * 7;
  }

  function createEnemy(now) {
    const hp = Math.round(randomRange(GAME_SETTINGS.enemyHpMin, GAME_SETTINGS.enemyHpMax));
    const laneIndex = Math.floor(randomRange(0, layout.laneYs.length));

    return {
      id: state.nextEnemyId++,
      x: layout.spawnX + randomRange(0, viewportWidth * 0.08),
      y: layout.laneYs[laneIndex],
      laneIndex,
      radius: GAME_SETTINGS.enemyRadius,
      speed: randomRange(GAME_SETTINGS.enemySpeedMin, GAME_SETTINGS.enemySpeedMax),
      hp,
      maxHp: hp,
      bobOffset: randomRange(0, Math.PI * 2),
      hitFlash: 0,
      hitFlashMs: 0,
      spawnFlashMs: 260,
    };
  }

  function spawnEnemy(now) {
    if (state.gameOver || state.enemies.length >= GAME_SETTINGS.maxActiveEnemies) {
      scheduleNextSpawn();
      return;
    }

    const enemy = createEnemy(now);
    state.enemies.push(enemy);
    state.particles.push(
      ...createBurstParticles({
        x: enemy.x,
        y: getEnemyY(enemy, now),
        color: '244 114 182',
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
        color: '244 114 182',
        maxRadius: enemy.radius * 1.8,
        lifeMs: 420,
        lineWidth: 2,
      }),
    );
    scheduleNextSpawn();
  }

  function damagePlayer(baseDamage, now) {
    const blockRemainingMs = Math.max(0, state.player.blockUntil - now);
    const mitigation = blockRemainingMs > 0 ? SPELL_CONFIG.Block.mitigation : 0;
    const finalDamage = Math.max(1, Math.round(baseDamage * (1 - mitigation)));
    state.player.hp = clamp(state.player.hp - finalDamage, 0, state.player.maxHp);
    state.player.damageFlashMs = 240;

    if (blockRemainingMs > 0) {
      state.rings.push(
        createRingEffect({
          x: state.player.x,
          y: state.player.y,
          color: '56 189 248',
          maxRadius: state.player.radius * 2.1,
          lifeMs: 320,
          lineWidth: 3,
        }),
      );
      state.particles.push(
        ...createBurstParticles({
          x: state.player.x + state.player.radius * 0.8,
          y: state.player.y,
          color: '56 189 248',
          count: 10,
          minSpeed: 40,
          maxSpeed: 150,
          lifeMs: 320,
        }),
      );
      pushBattleEvent(`Ward absorbed part of the hit (${finalDamage} damage)`);
    } else {
      pushBattleEvent(`The mage took ${finalDamage} damage`);
    }

    if (state.player.hp <= 0) {
      state.gameOver = true;
      pushBattleEvent('Game over', 'The right-side assault broke through the defense line.');
    }
  }

  function defeatEnemy(enemy, now, spellName = 'Neutral') {
    const scoreValue =
      spellName === 'Fireball'
        ? SPELL_CONFIG.Fireball.scoreValue
        : spellName === 'Lightning'
          ? SPELL_CONFIG.Lightning.scoreValue
          : 10;

    state.score += scoreValue;
    state.defeatedEnemies += 1;
    state.rings.push(
      createRingEffect({
        x: enemy.x,
        y: getEnemyY(enemy, now),
        color: '110 231 249',
        maxRadius: enemy.radius * 2.4,
        lifeMs: 420,
        lineWidth: 3,
      }),
    );
    state.particles.push(
      ...createBurstParticles({
        x: enemy.x,
        y: getEnemyY(enemy, now),
        color:
          spellName === 'Lightning'
            ? '250 204 21'
            : spellName === 'Fireball'
              ? '251 146 60'
              : '110 231 249',
        count: 20,
        minSpeed: 60,
        maxSpeed: 230,
        lifeMs: 520,
      }),
    );
    pushBattleEvent('Enemy defeated', `Score +${scoreValue}.`);
  }

  function updateEnemies(deltaSeconds, now) {
    for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = state.enemies[index];

      enemy.y = getEnemyY(enemy, now);
      enemy.x -= enemy.speed * deltaSeconds;
      enemy.hitFlashMs = Math.max(0, enemy.hitFlashMs - deltaSeconds * 1000);
      enemy.hitFlash = enemy.hitFlashMs > 0 ? enemy.hitFlashMs / 180 : 0;
      enemy.spawnFlashMs = Math.max(0, enemy.spawnFlashMs - deltaSeconds * 1000);

      if (enemy.hp <= 0) {
        defeatEnemy(enemy, now);
        state.enemies.splice(index, 1);
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
          color: projectile.color,
          count: 1,
          minSpeed: 8,
          maxSpeed: 26,
          minRadius: 1,
          maxRadius: 3,
          lifeMs: 220,
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

      hitEnemy.hp -= projectile.damage;
      hitEnemy.hitFlash = 1;
      hitEnemy.hitFlashMs = 180;
      state.rings.push(
        createRingEffect({
          x: hitEnemy.x,
          y: getEnemyY(hitEnemy, now),
          color: '251 146 60',
          maxRadius: hitEnemy.radius * 1.8,
          lifeMs: 260,
          lineWidth: 2,
        }),
      );
      state.particles.push(
        ...createBurstParticles({
          x: hitEnemy.x,
          y: getEnemyY(hitEnemy, now),
          color: '251 146 60',
          count: 18,
          minSpeed: 50,
          maxSpeed: 180,
          lifeMs: 380,
        }),
      );

      if (hitEnemy.hp <= 0) {
        defeatEnemy(hitEnemy, now, 'Fireball');
        state.enemies = state.enemies.filter((enemy) => enemy.id !== hitEnemy.id);
      }

      state.projectiles.splice(index, 1);
    }
  }

  function updateEffects(deltaSeconds) {
    state.player.healPulseMs = Math.max(0, state.player.healPulseMs - deltaSeconds * 1000);
    state.player.damageFlashMs = Math.max(0, state.player.damageFlashMs - deltaSeconds * 1000);

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

  function getSnapshot(now = performance.now()) {
    const shieldRemainingMs = Math.max(0, state.player.blockUntil - now);
    const gameStateLabel = state.gameOver
      ? 'Game over'
      : shieldRemainingMs > 0
        ? 'Ward active'
        : state.enemies.length > 0
          ? 'Battle running'
          : 'Lane secure';

    return {
      playerHp: state.player.hp,
      playerMaxHp: state.player.maxHp,
      score: state.score,
      defeatedEnemies: state.defeatedEnemies,
      enemiesAlive: state.enemies.length,
      shieldRemainingMs,
      shieldActive: shieldRemainingMs > 0,
      gameOver: state.gameOver,
      gameStateLabel,
      feedText: state.feedText,
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

  function renderPlayer(now) {
    const { player } = state;
    const shieldRemainingMs = Math.max(0, player.blockUntil - now);
    const healStrength = player.healPulseMs > 0 ? player.healPulseMs / SPELL_CONFIG.Heal.pulseDurationMs : 0;
    const damageStrength = player.damageFlashMs > 0 ? player.damageFlashMs / 240 : 0;

    context.fillStyle = 'rgba(0, 0, 0, 0.28)';
    context.beginPath();
    context.ellipse(player.x, layout.floorY - 6, 52, 14, 0, 0, Math.PI * 2);
    context.fill();

    if (shieldRemainingMs > 0) {
      context.strokeStyle = rgbaFromRgbString(
        '56 189 248',
        0.4 + shieldRemainingMs / SPELL_CONFIG.Block.durationMs * 0.35,
      );
      context.lineWidth = 4;
      context.shadowColor = rgbaFromRgbString('56 189 248', 0.28);
      context.shadowBlur = 24;
      context.beginPath();
      context.ellipse(player.x + 6, player.y - 4, 50, 66, 0, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
    }

    const robeGradient = context.createLinearGradient(player.x, player.y - 62, player.x, player.y + 56);
    robeGradient.addColorStop(0, damageStrength > 0 ? '#f87171' : '#7dd3fc');
    robeGradient.addColorStop(1, '#0f172a');
    context.fillStyle = robeGradient;
    context.beginPath();
    context.moveTo(player.x - 10, player.y - 48);
    context.lineTo(player.x - 44, player.y + 44);
    context.lineTo(player.x + 34, player.y + 44);
    context.closePath();
    context.fill();

    context.fillStyle = healStrength > 0
      ? rgbaFromRgbString('52 211 153', 0.38)
      : 'rgba(110, 231, 249, 0.15)';
    context.beginPath();
    context.arc(player.x - 2, player.y - 58, 18, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#dbeafe';
    context.beginPath();
    context.arc(player.x - 2, player.y - 58, 12, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = '#7dd3fc';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(player.x + 18, player.y - 12);
    context.lineTo(player.x + 34, player.y - 76);
    context.stroke();

    const orbGlow = context.createRadialGradient(player.x + 34, player.y - 78, 0, player.x + 34, player.y - 78, 16);
    orbGlow.addColorStop(0, healStrength > 0 ? '#86efac' : '#f8fafc');
    orbGlow.addColorStop(1, 'rgba(248, 250, 252, 0)');
    context.fillStyle = orbGlow;
    context.beginPath();
    context.arc(player.x + 34, player.y - 78, 16, 0, Math.PI * 2);
    context.fill();

    drawHealthBar(player.x - 40, player.y + 58, 82, player.hp / player.maxHp, '#34d399');
  }

  function renderEnemy(enemy, now) {
    const y = getEnemyY(enemy, now);

    context.fillStyle = 'rgba(0, 0, 0, 0.26)';
    context.beginPath();
    context.ellipse(enemy.x, layout.floorY - 4, enemy.radius * 0.95, 12, 0, 0, Math.PI * 2);
    context.fill();

    const glow = context.createRadialGradient(enemy.x, y, 0, enemy.x, y, enemy.radius * 2.2);
    glow.addColorStop(0, rgbaFromRgbString('248 113 113', 0.42));
    glow.addColorStop(1, rgbaFromRgbString('248 113 113', 0));
    context.fillStyle = glow;
    context.beginPath();
    context.arc(enemy.x, y, enemy.radius * 2.2, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = enemy.spawnFlashMs > 0 ? rgbaFromRgbString('251 191 36', 0.34) : '#1f2937';
    context.beginPath();
    context.moveTo(enemy.x, y - enemy.radius);
    context.lineTo(enemy.x + enemy.radius * 0.9, y);
    context.lineTo(enemy.x, y + enemy.radius);
    context.lineTo(enemy.x - enemy.radius * 0.9, y);
    context.closePath();
    context.fill();

    context.fillStyle = enemy.hitFlash > 0
      ? rgbaFromRgbString('255 255 255', 0.66 * enemy.hitFlash)
      : '#f87171';
    context.beginPath();
    context.arc(enemy.x, y, enemy.radius * 0.52, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#fff7ed';
    context.beginPath();
    context.arc(enemy.x + enemy.radius * 0.12, y - 2, 4, 0, Math.PI * 2);
    context.fill();

    drawHealthBar(
      enemy.x - enemy.radius,
      y - enemy.radius - 16,
      enemy.radius * 2,
      Math.max(enemy.hp, 0) / enemy.maxHp,
      '#fb7185',
    );
  }

  function renderProjectile(projectile) {
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
      state.spawnCooldownMs -= deltaMs;

      if (state.spawnCooldownMs <= 0) {
        spawnEnemy(now);
      }

      updateEnemies(deltaSeconds, now);
      updateProjectiles(deltaSeconds, now);
    }

    updateEffects(deltaSeconds);
    render(now);
    onStateChange(getSnapshot(now));
    animationFrameId = requestAnimationFrame(step);
  }

  function castSpell(spellName, now = performance.now()) {
    const result = applySpellCast(state, spellName, {
      now,
      width: viewportWidth,
    });

    if (result.accepted) {
      pushBattleEvent(result.headline, result.detail);
      state.enemies = state.enemies.filter((enemy) => {
        if (enemy.hp > 0) {
          return true;
        }

        defeatEnemy(enemy, now, spellName);
        return false;
      });
    }

    onStateChange(getSnapshot(now));
    return result;
  }

  function restart() {
    const freshState = createInitialState();
    Object.assign(state, freshState);
    scheduleNextSpawn();
    state.feedText = 'Battle reset. Raise one hand and defend the lane again.';
    onBattleEvent('Battle reset. The mage returns to the left-side ward.');
    onStateChange(getSnapshot(performance.now()));
  }

  function dispose() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    resizeBinding.disconnect();
  }

  scheduleNextSpawn();
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
    dispose,
    getState: () => getSnapshot(performance.now()),
    restart,
    start,
  };
}
