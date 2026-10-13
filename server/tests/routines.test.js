const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../services/routines');

const TZ = 'America/New_York';

test('crontabs for weekdays and for one pinned day, and back', () => {
  assert.equal(rules.crontabForDays([]), '0 0 * * *');
  assert.equal(rules.crontabForDays([0, 1, 2, 3, 4, 5, 6]), '0 0 * * *');
  assert.equal(rules.crontabForDays([5, 1, 3]), '0 0 * * 1,3,5');
  assert.equal(rules.crontabForDate('2026-10-04'), '0 0 4 10 *');
  assert.deepEqual(rules.daysFromCrontab('0 0 * * 1,3,5'), [1, 3, 5]);
  assert.deepEqual(rules.daysFromCrontab('0 0 * * *'), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(rules.daysFromCrontab('0 0 4 10 *'), null);
  // A pinned day has no year: the nearest one to today.
  assert.equal(rules.dateFromCrontab('0 0 4 10 *', '2026-10-13'), '2026-10-04');
  assert.equal(rules.dateFromCrontab('0 0 2 1 *', '2026-12-30'), '2027-01-02');
});

test('event titles match by whole words unless told otherwise', () => {
  const whole = { match_text: 'France', whole_word: 1 };
  assert.equal(rules.titleMatches(whole, 'France practice'), true);
  assert.equal(rules.titleMatches(whole, "Francesca's party"), false);
  assert.equal(rules.titleMatches({ match_text: 'Fran', whole_word: 0 }, "Francesca's party"), true);
  assert.equal(rules.titleMatches({ match_text: 'fútbol', whole_word: 1 }, 'Práctica de Fútbol'), true);
  assert.equal(rules.titleMatches({ match_text: '', whole_word: 1 }, 'anything'), false);
  assert.equal(rules.titleMatches({ match_text: 'a+b', whole_word: 1 }, 'a+b night'), true);
});

test('matching days: the next two weeks, earliest event, lead minutes, all-day uses the routine time', () => {
  const routine = { match_text: 'Soccer', whole_word: 1, lead_minutes: 30, calendar_source_ids: [] };
  const at = (iso) => new Date(iso);
  const events = [
    { title: 'Soccer practice', start: at('2026-10-14T21:00:00Z'), source_id: 1 }, // 17:00 New York
    { title: 'Soccer game', start: at('2026-10-14T19:00:00Z'), source_id: 1 },     // 15:00, earlier
    { title: 'Soccer tournament', start: at('2026-10-17T04:00:00Z'), all_day: true, source_id: 2 },
    { title: 'Soccer far away', start: at('2026-11-20T21:00:00Z'), source_id: 1 },
    { title: 'Soccer last week', start: at('2026-10-01T21:00:00Z'), source_id: 1 },
    { title: 'Piano', start: at('2026-10-15T21:00:00Z'), source_id: 1 },
  ];
  assert.deepEqual(rules.matchingDays(routine, events, '2026-10-13', TZ), { '2026-10-14': '14:30', '2026-10-17': '' });
  // Only the calendars picked.
  assert.deepEqual(rules.matchingDays({ ...routine, calendar_source_ids: [2] }, events, '2026-10-13', TZ), { '2026-10-17': '' });
});

test('calendar sync plan: make, retime, remove a moved event, keep today if done, hide, delete', () => {
  const routine = { start_time: '08:00' };
  const today = '2026-10-13';
  const pinned = {
    '2026-10-14': { scheduleId: 1 }, // still wanted, time changed
    '2026-10-15': { scheduleId: 2 }, // event moved away
    '2026-10-13': { scheduleId: 3 }, // today, event gone, but done
    '2026-10-09': { scheduleId: 4 }, // past: hide
    '2026-05-01': { scheduleId: 5 }, // long past: delete
    '2026-10-20': { scheduleId: 6 }, // deleted by hand elsewhere
  };
  const schedules = {
    1: { id: 1, due_time: '16:00', visible: 1 },
    2: { id: 2, due_time: '16:00', visible: 1 },
    3: { id: 3, due_time: '16:00', visible: 1 },
    4: { id: 4, due_time: '16:00', visible: 1 },
    5: { id: 5, due_time: '16:00', visible: 0 },
  };
  const wanted = { '2026-10-14': '15:30', '2026-10-16': '' };
  const plan = rules.planCalendarSync({ routine, pinned, schedules, wanted, today, completed: (id) => id === 3 });
  assert.deepEqual(plan.create, [{ date: '2026-10-16', dueTime: '08:00' }]);
  assert.deepEqual(plan.retime, [{ date: '2026-10-14', scheduleId: 1, dueTime: '15:30' }]);
  assert.deepEqual(plan.remove.map((r) => r.scheduleId).sort(), [2, 5]);
  assert.deepEqual(plan.hide, [{ date: '2026-10-09', scheduleId: 4 }]);
  assert.deepEqual(plan.forget, ['2026-10-20']);
  // Not done today: today's goes too.
  const notDone = rules.planCalendarSync({ routine, pinned, schedules, wanted, today, completed: () => false });
  assert.ok(notDone.remove.some((r) => r.scheduleId === 3));
});

test('streaks count scheduled days in a row; today counts once done and does not break the run while open', () => {
  const routine = { trigger: 'days', days: '1,3,5', schedule_id: 9 }; // Mon, Wed, Fri
  const keys = (dates) => new Set(dates.map((d) => `9|${d}`));
  // Tue 2026-10-13: Mon 12, Fri 9, Wed 7 done; Mon 5 not.
  assert.equal(rules.streak(routine, keys(['2026-10-12', '2026-10-09', '2026-10-07']), {}, '2026-10-13'), 3);
  // Wed 2026-10-14 not yet done: still 3.
  assert.equal(rules.streak(routine, keys(['2026-10-12', '2026-10-09', '2026-10-07']), {}, '2026-10-14'), 3);
  // Done today: 4.
  assert.equal(rules.streak(routine, keys(['2026-10-14', '2026-10-12', '2026-10-09', '2026-10-07']), {}, '2026-10-14'), 4);
  // A missed scheduled day breaks it.
  assert.equal(rules.streak(routine, keys(['2026-10-12', '2026-10-07']), {}, '2026-10-13'), 1);

  const calendar = { trigger: 'calendar' };
  const pinned = { '2026-10-02': { scheduleId: 1 }, '2026-10-06': { scheduleId: 2 }, '2026-10-13': { scheduleId: 3 }, '2026-10-20': { scheduleId: 4 } };
  const done = new Set(['1|2026-10-02', '2|2026-10-06']);
  assert.equal(rules.streak(calendar, done, pinned, '2026-10-13'), 2, 'today open, future days not counted');
  done.add('3|2026-10-13');
  assert.equal(rules.streak(calendar, done, pinned, '2026-10-13'), 3);
});

test('vacation days neither extend nor break a run', () => {
  const routine = { trigger: 'days', days: '', schedule_id: 9 }; // every day
  const keys = (dates) => new Set(dates.map((d) => `9|${d}`));
  const done = keys(['2026-10-12', '2026-10-09', '2026-10-08']); // 10 and 11 not done
  assert.equal(rules.streak(routine, done, {}, '2026-10-13'), 1);
  const isVacation = (d) => d === '2026-10-10' || d === '2026-10-11';
  assert.equal(rules.streak(routine, done, {}, '2026-10-13', { isVacation }), 3);
  // Done on a vacation day, it counts.
  done.add('9|2026-10-11');
  assert.equal(rules.streak(routine, done, {}, '2026-10-13', { isVacation }), 4);

  const calendar = { trigger: 'calendar' };
  const pinned = { '2026-10-02': { scheduleId: 1 }, '2026-10-06': { scheduleId: 2 }, '2026-10-09': { scheduleId: 3 } };
  const events = new Set(['1|2026-10-02', '3|2026-10-09']);
  assert.equal(rules.streak(calendar, events, pinned, '2026-10-13'), 1);
  assert.equal(rules.streak(calendar, events, pinned, '2026-10-13', { isVacation: (d) => d === '2026-10-06' }), 2);
});

test('an edit to when a routine runs keeps the run it had', () => {
  // Mon, Wed, Fri, done every one of them from Mon 5 to Mon 12.
  const before = { trigger: 'days', days: '1,3,5', schedule_id: 9 };
  const keys = (dates) => new Set(dates.map((d) => `9|${d}`));
  const done = keys(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12']);
  assert.equal(rules.streak(before, done, {}, '2026-10-13'), 4);
  // Made daily on Tue 13: replayed against every day, the run would be 1.
  const daily = { ...before, days: '' };
  assert.equal(rules.streak(daily, done, {}, '2026-10-13'), 1);
  // Kept: the run up to Mon 12 stands, and the new days count on from Tue 13.
  const base = rules.streakBefore(before, done, {}, '2026-10-13');
  assert.equal(base, 4);
  const edited = { ...daily, streak_base: base, streak_base_date: '2026-10-13' };
  assert.equal(rules.streak(edited, done, {}, '2026-10-13'), 4, 'today still open');
  done.add('9|2026-10-13');
  assert.equal(rules.streak(edited, done, {}, '2026-10-13'), 5);
  assert.equal(rules.streak(edited, done, {}, '2026-10-15'), 0, 'Wed 14 missed under the new days');
  // Edited again the same day: the run kept is the same.
  assert.equal(rules.streakBefore(edited, done, {}, '2026-10-13'), 4);
  // Weekdays to calendar events: the run carries over to the event days.
  const toCalendar = { trigger: 'calendar', streak_base: 4, streak_base_date: '2026-10-13' };
  const pinned = { '2026-10-15': { scheduleId: 20 } };
  assert.equal(rules.streak(toCalendar, new Set(['20|2026-10-15']), pinned, '2026-10-15'), 5);
});

test('milestones: every Nth day in a row, paid once per run length', () => {
  const routine = { milestone_every: 5, milestone_clams: 3, last_award_streak: 0 };
  assert.equal(rules.milestoneDue(routine, 4), false);
  assert.equal(rules.milestoneDue(routine, 5), true);
  assert.equal(rules.milestoneDue({ ...routine, last_award_streak: 5 }, 5), false);
  assert.equal(rules.milestoneDue({ ...routine, last_award_streak: 5 }, 10), true);
  assert.equal(rules.milestoneDue({ ...routine, last_award_streak: 10 }, 5), false, 'reset first when a new run starts');
  assert.equal(rules.milestoneDue({ ...routine, milestone_clams: 0 }, 5), false);
});

test('on time: finished by the end time, in the household time zone', () => {
  const routine = { end_time: '08:00' };
  assert.equal(rules.onTime(routine, '2026-10-13 11:55:00', TZ), true);  // 07:55 New York, as SQLite stores it
  assert.equal(rules.onTime(routine, '2026-10-13T12:05:00Z', TZ), false); // 08:05
  assert.equal(rules.onTime({ end_time: null }, '2026-10-13 11:55:00', TZ), null);
  assert.equal(rules.onTime(routine, null, TZ), null);
});

test('a routine from the Admin Panel is checked and tidied', () => {
  const ctx = { stepIds: new Set([1, 2, 3]), userIds: new Set([7]) };
  const { value } = rules.validateRoutine({
    name: ' Morning ', icon: '⏰', user_id: '7', trigger: 'days', days: [1, 3, 5],
    steps: [3, 1], start_time: '07:00', end_time: '07:45', milestone_every: 5, milestone_clams: 2,
  }, ctx);
  assert.equal(value.name, 'Morning');
  assert.deepEqual(value.steps, [3, 1]);
  assert.equal(value.match_text, null);
  assert.equal(value.whole_word, 1);
  const calendar = rules.validateRoutine({ name: 'Soccer', user_id: 7, trigger: 'calendar', match_text: 'Soccer', whole_word: false, lead_minutes: 30, steps: [] }, ctx).value;
  assert.deepEqual([calendar.trigger, calendar.match_text, calendar.whole_word, calendar.lead_minutes, calendar.days], ['calendar', 'Soccer', 0, 30, []]);

  const bad = rules.validateRoutine({ name: '', user_id: 8, trigger: 'calendar', steps: [4, 4], start_time: '7am', lead_minutes: -1 }, ctx);
  assert.ok(bad.errors.length >= 5, bad.errors.join(' | '));
});
