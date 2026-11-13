import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import {
  applyHouseholdPoints,
  normalizePointsIcon,
  normalizePointsName,
  pointsVariables,
  readHouseholdPoints,
  refreshPointsVariables,
  resolvePointsVariables,
  DEFAULT_POINTS_ICON,
  POINTS_CHANGED_EVENT,
  POINTS_ICON_SUGGESTIONS,
} from './points.js';

describe('normalizePointsName', () => {
  it('trims, collapses spaces and cuts at 24 characters', () => {
    expect(normalizePointsName('  Gold   coins ')).toBe('Gold coins');
    expect(normalizePointsName('x'.repeat(30))).toBe('x'.repeat(24));
  });

  it('is blank (the default) for nothing usable', () => {
    expect(normalizePointsName('   ')).toBe('');
    expect(normalizePointsName(undefined)).toBe('');
    expect(normalizePointsName(7)).toBe('');
  });
});

describe('normalizePointsIcon', () => {
  it('keeps the emoji out of what was typed', () => {
    expect(normalizePointsIcon('🥟')).toBe('🥟');
    expect(normalizePointsIcon('⭐🪙')).toBe('🪙');
    expect(normalizePointsIcon('coins 💰')).toBe('💰');
  });

  it('is blank for text with no emoji', () => {
    expect(normalizePointsIcon('Stars')).toBe('');
    expect(normalizePointsIcon('')).toBe('');
    expect(normalizePointsIcon(null)).toBe('');
  });

  it('accepts every suggested emoji', () => {
    for (const emoji of POINTS_ICON_SUGGESTIONS) expect(normalizePointsIcon(emoji)).toBe(emoji);
  });
});

describe('readHouseholdPoints and resolvePointsVariables', () => {
  it('reads the two settings, blank where unset', () => {
    expect(readHouseholdPoints({})).toEqual({ name: '', icon: '' });
    expect(readHouseholdPoints({ POINTS_NAME: ' Clams ', POINTS_ICON: '🥟' })).toEqual({ name: 'Clams', icon: '🥟' });
  });

  it('fills the defaults in: the translated name and ⭐', () => {
    expect(resolvePointsVariables({ name: '', icon: '' }, 'Estrellas')).toEqual({ points: 'Estrellas', pointsIcon: DEFAULT_POINTS_ICON });
    expect(resolvePointsVariables({ name: 'Robux', icon: '💎' }, 'Stars')).toEqual({ points: 'Robux', pointsIcon: '💎' });
  });
});

describe('with i18next', () => {
  // The same wiring as i18n/index.js: the shared object as default variables,
  // and a language change refreshing the translated default.
  const setup = async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: 'en',
      resources: {
        en: { common: { points: { defaultName: 'Stars', amount: '{{amount}} {{pointsIcon}}' } }, chores: { redeem: 'Redeem {{points}}' } },
        es: { common: { points: { defaultName: 'Estrellas', amount: '{{amount}} {{pointsIcon}}' } }, chores: { redeem: 'Canjear {{points}}' } },
      },
      ns: ['common', 'chores'],
      defaultNS: 'common',
      interpolation: { escapeValue: false, defaultVariables: pointsVariables },
    });
    i18n.on('languageChanged', () => refreshPointsVariables(i18n));
    refreshPointsVariables(i18n);
    return i18n;
  };

  it('every string can name the points without being passed them', async () => {
    const i18n = await setup();
    applyHouseholdPoints(i18n, {});
    expect(i18n.t('chores:redeem')).toBe('Redeem Stars');
    expect(i18n.t('common:points.amount', { amount: 5 })).toBe('5 ⭐');
  });

  it("follows the household's choice, and announces the change once", async () => {
    const i18n = await setup();
    applyHouseholdPoints(i18n, {});
    let changes = 0;
    i18n.on(POINTS_CHANGED_EVENT, () => { changes += 1; });

    expect(applyHouseholdPoints(i18n, { POINTS_NAME: 'Clams', POINTS_ICON: '🥟' })).toBe(true);
    expect(i18n.t('chores:redeem')).toBe('Redeem Clams');
    expect(i18n.t('common:points.amount', { amount: 3 })).toBe('3 🥟');
    expect(changes).toBe(1);

    expect(applyHouseholdPoints(i18n, { POINTS_NAME: 'Clams', POINTS_ICON: '🥟' })).toBe(false);
    expect(changes).toBe(1);

    applyHouseholdPoints(i18n, { POINTS_NAME: '', POINTS_ICON: '' });
    expect(i18n.t('chores:redeem')).toBe('Redeem Stars');
  });

  it('the default name follows the language; a chosen one stays as written', async () => {
    const i18n = await setup();
    applyHouseholdPoints(i18n, {});
    await i18n.changeLanguage('es');
    expect(i18n.t('chores:redeem')).toBe('Canjear Estrellas');

    applyHouseholdPoints(i18n, { POINTS_NAME: 'Robux' });
    expect(i18n.t('chores:redeem')).toBe('Canjear Robux');
    await i18n.changeLanguage('en');
    expect(i18n.t('chores:redeem')).toBe('Redeem Robux');
    applyHouseholdPoints(i18n, {});
  });
});
