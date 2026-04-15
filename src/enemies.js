export const ENEMY_ARCHETYPES = {
  EMBER: {
    key: 'EMBER',
    label: 'Briar Beast',
    sequence: ['Fireball'],
    indicatorSequence: ['Fireball'],
    renderKey: 'briarBeast',
    motionStyle: 'default',
    auraStyle: 'default',
    spawn: { minWave: 1, weight: 1 },
    phaseVisuals: {
      idle: 'thorn shell intact',
      primed: 'n/a',
    },
    rgb: '248 113 113',
    accent: '#f87171',
    core: '#fde68a',
    outline: '71 48 32',
    bodyPrimary: '#57412b',
    bodySecondary: '#7c5a3b',
    bodyShadow: '#352516',
    detail: '#84cc16',
    highlight: '#d6b98b',
    auraMist: '#fecaca',
    chargeRgb: '253 224 71',
  },
  STORM: {
    key: 'STORM',
    label: 'Rune Construct',
    sequence: ['Lightning'],
    indicatorSequence: ['Lightning'],
    renderKey: 'runeConstruct',
    motionStyle: 'storm',
    auraStyle: 'default',
    spawn: { minWave: 1, weight: 1 },
    phaseVisuals: {
      idle: 'runes sealed',
      primed: 'n/a',
    },
    rgb: '250 204 21',
    accent: '#facc15',
    core: '#fff8c2',
    outline: '82 94 114',
    bodyPrimary: '#4b5563',
    bodySecondary: '#94a3b8',
    bodyShadow: '#1f2937',
    detail: '#cbd5e1',
    highlight: '#fef08a',
    auraMist: '#fef3c7',
    chargeRgb: '254 240 138',
  },
  FROST: {
    key: 'FROST',
    label: 'Shadow Wraith',
    sequence: ['Freeze'],
    indicatorSequence: ['Freeze'],
    renderKey: 'shadowWraith',
    motionStyle: 'frost',
    auraStyle: 'frost',
    spawn: { minWave: 1, weight: 1 },
    phaseVisuals: {
      idle: 'shroud drifting',
      primed: 'n/a',
    },
    rgb: '125 211 252',
    accent: '#7dd3fc',
    core: '#e0f2fe',
    outline: '15 23 42',
    bodyPrimary: '#0f172a',
    bodySecondary: '#334155',
    bodyShadow: '#020617',
    detail: '#94a3b8',
    highlight: '#e2e8f0',
    auraMist: '#dbeafe',
    chargeRgb: '224 242 254',
  },
  EMBER_CONDUIT: {
    key: 'EMBER_CONDUIT',
    label: 'Ember Conduit',
    sequence: ['Fireball', 'Lightning'],
    indicatorSequence: ['Fireball', 'Lightning'],
    renderKey: 'emberConduit',
    motionStyle: 'heavy',
    auraStyle: 'default',
    spawn: { minWave: 4, weight: 0.52 },
    phaseVisuals: {
      idle: 'magma seams dormant',
      primed: 'core vents open and conductors spark',
    },
    rgb: '249 115 22',
    accent: '#f97316',
    core: '#fde68a',
    outline: '41 24 16',
    bodyPrimary: '#1c1917',
    bodySecondary: '#44403c',
    bodyShadow: '#0c0a09',
    detail: '#fb923c',
    highlight: '#fdba74',
    auraMist: '#fdba74',
    chargeRgb: '103 232 249',
  },
  TEMPEST_BLOOM: {
    key: 'TEMPEST_BLOOM',
    label: 'Tempest Bloom',
    sequence: ['Lightning', 'Fireball'],
    indicatorSequence: ['Lightning', 'Fireball'],
    renderKey: 'tempestBloom',
    motionStyle: 'hover',
    auraStyle: 'default',
    spawn: { minWave: 5, weight: 0.44 },
    phaseVisuals: {
      idle: 'storm petals gathered',
      primed: 'petals unfurl and ember heart blooms',
    },
    rgb: '129 140 248',
    accent: '#818cf8',
    core: '#c4b5fd',
    outline: '49 46 129',
    bodyPrimary: '#312e81',
    bodySecondary: '#6366f1',
    bodyShadow: '#1e1b4b',
    detail: '#a5b4fc',
    highlight: '#f9a8d4',
    auraMist: '#c7d2fe',
    chargeRgb: '96 165 250',
  },
  FROST_VOLT: {
    key: 'FROST_VOLT',
    label: 'Frost Volt',
    sequence: ['Freeze', 'Lightning'],
    indicatorSequence: ['Freeze', 'Lightning'],
    renderKey: 'frostVolt',
    motionStyle: 'frost',
    auraStyle: 'frost',
    spawn: { minWave: 6, weight: 0.4 },
    phaseVisuals: {
      idle: 'crystal shell sealed',
      primed: 'ice shell cracked and charge leaks free',
    },
    rgb: '103 232 249',
    accent: '#67e8f9',
    core: '#e0f2fe',
    outline: '12 74 110',
    bodyPrimary: '#0f172a',
    bodySecondary: '#0f3b5f',
    bodyShadow: '#020617',
    detail: '#bae6fd',
    highlight: '#f0f9ff',
    auraMist: '#bae6fd',
    chargeRgb: '250 204 21',
  },
};

export const ENEMY_ARCHETYPE_KEYS = Object.keys(ENEMY_ARCHETYPES);
export const COMBO_ENEMY_ARCHETYPE_KEYS = ENEMY_ARCHETYPE_KEYS.filter((key) => (
  ENEMY_ARCHETYPES[key].sequence.length > 1
));
export const NORMAL_ENEMY_ARCHETYPE_KEYS = ENEMY_ARCHETYPE_KEYS.filter((key) => (
  ENEMY_ARCHETYPES[key].sequence.length === 1
));

export function getEnemyArchetype(enemyType) {
  return ENEMY_ARCHETYPES[enemyType] ?? ENEMY_ARCHETYPES.EMBER;
}

export function getEnemySequence(enemyType) {
  return [...getEnemyArchetype(enemyType).sequence];
}

export function isComboEnemyType(enemyType) {
  return getEnemySequence(enemyType).length > 1;
}

export function getWaveComboLimit(waveNumber) {
  if (waveNumber >= 8) {
    return 3;
  }

  if (waveNumber >= 6) {
    return 2;
  }

  if (waveNumber >= 4) {
    return 1;
  }

  return 0;
}

export function getEnemySpawnPool(waveNumber, { allowCombos = true } = {}) {
  return ENEMY_ARCHETYPE_KEYS
    .map((key) => {
      const archetype = ENEMY_ARCHETYPES[key];
      const isCombo = archetype.sequence.length > 1;
      const minWave = archetype.spawn?.minWave ?? 1;

      if (waveNumber < minWave || (isCombo && !allowCombos)) {
        return null;
      }

      return {
        key,
        weight: archetype.spawn?.weight ?? 1,
        isCombo,
      };
    })
    .filter(Boolean);
}
