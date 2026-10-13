// Routines: routes, the calendar sync, and the link to chores.
//
// A routine owns one ordinary chore (clam_value 0) and its schedules: one
// weekday schedule, or one pinned to each matching calendar event's day. The
// steps, their progress and the streak rewards live in the routine tables
// (schema29). The chore code knows nothing of routines: completion goes
// through the functions the chore routes use, and the chore events tell this
// module when a routine's chore was ticked from its card.
//
// The one rule kept here: a routine's chore is complete exactly when all its
// steps are ticked.

const rules = require('../services/routines');

const CALENDAR_SYNC_MS = 10 * 60 * 1000;
const MAX_BULK = 100;

function registerRoutineRoutes(fastify, deps) {
  const {
    db, pluginEvents, completeChoreSchedule, uncompleteChoreSchedule,
    timezone, today, calendarEvents = () => [], isVacation = () => false,
  } = deps;

  // (scheduleId|date) pairs this module is itself uncompleting, so the chore
  // event that follows doesn't clear the steps still ticked.
  const unticking = new Set();

  // --- reading ---------------------------------------------------------------

  const steps = () => db.prepare('SELECT id, label, icon, sort_order FROM routine_steps ORDER BY sort_order, id').all();

  function hydrate(row) {
    if (!row) return null;
    let sources = [];
    try { sources = JSON.parse(row.calendar_source_ids || '[]'); } catch { sources = []; }
    return {
      ...row,
      days: rules.parseDays(row.days),
      calendar_source_ids: Array.isArray(sources) ? sources : [],
      steps: db.prepare('SELECT step_id FROM routine_step_links WHERE routine_id = ? ORDER BY position').all(row.id).map((r) => r.step_id),
    };
  }

  const routine = (id) => hydrate(db.prepare('SELECT * FROM routines WHERE id = ?').get(id));
  const allRoutines = () => db.prepare('SELECT * FROM routines ORDER BY name COLLATE NOCASE, id').all().map(hydrate);

  // date -> { scheduleId, dueTime } for a calendar routine's pinned days.
  function pinnedOf(routineId) {
    const out = {};
    for (const row of db.prepare('SELECT date, schedule_id, due_time FROM routine_dates WHERE routine_id = ?').all(routineId)) {
      out[row.date] = { scheduleId: row.schedule_id, dueTime: row.due_time };
    }
    return out;
  }

  // The schedule a routine is done against on a date, or null when it isn't on.
  function scheduleOn(r, date, pinned = pinnedOf(r.id)) {
    if (r.trigger === 'calendar') return pinned[date]?.scheduleId || null;
    if (!r.schedule_id) return null;
    return r.days.length === 0 || r.days.includes(rules.weekdayOf(date)) ? r.schedule_id : null;
  }

  // The routine a schedule belongs to (its weekday one or a pinned day's).
  function routineForSchedule(scheduleId) {
    const row = db.prepare(`
      SELECT r.* FROM routines r WHERE r.schedule_id = ?
      UNION SELECT r.* FROM routines r JOIN routine_dates d ON d.routine_id = r.id WHERE d.schedule_id = ?
    `).get(scheduleId, scheduleId);
    return hydrate(row);
  }

  const completionOf = (scheduleId, date) => db.prepare(
    "SELECT created_at FROM chore_history WHERE chore_schedule_id = ? AND date = ? AND kind = 'completion'",
  ).get(scheduleId, date);

  // 'scheduleId|date' for every completion of the routine's schedules.
  function completionsOf(r, pinned) {
    const ids = [r.schedule_id, ...Object.values(pinned).map((p) => p.scheduleId)].filter(Boolean);
    if (!ids.length) return new Set();
    const since = rules.shiftDate(today(), -400);
    const rows = db.prepare(`
      SELECT chore_schedule_id, date FROM chore_history
      WHERE kind = 'completion' AND date >= ? AND chore_schedule_id IN (${ids.map(() => '?').join(',')})
    `).all(since, ...ids);
    return new Set(rows.map((row) => `${row.chore_schedule_id}|${row.date}`));
  }

  // What the chore widget needs to draw a routine's card for a date.
  function dayOf(r, date) {
    const pinned = pinnedOf(r.id);
    const scheduleId = scheduleOn(r, date, pinned);
    if (!scheduleId) return null;
    const library = new Map(steps().map((s) => [s.id, s]));
    const ticked = new Set(db.prepare('SELECT step_id FROM routine_progress WHERE routine_id = ? AND date = ?').all(r.id, date).map((row) => row.step_id));
    const list = r.steps.map((id) => library.get(id)).filter(Boolean);
    const completion = completionOf(scheduleId, date);
    return {
      routineId: r.id,
      scheduleId,
      name: r.name,
      steps: list.map((s) => ({ id: s.id, label: s.label, icon: s.icon || '' })),
      done: list.filter((s) => ticked.has(s.id)).map((s) => s.id),
      completed: Boolean(completion),
      streak: rules.streak(r, completionsOf(r, pinned), pinned, date, { isVacation }),
      startTime: r.trigger === 'calendar' ? (pinned[date]?.dueTime || r.start_time || null) : r.start_time,
      endTime: r.end_time || null,
      onTime: completion ? rules.onTime(r, completion.created_at, timezone()) : null,
    };
  }

  // --- the link to chores ----------------------------------------------------

  // Every Nth day in a row pays the routine's clams, once per run length.
  // Written as kind 'streak', so History and Chore Metrics can tell it from a
  // parent's correction.
  function payMilestone(r, date) {
    const pinned = pinnedOf(r.id);
    const run = rules.streak(r, completionsOf(r, pinned), pinned, date, { isVacation });
    if (run < r.last_award_streak) {
      // A new run: its milestones are earned again.
      db.prepare('UPDATE routines SET last_award_streak = 0 WHERE id = ?').run(r.id);
      r = { ...r, last_award_streak: 0 };
    }
    if (!rules.milestoneDue(r, run)) return;
    db.prepare("INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value, title, kind) VALUES (?, NULL, ?, ?, ?, 'streak')")
      .run(r.user_id, date, r.milestone_clams, `${r.name}: ${run} in a row`);
    db.prepare('UPDATE routines SET last_award_streak = ? WHERE id = ?').run(run, r.id);
    const total = db.prepare('SELECT COALESCE(SUM(clam_value), 0) AS total FROM chore_history WHERE user_id = ?').get(r.user_id).total;
    pluginEvents.emit('clam.deposited', { userId: r.user_id, amount: r.milestone_clams, newTotal: total });
  }

  // A routine's chore ticked or unticked on its card: its steps follow, so
  // the card and the steps always agree. A milestone is paid however the
  // routine was finished.
  const unsubscribe = pluginEvents.subscribe(({ event, payload }) => {
    if (event !== 'chore.completed' && event !== 'chore.uncompleted') return;
    const r = routineForSchedule(payload.scheduleId);
    if (!r) return;
    if (event === 'chore.completed') {
      const insert = db.prepare('INSERT OR IGNORE INTO routine_progress (routine_id, date, step_id) VALUES (?, ?, ?)');
      for (const stepId of r.steps) insert.run(r.id, payload.date, stepId);
      payMilestone(r, payload.date);
    } else if (!unticking.has(`${payload.scheduleId}|${payload.date}`)) {
      db.prepare('DELETE FROM routine_progress WHERE routine_id = ? AND date = ?').run(r.id, payload.date);
    }
  });

  // --- the chore a routine owns ----------------------------------------------

  function newSchedule(choreId, userId, crontab, dueTime) {
    // Not transferable: handing it to another child would part it from its routine.
    return db.prepare(
      "INSERT INTO chore_schedules (chore_id, user_id, crontab, visible, duration, due_time, transferable) VALUES (?, ?, ?, 1, 'day-of', ?, 0)",
    ).run(choreId, userId, crontab, dueTime || null).lastInsertRowid;
  }

  function writeSteps(routineId, stepIds) {
    db.prepare('DELETE FROM routine_step_links WHERE routine_id = ?').run(routineId);
    const insert = db.prepare('INSERT INTO routine_step_links (routine_id, position, step_id) VALUES (?, ?, ?)');
    stepIds.forEach((stepId, position) => insert.run(routineId, position, stepId));
  }

  function writeRoutine(id, v) {
    db.prepare(`
      UPDATE routines SET name = ?, icon = ?, user_id = ?, trigger = ?, days = ?, match_text = ?, whole_word = ?,
        calendar_source_ids = ?, lead_minutes = ?, start_time = ?, end_time = ?, milestone_every = ?, milestone_clams = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(v.name, v.icon, v.user_id, v.trigger, v.days.join(','), v.match_text, v.whole_word,
      JSON.stringify(v.calendar_source_ids), v.lead_minutes, v.start_time, v.end_time, v.milestone_every, v.milestone_clams, id);
    writeSteps(id, v.steps);
  }

  function createRoutine(v) {
    return db.transaction(() => {
      const choreId = db.prepare('INSERT INTO chores (title, description, clam_value, icon) VALUES (?, NULL, 0, ?)').run(v.name, v.icon).lastInsertRowid;
      const scheduleId = v.trigger === 'days' ? newSchedule(choreId, v.user_id, rules.crontabForDays(v.days), v.start_time) : null;
      const id = db.prepare('INSERT INTO routines (name, user_id, chore_id, schedule_id) VALUES (?, ?, ?, ?)')
        .run(v.name, v.user_id, choreId, scheduleId).lastInsertRowid;
      writeRoutine(id, v);
      return id;
    })();
  }

  // Changed in place: the chore and its schedules are updated, not replaced,
  // so the history and the streak carry on. Switching between weekdays and
  // calendar events retires one kind of schedule and starts the other.
  function updateRoutine(r, v) {
    db.transaction(() => {
      keepRun(r, v);
      db.prepare('UPDATE chores SET title = ?, icon = ? WHERE id = ?').run(v.name, v.icon, r.chore_id);
      const wasCalendar = r.trigger === 'calendar';
      const toCalendar = v.trigger === 'calendar';
      if (!toCalendar) {
        const live = r.schedule_id && db.prepare('SELECT id FROM chore_schedules WHERE id = ?').get(r.schedule_id);
        if (live && !wasCalendar) {
          db.prepare('UPDATE chore_schedules SET crontab = ?, due_time = ?, user_id = ?, visible = 1 WHERE id = ?')
            .run(rules.crontabForDays(v.days), v.start_time, v.user_id, r.schedule_id);
        } else {
          const scheduleId = newSchedule(r.chore_id, v.user_id, rules.crontabForDays(v.days), v.start_time);
          db.prepare('UPDATE routines SET schedule_id = ? WHERE id = ?').run(scheduleId, r.id);
        }
      } else {
        if (!wasCalendar && r.schedule_id) {
          // The weekday schedule is retired, not deleted: its history keeps it.
          db.prepare('UPDATE chore_schedules SET visible = 0 WHERE id = ?').run(r.schedule_id);
          db.prepare('UPDATE routines SET schedule_id = NULL WHERE id = ?').run(r.id);
        }
        if (v.user_id !== r.user_id) {
          // The days still to come move to the new person.
          db.prepare(`
            UPDATE chore_schedules SET user_id = ?
            WHERE id IN (SELECT schedule_id FROM routine_dates WHERE routine_id = ? AND date >= ?)
          `).run(v.user_id, r.id, today());
        }
      }
      writeRoutine(r.id, v);
    })();
  }

  // The streak is counted against when the routine runs, so changing that
  // would recount days already behind the child: Mon–Fri made daily would
  // break a run with weekends nobody asked for. The run up to yesterday is
  // kept as it stood, and the new days count on from today. A routine handed
  // to someone else starts a run of their own.
  function keepRun(r, v) {
    const when = (x) => JSON.stringify([x.trigger, [...x.days].map(Number).sort(), x.match_text || '', Boolean(x.whole_word),
      [...(x.calendar_source_ids || [])].map(Number).sort()]);
    const newPerson = Number(v.user_id) !== Number(r.user_id);
    if (!newPerson && when(r) === when(v)) return;
    const day = today();
    const pinned = pinnedOf(r.id);
    const base = newPerson ? 0 : rules.streakBefore(r, completionsOf(r, pinned), pinned, day, { isVacation });
    db.prepare('UPDATE routines SET streak_base = ?, streak_base_date = ? WHERE id = ?').run(base, day, r.id);
    if (newPerson) db.prepare('UPDATE routines SET last_award_streak = 0 WHERE id = ?').run(r.id);
  }

  // --- the calendar ----------------------------------------------------------

  // Make one routine's pinned days match the calendar (or, for one no longer
  // following events, tidy away the days it had). Safe to run repeatedly.
  function syncRoutine(r, events) {
    const day = today();
    const pinned = pinnedOf(r.id);
    if (r.trigger !== 'calendar' && !Object.keys(pinned).length) return;
    // Imported without its event words, it would match nothing and lose its
    // days ahead: it waits for an edit.
    if (r.trigger === 'calendar' && !String(r.match_text || '').trim()) return;
    const ids = Object.values(pinned).map((p) => p.scheduleId);
    const schedules = {};
    if (ids.length) {
      for (const row of db.prepare(`SELECT id, due_time, visible FROM chore_schedules WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)) {
        schedules[row.id] = row;
      }
    }
    const wanted = r.trigger === 'calendar' ? rules.matchingDays(r, events, day, timezone()) : {};
    const plan = rules.planCalendarSync({
      routine: r, pinned, schedules, wanted, today: day,
      completed: (scheduleId, date) => Boolean(completionOf(scheduleId, date)),
    });
    db.transaction(() => {
      for (const date of plan.forget) db.prepare('DELETE FROM routine_dates WHERE routine_id = ? AND date = ?').run(r.id, date);
      for (const { date, dueTime } of plan.create) {
        const scheduleId = newSchedule(r.chore_id, r.user_id, rules.crontabForDate(date), dueTime);
        db.prepare('INSERT OR REPLACE INTO routine_dates (routine_id, date, schedule_id, due_time) VALUES (?, ?, ?, ?)').run(r.id, date, scheduleId, dueTime);
      }
      for (const { date, scheduleId, dueTime } of plan.retime) {
        db.prepare('UPDATE chore_schedules SET due_time = ? WHERE id = ?').run(dueTime, scheduleId);
        db.prepare('UPDATE routine_dates SET due_time = ? WHERE routine_id = ? AND date = ?').run(dueTime, r.id, date);
      }
      // Deleting the schedule takes its routine_dates row with it.
      for (const { scheduleId } of plan.remove) db.prepare('DELETE FROM chore_schedules WHERE id = ?').run(scheduleId);
      for (const { scheduleId } of plan.hide) db.prepare('UPDATE chore_schedules SET visible = 0 WHERE id = ?').run(scheduleId);
    })();
  }

  function upcomingEvents() {
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const to = new Date(Date.now() + (rules.LOOKAHEAD_DAYS + 2) * 24 * 3600 * 1000).toISOString();
    try {
      return calendarEvents(from, to) || [];
    } catch (error) {
      console.error('Routines: could not read the calendar:', error.message);
      return null;
    }
  }

  function syncCalendarRoutines() {
    const events = upcomingEvents();
    if (!events) return;
    for (const r of allRoutines()) {
      try {
        syncRoutine(r, events);
      } catch (error) {
        console.error(`Routines: could not match "${r.name}" to the calendar:`, error.message);
      }
    }
  }

  // --- routes: the step library ----------------------------------------------

  const cleanStep = (body) => {
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    if (!label) return { error: 'Give the step a name.' };
    if (label.length > 60) return { error: 'A step name can be at most 60 characters.' };
    const icon = typeof body?.icon === 'string' && body.icon.trim() ? body.icon.trim().slice(0, 16) : null;
    return { label, icon };
  };

  fastify.get('/api/routine-steps', async () => ({ steps: steps() }));

  fastify.post('/api/routine-steps', async (request, reply) => {
    const step = cleanStep(request.body);
    if (step.error) return reply.status(400).send({ error: step.error });
    const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM routine_steps').get().next;
    const id = db.prepare('INSERT INTO routine_steps (label, icon, sort_order) VALUES (?, ?, ?)').run(step.label, step.icon, order).lastInsertRowid;
    return db.prepare('SELECT id, label, icon, sort_order FROM routine_steps WHERE id = ?').get(id);
  });

  fastify.patch('/api/routine-steps/:id', async (request, reply) => {
    const step = cleanStep(request.body);
    if (step.error) return reply.status(400).send({ error: step.error });
    const result = db.prepare('UPDATE routine_steps SET label = ?, icon = ? WHERE id = ?').run(step.label, step.icon, request.params.id);
    if (!result.changes) return reply.status(404).send({ error: 'No such step.' });
    return db.prepare('SELECT id, label, icon, sort_order FROM routine_steps WHERE id = ?').get(request.params.id);
  });

  // A step in use is kept: deleting it would quietly change those routines.
  fastify.delete('/api/routine-steps/:id', async (request, reply) => {
    const usedBy = db.prepare(`
      SELECT DISTINCT r.name FROM routine_step_links l JOIN routines r ON r.id = l.routine_id WHERE l.step_id = ? ORDER BY r.name
    `).all(request.params.id).map((row) => row.name);
    if (usedBy.length) return reply.status(409).send({ error: `In use by ${usedBy.join(', ')}.`, usedBy });
    const result = db.prepare('DELETE FROM routine_steps WHERE id = ?').run(request.params.id);
    if (!result.changes) return reply.status(404).send({ error: 'No such step.' });
    return { success: true };
  });

  // --- routes: routines ------------------------------------------------------

  const context = () => ({
    stepIds: new Set(steps().map((s) => s.id)),
    userIds: new Set(db.prepare('SELECT id FROM users WHERE id <> 0').all().map((u) => u.id)),
  });

  const imported = () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'ROUTINES_IMPORTED'").get();
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return null; }
  };

  fastify.get('/api/routines', async () => ({ routines: allRoutines(), steps: steps(), imported: imported() }));

  // One routine, or with `user_ids` the same routine for several people:
  // one each, as each needs their own ticks and streak (a routine owns one
  // chore for one person). All are made or none.
  fastify.post('/api/routines', async (request, reply) => {
    const body = request.body || {};
    const many = Array.isArray(body.user_ids);
    const userIds = many ? [...new Set(body.user_ids.map(Number))] : [body.user_id];
    if (many && (userIds.length === 0 || userIds.length > MAX_BULK)) {
      return reply.status(400).send({ error: `Choose 1 to ${MAX_BULK} people.` });
    }
    const ctx = context();
    const values = [];
    for (const userId of userIds) {
      const checked = rules.validateRoutine({ ...body, user_id: userId }, ctx);
      if (checked.errors) return reply.status(400).send({ error: checked.errors.join(' '), errors: checked.errors });
      values.push(checked.value);
    }
    const ids = db.transaction(() => values.map((value) => createRoutine(value)))();
    // Straight away, so today's list shows them if today has an event.
    const events = values[0].trigger === 'calendar' ? upcomingEvents() || [] : null;
    if (events) for (const id of ids) syncRoutine(routine(id), events);
    return many ? { routines: ids.map(routine) } : routine(ids[0]);
  });

  // Several routines at once, each with its chore, as one delete does.
  fastify.delete('/api/routines/bulk', async (request, reply) => {
    const { ids } = request.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK) {
      return reply.status(400).send({ error: `ids must list 1 to ${MAX_BULK} routine ids` });
    }
    const unique = [...new Set(ids.map(Number))];
    if (!unique.every((id) => Number.isInteger(id) && id > 0)) {
      return reply.status(400).send({ error: 'Every id must be a positive whole number' });
    }
    const deleted = db.transaction(() => unique.reduce((count, id) => {
      const r = db.prepare('SELECT chore_id FROM routines WHERE id = ?').get(id);
      if (!r) return count;
      db.prepare('DELETE FROM chores WHERE id = ?').run(r.chore_id);
      return count + 1;
    }, 0))();
    return { deleted };
  });

  fastify.patch('/api/routines/:id', async (request, reply) => {
    const r = routine(request.params.id);
    if (!r) return reply.status(404).send({ error: 'No such routine.' });
    const checked = rules.validateRoutine(request.body, context());
    if (checked.errors) return reply.status(400).send({ error: checked.errors.join(' '), errors: checked.errors });
    updateRoutine(r, checked.value);
    const after = routine(r.id);
    if (after.trigger === 'calendar' || r.trigger === 'calendar') syncRoutine(after, upcomingEvents() || []);
    return routine(r.id);
  });

  // Deleting a routine deletes its chore, and with it the schedules and the
  // routine's own rows. Completions stay in the ledger and clams earned stay
  // earned, as when a chore is deleted.
  fastify.delete('/api/routines/:id', async (request, reply) => {
    const r = routine(request.params.id);
    if (!r) return reply.status(404).send({ error: 'No such routine.' });
    db.prepare('DELETE FROM chores WHERE id = ?').run(r.chore_id);
    return { success: true };
  });

  // --- routes: ticking steps -------------------------------------------------

  const validDate = (date) => typeof date === 'string' && rules.DATE.test(date);

  // Today's routines, keyed by the schedule each is done against, for the
  // chore widget to draw inside those cards.
  fastify.get('/api/routines/today', async (request, reply) => {
    const date = request.query?.date || today();
    if (!validDate(date)) return reply.status(400).send({ error: 'date must be YYYY-MM-DD' });
    const out = {};
    for (const r of allRoutines()) {
      const day = dayOf(r, date);
      if (day) out[day.scheduleId] = day;
    }
    return { date, routines: out };
  });

  fastify.post('/api/routines/:id/steps/:stepId', async (request, reply) => {
    const r = routine(request.params.id);
    if (!r) return reply.status(404).send({ error: 'No such routine.' });
    const stepId = Number(request.params.stepId);
    if (!r.steps.includes(stepId)) return reply.status(404).send({ error: 'That step is not in this routine.' });
    const { date, done } = request.body || {};
    if (!validDate(date)) return reply.status(400).send({ error: 'date must be YYYY-MM-DD' });
    const scheduleId = scheduleOn(r, date);
    if (!scheduleId) return reply.status(400).send({ error: 'This routine is not on that day.' });

    if (done) db.prepare('INSERT OR IGNORE INTO routine_progress (routine_id, date, step_id) VALUES (?, ?, ?)').run(r.id, date, stepId);
    else db.prepare('DELETE FROM routine_progress WHERE routine_id = ? AND date = ? AND step_id = ?').run(r.id, date, stepId);

    const ticked = new Set(db.prepare('SELECT step_id FROM routine_progress WHERE routine_id = ? AND date = ?').all(r.id, date).map((row) => row.step_id));
    const allDone = r.steps.length > 0 && r.steps.every((id) => ticked.has(id));
    const completed = Boolean(completionOf(scheduleId, date));
    if (allDone && !completed) {
      const result = completeChoreSchedule({ chore_schedule_id: scheduleId, user_id: r.user_id, date });
      if (result.error && result.status !== 409) return reply.status(result.status).send({ error: result.error });
    } else if (!allDone && completed) {
      const key = `${scheduleId}|${date}`;
      unticking.add(key);
      try {
        const result = uncompleteChoreSchedule({ chore_schedule_id: scheduleId, user_id: r.user_id, date });
        if (result.error && result.status !== 404) return reply.status(result.status).send({ error: result.error });
      } finally {
        unticking.delete(key);
      }
    }
    return dayOf(routine(r.id), date);
  });

  // --- background --------------------------------------------------------------

  let timer = null;
  return {
    syncCalendarRoutines,
    // The nightly job: past event days hidden and deleted, old ticks pruned.
    nightly() {
      syncCalendarRoutines();
      db.prepare('DELETE FROM routine_progress WHERE date < ?').run(rules.shiftDate(today(), -rules.PROGRESS_KEEP_DAYS));
    },
    // Calendar routines follow the calendar while the server runs: no display
    // needs to be open (the plugin could only sync while one was).
    start() {
      if (timer) return;
      syncCalendarRoutines();
      timer = setInterval(syncCalendarRoutines, CALENDAR_SYNC_MS);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
      unsubscribe();
    },
  };
}

module.exports = { registerRoutineRoutes };
