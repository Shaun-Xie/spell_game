import { clamp, randomRange } from './utils.js';

export const SPELL_CONFIG = {
  Fireball: {
    damage: 28,
    projectileSpeed: 720,
    projectileRadius: 12,
    projectileLifeMs: 1800,
    scoreValue: 12,
  },
  Lightning: {
    damage: 22,
    beamDurationMs: 180,
    scoreValue: 14,
  },
  Heal: {
    amount: 20,
    pulseDurationMs: 720,
  },
  Freeze: {
    damage: 14,
    projectileSpeed: 560,
    projectileRadius: 11,
    projectileLifeMs: 1700,
    castPulseMs: 680,
    scoreValue: 11,
  },
};

function buildLightningPoints(from, to) {
  const points = [from];
  const segments = 7;

  for (let index = 1; index < segments; index += 1) {
    const progress = index / segments;
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress + randomRange(-18, 18);
    points.push({ x, y });
  }

  points.push(to);
  return points;
}

export function createBurstParticles({
  x,
  y,
  color,
  count = 14,
  minSpeed = 60,
  maxSpeed = 180,
  minRadius = 2,
  maxRadius = 5,
  lifeMs = 420,
}) {
  return Array.from({ length: count }, () => {
    const angle = randomRange(0, Math.PI * 2);
    const speed = randomRange(minSpeed, maxSpeed);

    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: randomRange(minRadius, maxRadius),
      life: lifeMs,
      maxLife: lifeMs,
      color,
    };
  });
}

export function createRingEffect({
  x,
  y,
  color,
  maxRadius,
  lifeMs,
  lineWidth = 3,
}) {
  return {
    x,
    y,
    radius: 0,
    maxRadius,
    lineWidth,
    life: lifeMs,
    maxLife: lifeMs,
    color,
  };
}

export function createLightningBeam({ from, to, color, now, durationMs }) {
  return {
    points: buildLightningPoints(from, to),
    color,
    life: durationMs,
    maxLife: durationMs,
    createdAt: now,
  };
}

function getNearestEnemy(state) {
  if (!state.enemies.length) {
    return null;
  }

  return state.enemies.reduce((closest, enemy) => {
    if (!closest) {
      return enemy;
    }

    return enemy.x < closest.x ? enemy : closest;
  }, null);
}

function castFireball(state, now, width) {
  const { Fireball } = SPELL_CONFIG;
  const target = getNearestEnemy(state);
  const origin = {
    x: state.player.x + state.player.radius * 1.6,
    y: state.player.y - 8,
  };
  const destination = target
    ? { x: target.x, y: target.y }
    : { x: width * 0.94, y: state.player.y - 24 };
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;
  const distance = Math.hypot(dx, dy) || 1;

  state.projectiles.push({
    id: state.nextProjectileId++,
    x: origin.x,
    y: origin.y,
    vx: (dx / distance) * Fireball.projectileSpeed,
    vy: (dy / distance) * Fireball.projectileSpeed,
    radius: Fireball.projectileRadius,
    damage: Fireball.damage,
    color: '251 146 60',
    life: Fireball.projectileLifeMs,
    maxLife: Fireball.projectileLifeMs,
  });

  state.particles.push(
    ...createBurstParticles({
      x: origin.x,
      y: origin.y,
      color: '251 146 60',
      count: 10,
      minSpeed: 40,
      maxSpeed: 120,
      lifeMs: 320,
    }),
  );

  return {
    accepted: true,
    headline: 'Fireball launched',
    detail: target ? 'The nearest enemy is being targeted.' : 'The blast races down the lane.',
  };
}

function castLightning(state, now, width) {
  const { Lightning } = SPELL_CONFIG;
  const target = getNearestEnemy(state);
  const from = {
    x: state.player.x + state.player.radius * 1.15,
    y: state.player.y - 10,
  };
  const to = target
    ? { x: target.x, y: target.y }
    : { x: width * 0.9, y: state.player.y - 24 };

  state.beams.push(
    createLightningBeam({
      from,
      to,
      color: '250 204 21',
      now,
      durationMs: Lightning.beamDurationMs,
    }),
  );

  if (target) {
    target.hp -= Lightning.damage;
    target.hitFlash = 1;
    target.hitFlashMs = 180;
    state.particles.push(
      ...createBurstParticles({
        x: target.x,
        y: target.y,
        color: '250 204 21',
        count: 16,
        minSpeed: 80,
        maxSpeed: 210,
        lifeMs: 360,
      }),
    );
  }

  return {
    accepted: true,
    headline: 'Lightning cast',
    detail: target ? 'The nearest foe is struck instantly.' : 'A crackling arc tears across the lane.',
  };
}

