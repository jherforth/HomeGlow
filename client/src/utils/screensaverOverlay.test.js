import { describe, it, expect } from 'vitest';
import {
  clampAgendaDays,
  localDateKey,
  addDaysToKey,
  eventDayKeys,
  buildAgenda,
  limitAgenda,
  pickWeatherSettings,
  weatherRequestParams,
  parseTabConfigJson,
} from './screensaverOverlay.js';

// Every date assertion pins a zone, so the suite means the same thing on a CI
// box in UTC as on a wall display in New York.
const NY = 'America/New_York';

describe('clampAgendaDays', () => {
  it('keeps the window between today and a full week', () => {
    expect(clampAgendaDays(1)).toBe(1);
    expect(clampAgendaDays(7)).toBe(7);
    expect(clampAgendaDays(0)).toBe(1);
    expect(clampAgendaDays(30)).toBe(7);
    expect(clampAgendaDays('3')).toBe(3);
    expect(clampAgendaDays('nonsense')).toBe(1);
    expect(clampAgendaDays(undefined)).toBe(1);
  });
});

describe('date keys', () => {
  it('reads the calendar day in the given zone, not UTC', () => {
    // 02:00Z on the 8th is still the evening of the 7th in New York.
    expect(localDateKey(new Date('2026-09-08T02:00:00Z'), NY)).toBe('2026-09-07');
    expect(localDateKey(new Date('2026-09-08T02:00:00Z'), 'UTC')).toBe('2026-09-08');
  });

  it('shifts across month and year boundaries', () => {
    expect(addDaysToKey('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('eventDayKeys', () => {
  it('puts a single-day all-day event on one day, not two', () => {
    // How ICS and Google encode it: end is the following midnight, exclusive.
    // Counting that midnight lists the event twice.
    const labourDay = { start: '2026-09-07T04:00:00Z', end: '2026-09-08T04:00:00Z', all_day: true };
    expect(eventDayKeys(labourDay, NY)).toEqual(['2026-09-07']);
  });

  it('spans a multi-day all-day event across each day it covers', () => {
    const trip = { start: '2026-09-05T04:00:00Z', end: '2026-09-08T04:00:00Z', all_day: true };
    expect(eventDayKeys(trip, NY)).toEqual(['2026-09-05', '2026-09-06', '2026-09-07']);
  });

  it('treats an end before the start as a single day rather than looping', () => {
    // A real row from the seeded town feed.
    const malformed = { start: '2026-09-07T04:00:00Z', end: '2026-09-06T04:00:00Z', all_day: true };
    expect(eventDayKeys(malformed, NY)).toEqual(['2026-09-07']);
  });

  it('keeps a timed event that ends exactly at midnight on its own day', () => {
    const lateShow = { start: '2026-09-07T23:00:00-04:00', end: '2026-09-08T00:00:00-04:00' };
    expect(eventDayKeys(lateShow, NY)).toEqual(['2026-09-07']);
  });

  it('carries a timed event past midnight onto the next day', () => {
    const overnight = { start: '2026-09-07T22:00:00-04:00', end: '2026-09-08T02:00:00-04:00' };
    expect(eventDayKeys(overnight, NY)).toEqual(['2026-09-07', '2026-09-08']);
  });

  it('ignores an unparseable start', () => {
    expect(eventDayKeys({ start: 'garbage' }, NY)).toEqual([]);
  });
});

describe('buildAgenda', () => {
  const events = [
    { id: 'dentist', title: 'Dentist', start: '2026-09-07T13:30:00Z', end: '2026-09-07T14:15:00Z' },
    { id: 'holiday', title: 'Labor Day', start: '2026-09-07T04:00:00Z', end: '2026-09-08T04:00:00Z', all_day: true },
    { id: 'recital', title: 'Recital', start: '2026-09-09T19:00:00Z', end: '2026-09-09T20:00:00Z' },
    { id: 'early', title: 'Standup', start: '2026-09-07T12:00:00Z', end: '2026-09-07T12:15:00Z' },
    { id: 'far', title: 'Next month', start: '2026-10-07T12:00:00Z', end: '2026-10-07T13:00:00Z' },
  ];

  it('returns one entry per day in the window, empty days included', () => {
    const agenda = buildAgenda(events, { todayKey: '2026-09-07', days: 3, timeZone: NY });
    expect(agenda.map((d) => d.date)).toEqual(['2026-09-07', '2026-09-08', '2026-09-09']);
    expect(agenda[1].events).toEqual([]);
  });

  it('orders a day with all-day first, then by start time', () => {
    const [today] = buildAgenda(events, { todayKey: '2026-09-07', days: 1, timeZone: NY });
    expect(today.events.map((e) => e.id)).toEqual(['holiday', 'early', 'dentist']);
  });

  it('leaves out events beyond the window', () => {
    const agenda = buildAgenda(events, { todayKey: '2026-09-07', days: 7, timeZone: NY });
    expect(agenda.flatMap((d) => d.events).some((e) => e.id === 'far')).toBe(false);
  });

  it('marks a timed event carried over from yesterday, but not an all-day one', () => {
    const multi = [
      { id: 'overnight', title: 'Overnight', start: '2026-09-07T22:00:00-04:00', end: '2026-09-08T02:00:00-04:00' },
      { id: 'trip', title: 'Trip', start: '2026-09-07T04:00:00Z', end: '2026-09-09T04:00:00Z', all_day: true },
    ];
    const [, tomorrow] = buildAgenda(multi, { todayKey: '2026-09-07', days: 2, timeZone: NY });
    const byId = Object.fromEntries(tomorrow.events.map((e) => [e.id, e]));
    expect(byId.overnight.continued).toBe(true);
    expect(byId.trip.continued).toBe(false);
  });

  it('clamps an out-of-range day count', () => {
    expect(buildAgenda([], { todayKey: '2026-09-07', days: 99, timeZone: NY })).toHaveLength(7);
  });
});

describe('limitAgenda', () => {
  const day = (date, n) => ({ date, events: Array.from({ length: n }, (_, i) => ({ id: `${date}-${i}` })) });

  it('fills days in order until the line budget runs out, counting the rest', () => {
    // 7 lines: a = heading + 3, b = heading + 2, then nothing left for c.
    const { days, hidden } = limitAgenda([day('a', 3), day('b', 4), day('c', 2)], 7);
    expect(days.map((d) => [d.date, d.events.length])).toEqual([['a', 3], ['b', 2]]);
    expect(hidden).toBe(2 + 2);
  });

  it('counts day headings, so a week of one-event days stays in the corner', () => {
    // Seven days, one event each, is fourteen lines. Budgeting events alone let
    // this fill half a 1080p screen.
    const week = ['1', '2', '3', '4', '5', '6', '7'].map((d) => day(d, 1));
    const { days, hidden } = limitAgenda(week, 10);
    expect(days).toHaveLength(5);
    expect(hidden).toBe(2);
    const lines = days.reduce((n, d) => n + 1 + d.events.length, 0);
    expect(lines).toBeLessThanOrEqual(10);
  });

  it('never starts a day it can only fit the heading of', () => {
    const { days, hidden } = limitAgenda([day('a', 2), day('b', 3)], 4);
    // a = 3 lines, 1 left: not enough for b's heading and an event.
    expect(days.map((d) => d.date)).toEqual(['a']);
    expect(hidden).toBe(3);
  });

  it('drops empty days from a longer window', () => {
    const { days } = limitAgenda([day('a', 1), day('b', 0), day('c', 1)], 8);
    expect(days.map((d) => d.date)).toEqual(['a', 'c']);
  });

  it('keeps a single empty day so the overlay can say the day is free', () => {
    const { days, hidden } = limitAgenda([day('a', 0)], 8);
    expect(days).toEqual([{ date: 'a', events: [] }]);
    expect(hidden).toBe(0);
  });
});

describe('pickWeatherSettings', () => {
  const tab = (number, weather) => ({ number, config_json: JSON.stringify(weather ? { weather } : {}) });

  it('uses the first tab, by number, that has a weather widget configured', () => {
    const picked = pickWeatherSettings([
      tab(3, { locationQuery: 'Tucson,AZ', tempUnit: 'C' }),
      tab(1, null),
      tab(2, { locationQuery: '14818', tempUnit: 'F' }),
    ]);
    expect(picked).toEqual({ locationQuery: '14818', coordinates: null, tempUnit: 'F' });
  });

  it('prefers saved coordinates, which skip the geocoding round trip', () => {
    const picked = pickWeatherSettings([tab(1, { locationQuery: 'Chili', lat: 43.08, lon: -77.75, tempUnit: 'C' })]);
    expect(picked.coordinates).toEqual({ lat: 43.08, lon: -77.75 });
    expect(weatherRequestParams(picked)).toEqual({ units: 'metric', lang: 'en', lat: 43.08, lon: -77.75 });
  });

  it('reads the older zipCode field', () => {
    expect(pickWeatherSettings([tab(1, { zipCode: '90210' })]).locationQuery).toBe('90210');
  });

  it('returns null rather than guessing a place when nothing is configured', () => {
    expect(pickWeatherSettings([tab(1, null), tab(2, { tempUnit: 'C' })])).toBeNull();
    expect(pickWeatherSettings(undefined)).toBeNull();
  });

  it('tolerates config_json that is already an object, or malformed', () => {
    expect(parseTabConfigJson({ weather: { locationQuery: 'x' } })).toEqual({ weather: { locationQuery: 'x' } });
    expect(parseTabConfigJson('{not json')).toEqual({});
    expect(parseTabConfigJson('[1,2]')).toEqual({});
  });
});

describe('weatherRequestParams', () => {
  it('sends the location when there are no coordinates', () => {
    expect(weatherRequestParams({ locationQuery: '14818', coordinates: null, tempUnit: 'F' }, 'es-MX'))
      .toEqual({ units: 'imperial', lang: 'es', location: '14818' });
  });

  it('sends no location at all when none is configured', () => {
    expect(weatherRequestParams(null)).toEqual({ units: 'imperial', lang: 'en' });
  });
});
