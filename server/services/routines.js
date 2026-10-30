// Routines: the rules, without the database (so they can be tested alone).
//
// A routine is a set of steps a child ticks off, on chosen weekdays or on the
// days of matching calendar events. It owns one ordinary chore and its
// schedules; ticking the last step completes that chore. Ported from the
// Routines plugin, whose behaviour this keeps.

const choreExpiry = require('../utils/choreExpiry');

const LOOKAHEAD_DAYS = 14;       // calendar routines are scheduled this far ahead
const HIDE_AFTER_DAYS = 2;       // past event days are hidden (the nightly missed-chore job reads yesterday)
const DELETE_AFTER_DAYS = 120;   // and deleted once older than this
const PROGRESS_KEEP_DAYS = 45;   // ticked steps are kept this long
const MAX_STEPS = 30;
const MAX_NAME = 60;
const MAX_MATCH = 80;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// --- dates ------------------------------------------------------------------

function shiftDate(dateStr, delta) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const at = new Date(Date.UTC(y, m - 1, d));
    at.setUTCDate(at.getUTCDate() + delta);
    return at.toISOString().slice(0, 10);
}

function weekdayOf(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 'YYYY-MM-DD' of a moment in a time zone. */
function dateIn(tz, date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
}

/** 'HH:MM' of a moment in a time zone. */
function timeIn(tz, date) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(date);
}

/** "17:00" minus 30 minutes is "16:30"; never earlier than midnight. */
function minusMinutes(hhmm, minutes) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = Math.max(0, h * 60 + m - (minutes || 0));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// --- schedules --------------------------------------------------------------

/** Weekdays (0 = Sunday) as a chore crontab; none or all seven is every day. */
function crontabForDays(days) {
    if (!Array.isArray(days) || days.length === 0 || days.length === 7) return '0 0 * * *';
    return `0 0 * * ${[...days].sort((a, b) => a - b).join(',')}`;
}

/** Fires on that day only (and the same day in later years, which is why past days are hidden). */
function crontabForDate(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    return `0 0 ${d} ${m} *`;
}

/** "0 0 * * 1,3,5" -> [1, 3, 5]; "0 0 * * *" -> every day; anything else null. */
function daysFromCrontab(cron) {
    const match = /^0 0 \* \* (\*|[0-6](,[0-6])*)$/.exec(cron || '');
    if (!match) return null;
    if (match[1] === '*') return [0, 1, 2, 3, 4, 5, 6];
    return match[1].split(',').map(Number);
}