function castHeal(state, now) {
  const { Heal } = SPELL_CONFIG;
  const previousHp = state.player.hp;
  state.player.hp = clamp(state.player.hp + Heal.amount, 0, state.player.maxHp);
  state.player.healPulseMs = Heal.pulseDurationMs;
  state.rings.push(
    createRingEffect({
      x: state.player.x,
      y: state.player.y,
      color: '52 211 153',
      maxRadius: state.player.radius * 2.8,
      lifeMs: Heal.pulseDurationMs,
      lineWidth: 4,
    }),
  );
  state.particles.push(
    ...createBurstParticles({
      x: state.player.x,
      y: state.player.y,
      color: '52 211 153',
      count: 14,
      minSpeed: 35,
      maxSpeed: 120,
      lifeMs: 540,
    }),
  );

  const restoredHp = state.player.hp - previousHp;

  return {
    accepted: true,
    headline: restoredHp > 0 ? `Heal restored ${restoredHp} HP` : 'Heal cast at full vitality',
    detail:
      restoredHp > 0
        ? 'A restorative pulse wraps around the mage.'
        : 'The healing aura shimmers, but your HP is already full.',
  };
}

function castFreeze(state, now, width) {
  const { Freeze } = SPELL_CONFIG;
  const target = getNearestEnemy(state);
  const origin = {
    x: state.player.x + state.player.radius * 1.45,
    y: state.player.y - 20,
  };
  const destination = target
    ? { x: target.x, y: target.y - 4 }
    : { x: width * 0.92, y: state.player.y - 26 };
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;
  const distance = Math.hypot(dx, dy) || 1;

  state.player.freezeCastMs = Freeze.castPulseMs;
  state.projectiles.push({
    id: state.nextProjectileId++,
    spellName: 'Freeze',
    x: origin.x,
    y: origin.y,
    vx: (dx / distance) * Freeze.projectileSpeed,
    vy: (dy / distance) * Freeze.projectileSpeed,
    radius: Freeze.projectileRadius,
    damage: Freeze.damage,
    color: '191 219 254',
    life: Freeze.projectileLifeMs,
    maxLife: Freeze.projectileLifeMs,
  });
  state.rings.push(
    createRingEffect({
      x: origin.x,
      y: origin.y,
      color: '191 219 254',
      maxRadius: state.player.radius * 1.9,
      lifeMs: 420,
      lineWidth: 3,
    }),
  );
  state.particles.push(
    ...createBurstParticles({
      x: origin.x,
      y: origin.y,
      color: '224 242 254',
      count: 14,
      minSpeed: 24,
      maxSpeed: 110,
      lifeMs: 520,
    }),
    ...createBurstParticles({
      x: origin.x,
      y: origin.y,
      color: '103 232 249',
      count: 8,
      minSpeed: 20,
      maxSpeed: 74,
      minRadius: 1,
      maxRadius: 3,
      lifeMs: 460,
    }),
  );

  return {
    accepted: true,
    headline: 'Freeze cast',
    detail: target
      ? 'A frost shard streaks toward the nearest enemy.'
      : 'A cold shard tears down the lane and leaves a brief chill shimmer.',
  };
}

export function applySpellCast(state, spellName, { now, width }) {
  if (state.gameOver) {
    return {
      accepted: false,
      headline: 'Battle ended',
      detail: 'Restart to cast again.',
    };
  }

  if (spellName === 'Fireball') {
    return castFireball(state, now, width);
  }

  if (spellName === 'Lightning') {
    return castLightning(state, now, width);
  }

  if (spellName === 'Heal') {
    return castHeal(state, now);
  }

  if (spellName === 'Freeze') {
    return castFreeze(state, now, width);
  }

  return {
    accepted: false,
    headline: 'Unmapped spell',
    detail: 'That gesture does not have a gameplay effect.',
  };
}
