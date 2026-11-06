import { describe, expect, it } from 'vitest';
import {
  decideMode,
  findOverlaps,
  isScheduleActive,
  minuteOfWeek,
  normalizeModesSettings,
  scheduledModeAt,
  scheduleSpans,
} from './displayModes.js';

const at = (iso) => new Date(iso);
const morning = { id: 'm', name: 'Morning', schedule: { days: [1, 2, 3, 4, 5], start: '06:00', end: '09:00' } };
const overnight = { id: 'o', name: 'Overnight', schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '06:00' } };

describe('normalizeModesSettings', () => {
  it('fills defaults and drops broken modes and duplicate ids', () => {
    const out = normalizeModesSettings({
      modes: [morning, { id: 'm', name: 'Again' }, { id: 'x' }, null, { id: 'y', name: '  Night ', schedule: { days: [], start: '1', end: '2' } }],
      returnMinutes: 9999,
    });
    expect(out.modes.map((m) => m.id)).toEqual(['m', 'y']);
    expect(out.modes[1].name).toBe('Night');
    expect(out.modes[1].schedule).toBeNull();
    expect(out.returnMinutes).toBe(120);
    expect(out.showLabel).toBe(true);
  });

});

describe('schedules', () => {
  it('reads the time in the household zone', () => {
    // 2026-11-02 is a Monday. 12:30 UTC is 06:30 in Chicago.
    expect(minuteOfWeek(at('2026-11-02T12:30:00Z'), 'America/Chicago')).toBe(1 * 1440 + 6 * 60 + 30);
  });

  it('is on from start, off at end', () => {
    expect(isScheduleActive(morning.schedule, at('2026-11-02T12:00:00Z'), 'America/Chicago')).toBe(true);
    expect(isScheduleActive(morning.schedule, at('2026-11-02T15:00:00Z'), 'America/Chicago')).toBe(false);
    expect(isScheduleActive(morning.schedule, at('2026-11-02T11:59:00Z'), 'America/Chicago')).toBe(false);
  });

  it('runs past midnight, and past Saturday into Sunday', () => {
    const sat = { days: [6], start: '22:00', end: '02:00' };
    expect(scheduleSpans(sat)).toEqual([[6 * 1440 + 1320, 10080], [0, 120]]);
    // Sunday 01:00 Chicago.
    expect(isScheduleActive(sat, at('2026-11-08T07:00:00Z'), 'America/Chicago')).toBe(true);
  });

  it('picks the scheduled mode or none', () => {
    expect(scheduledModeAt([morning, overnight], at('2026-11-02T12:00:00Z'), 'America/Chicago')).toBe('m');
    expect(scheduledModeAt([morning, overnight], at('2026-11-02T20:00:00Z'), 'America/Chicago')).toBeNull();
  });

  it('finds overlaps, not schedules that only touch', () => {
    expect(findOverlaps([morning, overnight])).toEqual([]);
    const early = { ...morning, schedule: { ...morning.schedule, start: '05:30' } };
    const found = findOverlaps([early, overnight]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ a: 'm', b: 'o', from: 1440 + 330, to: 1440 + 360 });
  });
});

describe('decideMode', () => {
  const base = { scheduledId: 'm', pin: null, shownId: null, lastActivityMs: 0, nowMs: 100000, touchWaitMs: 60000 };

  it('follows the schedule', () => {
    expect(decideMode(base)).toEqual({ want: 'm', pinExpired: false, show: 'm' });
  });

  it('waits while the screen was touched recently', () => {
    expect(decideMode({ ...base, lastActivityMs: 90000 }).show).toBeNull();
  });

  it('holds a pin until the schedule changes', () => {
    const pin = { modeId: 'n', scheduledAtPin: 'm' };
    expect(decideMode({ ...base, pin, shownId: 'n' })).toEqual({ want: 'n', pinExpired: false, show: 'n' });
    expect(decideMode({ ...base, pin, shownId: 'n', scheduledId: null })).toEqual({ want: null, pinExpired: true, show: null });
  });

  it('a pin to Normal (no mode) is a pin too', () => {
    expect(decideMode({ ...base, pin: { modeId: null, scheduledAtPin: 'm' } }).show).toBeNull();
  });
});

