import { describe, it, expect } from 'vitest';
import { settingsEqual, shouldPersistSettings } from './widgetSettingsPersist';

describe('settingsEqual', () => {
  it('ignores key order, so a JSON round-trip does not read as a change', () => {
    expect(settingsEqual(
      { soundEnabled: true, showBonusChores: false },
      { showBonusChores: false, soundEnabled: true },
    )).toBe(true);
  });

  it('compares arrays by position, not identity', () => {
    expect(settingsEqual({ hiddenUserIds: [1, 2] }, { hiddenUserIds: [1, 2] })).toBe(true);
    expect(settingsEqual({ hiddenUserIds: [1, 2] }, { hiddenUserIds: [2, 1] })).toBe(false);
  });

  it('compares nested objects', () => {
    const a = { eventColors: { backgroundColor: '#6e44ff', textColor: '#ffffff' } };
    const b = { eventColors: { textColor: '#ffffff', backgroundColor: '#6e44ff' } };
    expect(settingsEqual(a, b)).toBe(true);
    expect(settingsEqual(a, { eventColors: { backgroundColor: '#000', textColor: '#fff' } })).toBe(false);
  });

  it('does not conflate a number with its string form', () => {
    expect(settingsEqual({ textSize: 12 }, { textSize: '12' })).toBe(false);
  });

  it('distinguishes absent from explicitly undefined-valued keys only by value', () => {
    expect(settingsEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });
});

describe('shouldPersistSettings', () => {
  const loaded = { showBonusChores: false, soundEnabled: true, hiddenUserIds: [1, 2] };

  it('does not persist the values that were just loaded — this is the mount write', () => {
    expect(shouldPersistSettings(loaded, { ...loaded })).toBe(false);
  });

  it('persists a real edit', () => {
    expect(shouldPersistSettings(loaded, { ...loaded, soundEnabled: false })).toBe(true);
  });

  it('persists when an array member changes', () => {
    expect(shouldPersistSettings(loaded, { ...loaded, hiddenUserIds: [1] })).toBe(true);
  });

  // The data-loss case. A failed settings GET leaves the widget holding its own
  // defaults; without this guard the next effect run writes those defaults over
  // whatever the server had.
  it('never persists when the load did not succeed, even though the values differ', () => {
    const componentDefaults = { showBonusChores: true, soundEnabled: true, hiddenUserIds: [] };
    expect(shouldPersistSettings(null, componentDefaults)).toBe(false);
    expect(shouldPersistSettings(undefined, componentDefaults)).toBe(false);
  });
});