/** "0 0 14 10 *" -> the 14 October nearest `today` (a pinned day carries no year). */
function dateFromCrontab(cron, today) {
    const match = /^0 0 (\d{1,2}) (\d{1,2}) \*$/.exec(cron || '');
    if (!match) return null;
    const [day, month] = [Number(match[1]), Number(match[2])];
    const [ty, tm, td] = today.split('-').map(Number);
    let best = null;
    for (const y of [ty - 1, ty, ty + 1]) {
        const gap = Math.abs(Date.UTC(y, month - 1, day) - Date.UTC(ty, tm - 1, td));
        if (!best || gap < best.gap) best = { date: `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, gap };
    }
    return best.date;
}

function parseDays(text) {
    if (Array.isArray(text)) return text;
    return String(text || '').split(',').filter((part) => part !== '').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

// --- calendar ---------------------------------------------------------------

/**
 * Whole-word by default, so "France" matches "France practice" but not
 * "Francesca's party". Letters and digits in any script count as a word.
 */
function titleMatches(routine, title) {
    const text = String(title || '');
    const needle = String(routine.match_text || '').trim();
    if (!needle) return false;
    if (!routine.whole_word) return text.toLowerCase().includes(needle.toLowerCase());
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

/**
 * The days in the next LOOKAHEAD_DAYS with a matching event, as
 * date -> due time ('' for an all-day event, which then uses the routine's own
 * start time). The earliest matching event decides a day's time; the routine's
 * lead minutes bring it forward.
 */
function matchingDays(routine, events, today, tz) {
    const last = shiftDate(today, LOOKAHEAD_DAYS);
    const sources = Array.isArray(routine.calendar_source_ids) ? routine.calendar_source_ids : [];
    const days = {};
    for (const event of events || []) {
        if (!titleMatches(routine, event.title)) continue;
        if (sources.length && !sources.includes(event.source_id)) continue;
        const start = new Date(event.start);
        if (Number.isNaN(start.getTime())) continue;
        // All-day events are cached at the household's local midnight.
        const date = dateIn(tz, start);
        if (date < today || date > last) continue;
        const time = event.all_day ? '' : minusMinutes(timeIn(tz, start), routine.lead_minutes);
        if (!(date in days) || (time && (!days[date] || time < days[date]))) days[date] = time;
    }
    return days;
}

/**
 * What it takes to make a calendar routine's pinned schedules match the
 * calendar: one for each matching day ahead, none for a day whose event went
 * away, past days hidden and eventually deleted. Pure: it returns the plan.
 *
 * pinned:    { date: { scheduleId, dueTime } }  what the routine has now
 * schedules: { id: { id, due_time, visible } }  those schedules as they are
 * wanted:    { date: time }                     from matchingDays ({} when the routine is no longer a calendar one)
 * completed: (scheduleId, date) => boolean
 */
function planCalendarSync({ routine, pinned, schedules, wanted, today, completed }) {
    const plan = { create: [], retime: [], remove: [], hide: [], forget: [] };
    for (const [date, time] of Object.entries(wanted)) {
        const due = time || routine.start_time || null;
        const entry = pinned[date];
        if (entry && schedules[entry.scheduleId]) {
            if ((schedules[entry.scheduleId].due_time || null) !== due) plan.retime.push({ date, scheduleId: entry.scheduleId, dueTime: due });
            continue;
        }
        if (entry) plan.forget.push(date);
        plan.create.push({ date, dueTime: due });
    }
    for (const [date, entry] of Object.entries(pinned)) {
        const row = schedules[entry.scheduleId];
        if (!row) {
            // Deleted elsewhere: forget it, unless the loop above remade it.
            if (!(date in wanted)) plan.forget.push(date);
            continue;
        }
        if (date >= today) {
            if (date in wanted) continue;
            // The event moved or was cancelled. Today's stays if it has been
            // done, so the completion keeps its schedule.
            if (date === today && completed(entry.scheduleId, date)) continue;
            plan.remove.push({ date, scheduleId: entry.scheduleId });
        } else if (date < shiftDate(today, -DELETE_AFTER_DAYS)) {
            plan.remove.push({ date, scheduleId: entry.scheduleId });
        } else if (date < shiftDate(today, -HIDE_AFTER_DAYS) && row.visible) {
            plan.hide.push({ date, scheduleId: entry.scheduleId });
        }
    }
    return plan;
}

// --- streaks and rewards ----------------------------------------------------

/**
 * Days in a row, back from today, on which the routine was scheduled and
 * done; today counts once done, and doesn't break the run while still open.
 *
 * completions: Set of 'scheduleId|date' completion keys
 * pinned:      { date: { scheduleId } } for a calendar routine
 * isVacation:  date => true on the household's vacation days. They're
 *              neutral, as for missed chores and Chore Metrics: done, one
 *              counts; not done, it neither extends nor breaks the run.
 */
function streak(routine, completions, pinned, today, { isVacation = () => false, late = new Set() } = {}) {
    const scheduleId = routine.trigger === 'calendar' ? pinned?.[today]?.scheduleId : routine.schedule_id;
    // Finished late today: the run is over, not waiting on today.
    if (scheduleId && late.has(`${scheduleId}|${today}`)) return 0;
    const doneToday = Boolean(scheduleId) && completions.has(`${scheduleId}|${today}`);
    return runThrough(routine, completions, pinned, doneToday ? today : shiftDate(today, -1), isVacation);
}

/**
 * The run that ended the day before `date`, every day of it over: what an
 * edit to when the routine runs keeps (`streak_base`), so a child's run
 * isn't rewritten by days they couldn't have known about.
 */
function streakBefore(routine, completions, pinned, date, { isVacation = () => false } = {}) {
    return runThrough(routine, completions, pinned, shiftDate(date, -1), isVacation);
}

// Days in a row up to and including `last`. Before `streak_base_date` (the
// day when the routine runs last changed) the run kept then, `streak_base`,
// takes over.
function runThrough(routine, completions, pinned, last, isVacation) {
    const done = (scheduleId, date) => completions.has(`${scheduleId}|${date}`);
    const baseDate = routine.streak_base_date || null;
    const base = Number(routine.streak_base) || 0;
    let run = 0;
    if (routine.trigger === 'calendar') {
        const eventDays = Object.keys(pinned || {}).filter((d) => d <= last).sort().reverse();
        for (const date of eventDays) {
            if (baseDate && date < baseDate) return run + base;
            if (done(pinned[date].scheduleId, date)) run += 1;
            else if (!isVacation(date)) return run;
        }
        return baseDate ? run + base : run;
    }
    const days = parseDays(routine.days);
    const scheduled = days.length ? days : [0, 1, 2, 3, 4, 5, 6];
    let cursor = last;
    for (let guard = 0; guard < 400; guard += 1) {
        if (baseDate && cursor < baseDate) return run + base;
        if (scheduled.includes(weekdayOf(cursor))) {
            if (done(routine.schedule_id, cursor)) run += 1;
            else if (!isVacation(cursor)) return run;
        }
        cursor = shiftDate(cursor, -1);
    }
    return run;
}

/** A milestone reached and not yet paid: every Nth day in a row, once per run length. */
function milestoneDue(routine, run) {
    const every = Number(routine.milestone_every) || 0;
    const clams = Number(routine.milestone_clams) || 0;
    if (!every || !clams || !run || run % every !== 0) return false;
    // `last_award_streak` is the run length last paid; a shorter run now is a
    // new run, which earns the same milestones again.
    return run > (Number(routine.last_award_streak) || 0);
}

/** Finished by its end time? null when it has none or isn't finished. */
// With `date`, the day the routine was for: finished on a later day is late,
// whatever the clock said (a parent ticking yesterday's at 06:00).
function onTime(routine, finishedAt, tz, date = null) {
    if (!routine.end_time || !finishedAt) return null;
    const at = new Date(String(finishedAt).includes('T') ? finishedAt : `${String(finishedAt).replace(' ', 'T')}Z`);
    if (Number.isNaN(at.getTime())) return null;
    if (date) return `${dateIn(tz, at)} ${timeIn(tz, at)}` <= `${date} ${routine.end_time}`;
    return timeIn(tz, at) <= routine.end_time;
}

// --- input ------------------------------------------------------------------

/**
 * A routine as the Admin Panel sends it, checked and tidied: { value } or
 * { errors }. `stepIds` and `userIds` are the ids that exist.
 */
function validateRoutine(body, { stepIds, userIds }) {
    const errors = [];
    const input = body && typeof body === 'object' ? body : {};
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) errors.push('Give the routine a name.');
    if (name.length > MAX_NAME) errors.push(`The name can be at most ${MAX_NAME} characters.`);
    const userId = Number(input.user_id);
    if (!userIds.has(userId)) errors.push('Choose who the routine is for.');
    const trigger = input.trigger === 'calendar' ? 'calendar' : 'days';
    const days = parseDays(input.days);
    const match = typeof input.match_text === 'string' ? input.match_text.trim() : '';
    if (trigger === 'calendar' && !match) errors.push('Say which calendar events it follows.');
    if (match.length > MAX_MATCH) errors.push(`The event words can be at most ${MAX_MATCH} characters.`);
    const steps = Array.isArray(input.steps) ? input.steps.map(Number) : [];
    if (steps.length > MAX_STEPS) errors.push(`A routine can have at most ${MAX_STEPS} steps.`);
    if (steps.some((id) => !stepIds.has(id))) errors.push('One of the steps no longer exists.');
    if (new Set(steps).size !== steps.length) errors.push('A step can be in a routine once.');
    for (const key of ['start_time', 'end_time']) {
        if (input[key] && !TIME.test(input[key])) errors.push(`${key === 'start_time' ? 'Start' : 'End'} time must be like 07:30.`);
    }
    const whole = (key, min, max) => {
        const n = input[key] === undefined || input[key] === '' || input[key] === null ? 0 : Number(input[key]);
        if (!Number.isInteger(n) || n < min || n > max) errors.push(`${key} must be a whole number from ${min} to ${max}.`);
        return n;
    };
    const lead = whole('lead_minutes', 0, 720);
    // Expires (issue #279): from the end time, so it needs one; and a weekday
    // routine's chore is due at its start time, so that too.
    const expire = choreExpiry.normalizeExpireMinutes(input.expire_minutes);
    if (!expire.valid) errors.push(`expire_minutes must be one of: ${choreExpiry.EXPIRE_OPTIONS.join(', ')}.`);
    else if (expire.value !== null && (!input.end_time || (trigger === 'days' && !input.start_time))) {
        errors.push(trigger === 'days' ? 'Set a start and an end time for the routine to expire.' : 'Set an end time for the routine to expire.');
    }
    const every = whole('milestone_every', 0, 365);
    const clams = whole('milestone_clams', 0, 999);
    const sources = Array.isArray(input.calendar_source_ids)
        ? input.calendar_source_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
        : [];
    const icon = typeof input.icon === 'string' && input.icon.trim() ? input.icon.trim().slice(0, 16) : null;
    if (errors.length) return { errors };
    return {
        value: {
            name, icon, user_id: userId, trigger,
            days: trigger === 'days' ? days : [],
            match_text: trigger === 'calendar' ? match : null,
            whole_word: input.whole_word === false || input.whole_word === 0 ? 0 : 1,
            calendar_source_ids: trigger === 'calendar' ? sources : [],
            lead_minutes: trigger === 'calendar' ? lead : 0,
            start_time: input.start_time || null,
            end_time: input.end_time || null,
            steps,
            milestone_every: every,
            milestone_clams: clams,
            expire_minutes: expire.value,
        },
    };
}

/**
 * The expire_minutes a routine's schedule gets: due at `dueTime` (its start,
 * or a calendar day's), expiring the buffer after the routine's end time.
 * null when the routine doesn't expire.
 */
function scheduleExpireMinutes(routine, dueTime) {
    const buffer = routine.expire_minutes;
    if (buffer === null || buffer === undefined || !routine.end_time || !dueTime) return null;
    const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    return Math.max(0, minutes(routine.end_time) - minutes(dueTime)) + Number(buffer);
}

module.exports = {
    LOOKAHEAD_DAYS,
    HIDE_AFTER_DAYS,
    DELETE_AFTER_DAYS,
    PROGRESS_KEEP_DAYS,
    DATE,
    shiftDate,
    weekdayOf,
    dateIn,
    timeIn,
    minusMinutes,
    crontabForDays,
    crontabForDate,
    daysFromCrontab,
    dateFromCrontab,
    parseDays,
    titleMatches,
    matchingDays,
    planCalendarSync,
    streak,
    streakBefore,
    milestoneDue,
    onTime,
    validateRoutine,
    scheduleExpireMinutes,
};
