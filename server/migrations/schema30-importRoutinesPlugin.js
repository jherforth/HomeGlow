const context = globalThis.__HOMEGLOW_SCHEMA_MIGRATION_CONTEXT;

if (!context || !context.db) {
    throw new Error('Schema migration context is missing for migration');
}

const { db, schemaIdKey, targetSchemaId } = context;
const rules = require('../services/routines');

// Routines move from the Routines plugin into the core (schema29). Once, on
// upgrade, this takes the plugin's routines over and the plugin's place on
// every display:
//
// - its steps, routines (on the SAME chores and schedules, so history and
//   streaks carry on), the last weeks of ticked steps, calendar days and
//   rewards paid, from the plugin's storage;
// - routine chores the plugin had made and then lost (deleted and
//   reinstalled), recognisable by description "Routine" and 0 clams, as it
//   recognised them itself: they come back without steps, as there;
// - on each display, the plugin's spot becomes the Chores widget, where a
//   routine's steps are now ticked (unless the tab already has one), with the
//   plugin's person as that widget's people filter;
// - the plugin itself is removed. Its storage stays for one release, should
//   anyone need to go back.
const ROUTINE_DESCRIPTION = 'Routine';

const json = (text, fallback) => {
    try {
        const value = JSON.parse(text);
        return value === null || value === undefined ? fallback : value;
    } catch {
        return fallback;
    }
};

function localToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function importRoutines() {
    const today = localToday();
    const store = {};
    for (const row of db.prepare("SELECT key, value_json FROM plugin_storage WHERE plugin_id = 'routines'").all()) {
        store[row.key] = json(row.value_json, null);
    }
    const plugin = db.prepare("SELECT id, filename FROM plugins WHERE plugin_id = 'routines'").get();
    const isOrphanChore = (chore) => chore.description === ROUTINE_DESCRIPTION && Number(chore.clam_value || 0) === 0;
    const routineChores = db.prepare('SELECT id, title, icon, description, clam_value FROM chores').all().filter(isOrphanChore);
    if (!Object.keys(store).length && !plugin && !routineChores.length) return null;

    const counts = { routines: 0, steps: 0, restored: 0, skipped: [], displays: 0 };
    const choreExists = db.prepare('SELECT id FROM chores WHERE id = ?');
    const scheduleRow = db.prepare('SELECT id, crontab, visible, user_id, due_time FROM chore_schedules WHERE id = ?');
    const userExists = db.prepare('SELECT id FROM users WHERE id = ? AND id <> 0');
    const newSchedule = db.prepare("INSERT INTO chore_schedules (chore_id, user_id, crontab, visible, duration, due_time, transferable) VALUES (?, ?, ?, 1, 'day-of', ?, 0)");
    const insertRoutine = db.prepare(`
        INSERT INTO routines (name, icon, user_id, chore_id, trigger, days, schedule_id, match_text, whole_word,
            calendar_source_ids, lead_minutes, start_time, end_time, milestone_every, milestone_clams, last_award_streak)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLink = db.prepare('INSERT INTO routine_step_links (routine_id, position, step_id) VALUES (?, ?, ?)');
    const insertProgress = db.prepare('INSERT OR IGNORE INTO routine_progress (routine_id, date, step_id) VALUES (?, ?, ?)');
    const insertDate = db.prepare('INSERT OR REPLACE INTO routine_dates (routine_id, date, schedule_id, due_time) VALUES (?, ?, ?, ?)');
    const tidyChore = (choreId) => {
        // No longer a "Routine" description: the card shows its steps instead.
        db.prepare('UPDATE chores SET description = NULL WHERE id = ? AND description = ?').run(choreId, ROUTINE_DESCRIPTION);
        db.prepare('UPDATE chore_schedules SET transferable = 0 WHERE chore_id = ?').run(choreId);
    };
    const time = (value) => (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null);

    // The step library, plugin ids -> new ids.
    const stepIds = new Map();
    (Array.isArray(store.library) ? store.library : []).forEach((step, index) => {
        const label = String(step?.label || '').trim().slice(0, 60);
        if (!label) return;
        const id = db.prepare('INSERT INTO routine_steps (label, icon, sort_order) VALUES (?, ?, ?)').run(label, step.icon || null, index + 1).lastInsertRowid;
        stepIds.set(step.id, id);
        counts.steps += 1;
    });

    const awards = store.awards && typeof store.awards === 'object' ? store.awards : {};
    const claimed = new Set();
    for (const r of Array.isArray(store.routines) ? store.routines : []) {
        const name = String(r?.name || '').trim().slice(0, 60) || 'Routine';
        if (!choreExists.get(r.choreId) || claimed.has(r.choreId)) { counts.skipped.push(name); continue; }
        if (!userExists.get(r.userId)) { counts.skipped.push(name); continue; }
        const calendar = r.trigger === 'calendar';
        const days = Array.isArray(r.days) ? r.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
        let scheduleId = null;
        if (!calendar) {
            scheduleId = r.scheduleId && scheduleRow.get(r.scheduleId) ? r.scheduleId : null;
            if (!scheduleId) scheduleId = newSchedule.run(r.choreId, r.userId, rules.crontabForDays(days), time(r.startTime)).lastInsertRowid;
        }
        const routineId = insertRoutine.run(
            name, r.icon || null, r.userId, r.choreId, calendar ? 'calendar' : 'days', calendar ? '' : days.join(','), scheduleId,
            calendar ? String(r.match || '').trim().slice(0, 80) || null : null, r.wholeWord === false ? 0 : 1,
            JSON.stringify(calendar && Array.isArray(r.sources) ? r.sources.filter(Number.isInteger) : []),
            calendar ? Math.max(0, Math.min(720, Number(r.lead) || 0)) : 0,
            time(r.startTime), time(r.endTime),
            Math.max(0, Math.min(365, Number(r.threshold) || 0)), Math.max(0, Math.min(999, Number(r.milestoneClams) || 0)),
            Number(awards[r.id]) || 0,
        ).lastInsertRowid;
        (Array.isArray(r.steps) ? r.steps : []).map((uid) => stepIds.get(uid)).filter(Boolean)
            .forEach((stepId, position) => insertLink.run(routineId, position, stepId));
        const keepFrom = rules.shiftDate(today, -rules.PROGRESS_KEEP_DAYS);
        for (const [date, day] of Object.entries(store[`progress:${r.id}`] || {})) {
            if (!rules.DATE.test(date) || date < keepFrom) continue;
            for (const uid of Array.isArray(day?.done) ? day.done : []) {
                const stepId = stepIds.get(uid);
                if (stepId) insertProgress.run(routineId, date, stepId);
            }
        }
        for (const [date, entry] of Object.entries(store[`dates:${r.id}`] || {})) {
            if (rules.DATE.test(date) && entry && scheduleRow.get(entry.id)) insertDate.run(routineId, date, entry.id, time(entry.time));
        }
        tidyChore(r.choreId);
        claimed.add(r.choreId);
        counts.routines += 1;
    }

    // Routine chores the plugin had lost: back as routines, without steps.
    for (const chore of routineChores) {
        if (claimed.has(chore.id)) continue;
        const schedules = db.prepare('SELECT id, crontab, visible, user_id, due_time FROM chore_schedules WHERE chore_id = ? ORDER BY id').all(chore.id);
        const weekly = schedules.find((s) => s.visible && rules.daysFromCrontab(s.crontab) && userExists.get(s.user_id));
        const pinned = schedules.filter((s) => rules.dateFromCrontab(s.crontab, today) && userExists.get(s.user_id));
        if (!weekly && !pinned.length) { counts.skipped.push(chore.title); continue; }
        const owner = weekly || pinned[pinned.length - 1];
        const days = weekly ? rules.daysFromCrontab(weekly.crontab) : [];
        const routineId = insertRoutine.run(
            String(chore.title || 'Routine').slice(0, 60), chore.icon || null, owner.user_id, chore.id,
            weekly ? 'days' : 'calendar', weekly ? (days.length === 7 ? '' : days.join(',')) : '', weekly ? weekly.id : null,
            null, 1, '[]', 0, weekly ? time(weekly.due_time) : null, null, 0, 0, 0,
        ).lastInsertRowid;
        if (!weekly) {
            for (const s of pinned) insertDate.run(routineId, rules.dateFromCrontab(s.crontab, today), s.id, time(s.due_time));
        }
        tidyChore(chore.id);
        claimed.add(chore.id);
        counts.restored += 1;
    }

    // The plugin's place on each display becomes the Chores widget.
    if (plugin) {
        const widgetName = `plugin:${plugin.filename}`;
        const users = db.prepare('SELECT id, username FROM users WHERE id <> 0').all();
        for (const device of db.prepare('SELECT name, device_settings_json FROM devices').all()) {
            const settings = json(device.device_settings_json, {});
            if (typeof settings !== 'object' || Array.isArray(settings)) continue;
            const hadChores = Boolean(settings.widgetSettings?.chores?.enabled);
            const pluginShown = Boolean(settings.pluginSettings?.[plugin.filename]?.enabled);
            let converted = false;
            for (const tab of db.prepare('SELECT id, config_json FROM tabs WHERE device_name = ?').all(device.name)) {
                const layout = json(tab.config_json, {});
                if (!layout || typeof layout !== 'object' || !layout[widgetName]) continue;
                if (pluginShown && !layout.chores) {
                    layout.chores = layout[widgetName];
                    converted = true;
                }
                delete layout[widgetName];
                db.prepare('UPDATE tabs SET config_json = ? WHERE id = ?').run(JSON.stringify(layout), tab.id);
            }
            if (converted) {
                counts.displays += 1;
                if (!hadChores) {
                    settings.widgetSettings = {
                        ...(settings.widgetSettings || {}),
                        chores: {
                            ...(settings.widgetSettings?.chores || {}),
                            enabled: true,
                            transparent: Boolean(settings.pluginSettings?.[plugin.filename]?.transparent),
                        },
                    };
                    // The plugin showed one person on this display: so does the Chores widget.
                    const person = String(settings.pluginPlatformSettings?.routines?.person || '').trim().toLowerCase();
                    const shown = person && users.find((u) => String(u.username).toLowerCase() === person);
                    if (shown) {
                        settings.choreWidgetSettings = {
                            ...(settings.choreWidgetSettings || {}),
                            hiddenUserIds: users.filter((u) => u.id !== shown.id).map((u) => u.id),
                        };
                    }
                }
            }
            if (settings.pluginSettings) delete settings.pluginSettings[plugin.filename];
            if (settings.pluginPlatformSettings) delete settings.pluginPlatformSettings.routines;
            db.prepare('UPDATE devices SET device_settings_json = ? WHERE name = ?').run(JSON.stringify(settings), device.name);
        }
        db.prepare('DELETE FROM plugins WHERE id = ?').run(plugin.id);
    }
    return counts;
}

try {
    console.log(`=== Starting Routines plugin import to version ${targetSchemaId} ===`);
    db.exec('BEGIN');
    try {
        const already = db.prepare("SELECT value FROM settings WHERE key = 'ROUTINES_IMPORTED'").get();
        const counts = already ? null : importRoutines();
        if (counts) {
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ROUTINES_IMPORTED', ?)").run(JSON.stringify({ ...counts, at: new Date().toISOString() }));
            console.log(`Imported ${counts.routines} routine(s), ${counts.steps} step(s); restored ${counts.restored}; ${counts.displays} display(s) moved to the Chores widget` +
                (counts.skipped.length ? `; skipped ${counts.skipped.join(', ')}` : ''));
        }
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(schemaIdKey, String(targetSchemaId));
        db.exec('COMMIT');
        console.log(`=== Routines plugin import completed (version ${targetSchemaId}) ===`);
    } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
    }
} catch (error) {
    console.error('=== Routines plugin import failed ===');
    console.error('Error:', error);
    throw error;
}