describe('Home Assistant', () => {
  const tz = 'America/Chicago';
  const at = (iso) => new Date(iso);
  const base = (m) => ({ schedule: null, alarm: null, when: null, onlyHome: [], ...m });

  it('keeps triggers and the display settings when normalizing', async () => {
    const { normalizeModesSettings } = await import('./displayModes.js');
    const out = normalizeModesSettings({
      modes: [{ id: 'm', name: 'Morning', alarm: { entity: 'sensor.pixel_next_alarm', until: '09:00' }, onlyHome: ['person.jason', 'bad id'] }],
      ha: { helper: 'input_select.kitchen_display_mode', wake: ['person.wife'], report: false },
    });
    expect(out.modes[0].alarm).toEqual({ entity: 'sensor.pixel_next_alarm', until: '09:00' });
    expect(out.modes[0].onlyHome).toEqual(['person.jason']);
    expect(out.ha).toMatchObject({ helper: 'input_select.kitchen_display_mode', wake: ['person.wife'], report: false });
  });

  it('remembers an alarm once it has gone off, even after the sensor moves on', async () => {
    const { rememberAlarms } = await import('./displayModes.js');
    const now = Date.parse('2026-11-02T12:00:00Z');
    let mem = rememberAlarms({}, { 'sensor.a': { state: '2026-11-02T11:55:00Z' } }, now - 10 * 60000);
    expect(mem.rang['sensor.a']).toBeUndefined();
    mem = rememberAlarms(mem, { 'sensor.a': { state: '2026-11-03T11:55:00Z' } }, now);
    expect(mem.rang['sensor.a']).toBe('2026-11-02T11:55:00Z');
  });

  it('an alarm runs its mode until the time given', async () => {
    const { alarmWindow, automaticModeAt } = await import('./displayModes.js');
    // 5:55 am Chicago, until 9:00.
    const [start, end] = alarmWindow('2026-11-02T11:55:00Z', '09:00', tz);
    expect((end - start) / 60000).toBe(185);
    const modes = [base({ id: 'm', alarm: { entity: 'sensor.a', until: '09:00' } })];
    const ha = { states: {} };
    const rang = { 'sensor.a': '2026-11-02T11:55:00Z' };
    expect(automaticModeAt({ modes, now: at('2026-11-02T13:00:00Z'), timeZone: tz, ha, rang })).toEqual({ id: 'm', source: 'alarm' });
    expect(automaticModeAt({ modes, now: at('2026-11-02T15:01:00Z'), timeZone: tz, ha, rang }).id).toBeNull();
  });

  it('an alarm that rang after its "until" turns nothing on', async () => {
    const { alarmWindow, automaticModeAt } = await import('./displayModes.js');
    // 10:00 am Chicago, until 9:00: not on until tomorrow morning.
    expect(alarmWindow('2026-11-02T16:00:00Z', '09:00', tz)).toBeNull();
    // Rang right at 9:00.
    expect(alarmWindow('2026-11-02T15:00:00Z', '09:00', tz)).toBeNull();
    const modes = [base({ id: 'm', alarm: { entity: 'sensor.a', until: '09:00' } })];
    const rang = { 'sensor.a': '2026-11-02T16:00:00Z' };
    expect(automaticModeAt({ modes, now: at('2026-11-02T16:30:00Z'), timeZone: tz, ha: { states: {} }, rang }).id).toBeNull();
    // Past midnight is fine: 10 pm until 6 am.
    const [start, end] = alarmWindow('2026-11-03T04:00:00Z', '06:00', tz);
    expect((end - start) / 60000).toBe(8 * 60);
  });

  it('an alarm can keep its mode on all day, until the evening', async () => {
    const { alarmWindow, automaticModeAt } = await import('./displayModes.js');
    // 7:00 am Chicago, until 8:00 pm: thirteen hours, not nothing.
    const [start, end] = alarmWindow('2026-11-02T13:00:00Z', '20:00', tz);
    expect((end - start) / 60000).toBe(13 * 60);
    const modes = [base({ id: 'm', alarm: { entity: 'sensor.a', until: '20:00' } })];
    const rang = { 'sensor.a': '2026-11-02T13:00:00Z' };
    expect(automaticModeAt({ modes, now: at('2026-11-03T01:30:00Z'), timeZone: tz, ha: { states: {} }, rang }).id).toBe('m');
    expect(automaticModeAt({ modes, now: at('2026-11-03T02:01:00Z'), timeZone: tz, ha: { states: {} }, rang }).id).toBeNull();
    // Overnight stays capped: rang 5 pm, until 6 am is "rang after until".
    expect(alarmWindow('2026-11-02T23:00:00Z', '06:00', tz)).toBeNull();
    // "Until 00:00" is the end of that day: 7 am until midnight is 17 hours.
    const [s0, e0] = alarmWindow('2026-11-02T13:00:00Z', '00:00', tz);
    expect((e0 - s0) / 60000).toBe(17 * 60);
  });

  it('an alarm ends at "until" on the clock across a clock change', async () => {
    const { alarmWindow } = await import('./displayModes.js');
    // Clocks went back at 2:00 am Chicago on Nov 1, 2026. Rang 1:30 am CDT
    // (06:30Z), until 6:00 am CST (12:00Z): five and a half hours pass.
    const [start, end] = alarmWindow('2026-11-01T06:30:00Z', '06:00', tz);
    expect(new Date(end).toISOString()).toBe('2026-11-01T12:00:00.000Z');
    expect((end - start) / 60000).toBe(5.5 * 60);
    // Clocks went forward at 2:00 am on Mar 8, 2026. Rang 1:30 am CST
    // (07:30Z), until 6:00 am CDT (11:00Z): three and a half hours.
    const [s2, e2] = alarmWindow('2026-03-08T07:30:00Z', '06:00', tz);
    expect(new Date(e2).toISOString()).toBe('2026-03-08T11:00:00.000Z');
    expect((e2 - s2) / 60000).toBe(3.5 * 60);
  });

  it('an entity trigger beats a schedule; only-home holds both back', async () => {
    const { automaticModeAt } = await import('./displayModes.js');
    const modes = [
      base({ id: 'night', schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' } }),
      base({ id: 'guest', when: { entity: 'input_boolean.guest', state: 'on' }, onlyHome: ['person.jason'] }),
    ];
    const now = at('2026-11-02T18:00:00Z');
    const home = { 'person.jason': { state: 'home' } };
    expect(automaticModeAt({ modes, now, timeZone: tz, ha: { states: { ...home, 'input_boolean.guest': { state: 'on' } } } })).toEqual({ id: 'guest', source: 'entity' });
    expect(automaticModeAt({ modes, now, timeZone: tz, ha: { states: { 'person.jason': { state: 'not_home' }, 'input_boolean.guest': { state: 'on' } } } }).id).toBe('night');
    // Home Assistant away: triggers off, schedules carry on.
    expect(automaticModeAt({ modes, now, timeZone: tz, ha: null })).toEqual({ id: 'night', source: 'schedule' });
  });

  it('zones count people', async () => {
    const { isHome } = await import('./displayModes.js');
    expect(isHome({ state: '2' })).toBe(true);
    expect(isHome({ state: '0' })).toBe(false);
    expect(isHome({ state: 'home' })).toBe(true);
    expect(isHome({ state: 'Work' })).toBe(false);
  });

  it('reads the helper: Automatic, Normal, a mode, and the wall\'s own echo', async () => {
    const { helperCommand } = await import('./displayModes.js');
    const modes = [{ id: 'm', name: 'Morning' }, { id: 'n', name: 'Night' }];
    expect(helperCommand({ modes, option: 'Automatic' })).toBeNull();
    expect(helperCommand({ modes, option: 'Normal' })).toEqual({ modeId: null });
    expect(helperCommand({ modes, option: 'Night' })).toEqual({ modeId: 'n' });
    expect(helperCommand({ modes, option: 'Party' })).toBeNull();
    expect(helperCommand({ modes, option: 'Night', pin: { modeId: 'n' } })).toBeNull();
    expect(helperCommand({ modes, option: 'Night', pin: { modeId: 'm' } })).toEqual({ modeId: 'n' });
  });
});

describe('pins and Home Assistant going away', () => {
  it('a pin outlives Home Assistant going away, but not the schedule moving on', async () => {
    const { decideMode, pinWhileHaAway } = await import('./displayModes.js');
    // Pinned "movie" while the "guest" trigger mode was on; the schedule alone said none.
    const pin = { modeId: 'movie', scheduledAtPin: 'guest', scheduleAtPin: null, at: 1 };
    const decide = (scheduledId, haAway) => decideMode({
      scheduledId, pin: pinWhileHaAway(pin, haAway), shownId: 'movie', lastActivityMs: -Infinity, nowMs: 0, touchWaitMs: 0,
    });
    // Before: Home Assistant away drops "guest" and the pin went with it.
    expect(decideMode({ scheduledId: null, pin, shownId: 'movie', lastActivityMs: -Infinity, nowMs: 0, touchWaitMs: 0 }).pinExpired).toBe(true);
    // Now it holds.
    expect(decide(null, true)).toMatchObject({ pinExpired: false, show: 'movie' });
    // A schedule starting while it's away still ends it.
    expect(decide('night', true).pinExpired).toBe(true);
    // Back again with "guest" still on: still pinned.
    expect(decide('guest', false).pinExpired).toBe(false);
  });

  it('pins saved by an older build behave as before', async () => {
    const { pinWhileHaAway } = await import('./displayModes.js');
    const old = { modeId: 'movie', scheduledAtPin: 'guest' };
    expect(pinWhileHaAway(old, true)).toBe(old);
    expect(pinWhileHaAway(null, true)).toBeNull();
  });

  it("the wall's helper choice holds until Home Assistant shows it", async () => {
    const { readHelper } = await import('./displayModes.js');
    const seen = { option: 'Movie', at: 1000 };
    const pending = { option: 'Movie', acceptedAt: null, failed: false, sends: 1 };
    // Not yet accepted: an old answer is ignored, however late it started.
    expect(readHelper({ seen, pending, option: 'Automatic', readStartedAt: 1500, now: 1600 })).toEqual({ seen, pending, resend: false });
    // Accepted at 2000: a read that started just after can still be old.
    const accepted = { ...pending, acceptedAt: 2000 };
    expect(readHelper({ seen, pending: accepted, option: 'Automatic', readStartedAt: 2500, now: 2600 }).pending).toBe(accepted);
    // Well after: Home Assistant really says Automatic.
    expect(readHelper({ seen, pending: accepted, option: 'Automatic', readStartedAt: 3500, now: 3600 }))
      .toEqual({ seen: { option: 'Automatic', at: 3600 }, pending: null, resend: false });
    // Shows the wall's choice: settled.
    expect(readHelper({ seen, pending: accepted, option: 'Movie', readStartedAt: 2100, now: 2200 }).pending).toBeNull();
  });

  it('a choice that could not be sent goes again when Home Assistant answers, a few times at most', async () => {
    const { readHelper, HELPER_MAX_SENDS } = await import('./displayModes.js');
    const seen = { option: 'Movie', at: 1000 };
    const failed = { option: 'Movie', acceptedAt: null, failed: true, sends: 1 };
    const out = readHelper({ seen, pending: failed, option: 'Automatic', readStartedAt: 9000, now: 9100 });
    expect(out.resend).toBe(true);
    expect(out.seen).toBe(seen);
    const refused = { ...failed, sends: HELPER_MAX_SENDS };
    // Given up: the wall stops trying, and its pin stands (not "changed in HA").
    expect(readHelper({ seen, pending: refused, option: 'Automatic', readStartedAt: 9000, now: 9100 }))
      .toEqual({ seen: { option: 'Automatic', at: 0 }, pending: null, resend: false });
  });

  it('with nothing pending, a change is taken; the first read counts as long ago', async () => {
    const { readHelper } = await import('./displayModes.js');
    expect(readHelper({ seen: { option: undefined, at: 0 }, pending: null, option: 'Night', readStartedAt: 5, now: 10 }).seen).toEqual({ option: 'Night', at: 0 });
    expect(readHelper({ seen: { option: 'Night', at: 0 }, pending: null, option: 'Movie', readStartedAt: 5, now: 10 }).seen).toEqual({ option: 'Movie', at: 10 });
  });
});
