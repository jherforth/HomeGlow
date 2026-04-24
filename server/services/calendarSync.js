const axios = require('axios');
const ICAL = require('ical.js');
const node_ical = require('node-ical');
const googleConnection = require('./googleConnection');
const googleCalendar = require('./googleCalendar');

class CalendarSyncService {
  constructor(db, decryptPassword) {
    this.db = db;
    this.decryptPassword = decryptPassword;
    this.syncIntervals = new Map();
    this.isSyncing = new Map();
  }

  initialize() {
    this.startAllSyncJobs();
    console.log('Calendar sync service initialized');
  }

  normalizeAllDayEnd(end) {
    const d = new Date(end);
    d.setDate(d.getDate() - 1);
    return d;
  }

  async syncSource(sourceId) {
    if (this.isSyncing.get(sourceId)) {
      console.log(`Sync already in progress for source ${sourceId}, skipping`);
      return { skipped: true };
    }

    this.isSyncing.set(sourceId, true);

    try {
      const source = this.db.prepare('SELECT * FROM calendar_sources WHERE id = ? AND enabled = 1').get(sourceId);
      if (!source) {
        console.log(`Source ${sourceId} not found or disabled`);
        return { success: false, error: 'Source not found or disabled' };
      }

      console.log(`Starting sync for calendar source: ${source.name} (${source.type})`);
      const startTime = Date.now();

      let events = [];

      if (source.type === 'ICS') {
        events = await this.fetchICSEvents(source);
      } else if (source.type === 'CalDAV') {
        events = await this.fetchCalDAVEvents(source);
      } else if (source.type === 'Google') {
        events = await this.fetchGoogleEvents(source);
      }

      this.db.prepare('DELETE FROM calendar_events_cache WHERE source_id = ?').run(sourceId);

      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO calendar_events_cache
        (source_id, event_uid, title, start_time, end_time, description, location, all_day, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = this.db.transaction((events) => {
        for (const event of events) {
          insertStmt.run(
            sourceId,
            event.uid,
            event.title,
            event.start.toISOString(),
            event.end.toISOString(),
            event.description || null,
            event.location || null,
            event.all_day ? 1 : 0,
            JSON.stringify(event.raw || {})
          );
        }
      });

      insertMany(events);

      const duration = Date.now() - startTime;

      this.db.prepare(`
        INSERT OR REPLACE INTO calendar_sync_status (source_id, last_sync_at, last_sync_status, last_sync_message, event_count)
        VALUES (?, datetime('now'), 'success', ?, ?)
      `).run(sourceId, `Synced ${events.length} events in ${duration}ms`, events.length);

      console.log(`Synced ${events.length} events for ${source.name} in ${duration}ms`);

      return { success: true, eventCount: events.length, duration };
    } catch (error) {
      console.error(`Error syncing calendar source ${sourceId}:`, error.message);

      this.db.prepare(`
        INSERT OR REPLACE INTO calendar_sync_status (source_id, last_sync_at, last_sync_status, last_sync_message)
        VALUES (?, datetime('now'), 'error', ?)
      `).run(sourceId, error.message);

      return { success: false, error: error.message };
    } finally {
      this.isSyncing.set(sourceId, false);
    }
  }

  async fetchICSEvents(source) {
    const events = await node_ical.async.fromURL(source.url);
    const out = [];

    const rangeStart = new Date(Date.now() - 13 * 30 * 24 * 60 * 60 * 1000);
    const rangeEnd = new Date(Date.now() + 13 * 30 * 24 * 60 * 60 * 1000);

    for (const event of Object.values(events)) {
      if (event.type !== 'VEVENT') continue;

      const instances = node_ical.expandRecurringEvent(event, {
        from: rangeStart,
        to: rangeEnd
      });

      if (!instances) {
        const isAllDay = event.start?.dateOnly ?? false;
        const rawEnd = event.end;
        out.push({
          uid: event.uid || `${source.id}-${Date.now()}-${Math.random()}`,
          title: event.summary || 'Untitled Event',
          start: new Date(event.start),
          end: isAllDay ? this.normalizeAllDayEnd(rawEnd) : new Date(rawEnd),
          description: event.description,
          location: event.location,
          all_day: isAllDay,
          raw: { rrule: event.rrule }
        });
        continue;
      }

      for (const instance of instances) {
        const isAllDay = instance.start?.dateOnly ?? instance.event?.start?.dateOnly ?? false;
        const rawEnd = instance.end ?? instance.event?.end;
        out.push({
          uid: `${instance.uid ?? instance.event?.uid ?? source.id}-${new Date(instance.start ?? instance.event?.start).getTime()}`,
          title: instance.summary ?? instance.event?.summary ?? 'Untitled Event',
          start: new Date(instance.start ?? instance.event?.start),
          end: isAllDay ? this.normalizeAllDayEnd(rawEnd) : new Date(rawEnd),
          description: instance.description ?? instance.event?.description,
          location: instance.location ?? instance.event?.location,
          all_day: isAllDay,
          raw: { recurring: true }
        });
      }
    }

    return out;
  }

  async fetchCalDAVEvents(source) {
    const decryptedPassword = this.decryptPassword(source.password);
    const authHeader = 'Basic ' + Buffer.from(`${source.username}:${decryptedPassword}`).toString('base64');

    const response = await axios.get(source.url, {
      headers: { 'Authorization': authHeader },
      timeout: 15000
    });

    const icsData = response.data;
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    return vevents.map(vevent => {
      const event = new ICAL.Event(vevent);
      const dtstart = vevent.getFirstPropertyValue('dtstart');
      const isAllDay = dtstart?.isDate ?? false;
      const rawEnd = event.endDate.toJSDate();

      return {
        uid: event.uid || `${source.id}-${Date.now()}-${Math.random()}`,
        title: event.summary || 'Untitled Event',
        start: event.startDate.toJSDate(),
        end: isAllDay ? this.normalizeAllDayEnd(rawEnd) : rawEnd,
        description: event.description,
        location: event.location,
        all_day: isAllDay,
        raw: {}
      };
    });
  }

  async fetchGoogleEvents(source) {
    const account = googleConnection.getConnectedAccount(this.db);
    if (!account) {
      throw new Error('No Google account connected. Authorize Google in Connections.');
    }
    const calendarId = source.url;
    if (!calendarId) {
      throw new Error('Google calendar source has no calendar selected.');
    }
    const now = Date.now();
    const timeMin = new Date(now - 13 * 30 * 24 * 60 * 60 * 1000);
    const timeMax = new Date(now + 13 * 30 * 24 * 60 * 60 * 1000);
    const items = await googleCalendar.listEvents(this.db, account.id, calendarId, { timeMin, timeMax });

    const out = [];
    for (const item of items) {
      if (!item || item.status === 'cancelled') continue;
      const start = googleCalendar.parseEventDate(item.start);
      const end = googleCalendar.parseEventDate(item.end);
      if (!start || !end) continue;
      const startDate = new Date(start.date);
      let endDate = new Date(end.date);
      if (start.allDay) {
        endDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
      }
      out.push({
        uid: item.id,
        title: item.summary || 'Untitled Event',
        start: startDate,
        end: endDate,
        description: item.description || null,
        location: item.location || null,
        all_day: !!start.allDay,
        raw: { googleEventId: item.id, htmlLink: item.htmlLink, etag: item.etag },
      });
    }
    return out;
  }

  async syncAllSources() {
    const sources = this.db.prepare('SELECT id FROM calendar_sources WHERE enabled = 1').all();
    const results = [];

    for (const source of sources) {
      const result = await this.syncSource(source.id);
      results.push({ sourceId: source.id, ...result });
    }

    return results;
  }

  getCachedEvents(startDate, endDate) {
    const sources = this.db.prepare(`
      SELECT id, name, color FROM calendar_sources WHERE enabled = 1
    `).all();

    const sourceMap = new Map(sources.map(s => [s.id, s]));

    let query = `
      SELECT * FROM calendar_events_cache
      WHERE source_id IN (SELECT id FROM calendar_sources WHERE enabled = 1)
    `;
    const params = [];

    if (startDate) {
      query += ' AND end_time >= ?';
      params.push(new Date(startDate).toISOString());
    }
    if (endDate) {
      query += ' AND start_time <= ?';
      params.push(new Date(endDate).toISOString());
    }

    query += ' ORDER BY start_time ASC';

    const rows = this.db.prepare(query).all(...params);

    return rows.map(row => {
      const source = sourceMap.get(row.source_id);
      return {
        id: row.event_uid,
        title: row.title,
        start: new Date(row.start_time),
        end: new Date(row.end_time),
        description: row.description,
        location: row.location,
        all_day: row.all_day === 1,
        source_id: row.source_id,
        source_name: source?.name || 'Unknown',
        source_color: source?.color || '#6e44ff'
      };
    });
  }

  getSyncStatus(sourceId) {
    if (sourceId) {
      return this.db.prepare('SELECT * FROM calendar_sync_status WHERE source_id = ?').get(sourceId);
    }
    return this.db.prepare(`
      SELECT css.*, cs.name as source_name
      FROM calendar_sync_status css
      JOIN calendar_sources cs ON css.source_id = cs.id
    `).all();
  }

  setSyncInterval(sourceId, intervalMinutes) {
    this.db.prepare(`
      INSERT OR REPLACE INTO calendar_sync_status (source_id, sync_interval_minutes)
      VALUES (?, ?)
      ON CONFLICT(source_id) DO UPDATE SET sync_interval_minutes = excluded.sync_interval_minutes
    `).run(sourceId, intervalMinutes);

    this.restartSyncJob(sourceId);
  }

  getSyncInterval(sourceId) {
    const row = this.db.prepare('SELECT sync_interval_minutes FROM calendar_sync_status WHERE source_id = ?').get(sourceId);
    return row?.sync_interval_minutes || 15;
  }

  startSyncJob(sourceId) {
    const interval = this.getSyncInterval(sourceId);

    if (this.syncIntervals.has(sourceId)) {
      clearInterval(this.syncIntervals.get(sourceId));
    }

    if (interval <= 0) {
      console.log(`Sync disabled for source ${sourceId}`);
      return;
    }

    const intervalMs = interval * 60 * 1000;

    const intervalId = setInterval(() => {
      this.syncSource(sourceId).catch(err => {
        console.error(`Scheduled sync failed for source ${sourceId}:`, err.message);
      });
    }, intervalMs);

    this.syncIntervals.set(sourceId, intervalId);
    console.log(`Started sync job for source ${sourceId} every ${interval} minutes`);
  }

  restartSyncJob(sourceId) {
    if (this.syncIntervals.has(sourceId)) {
      clearInterval(this.syncIntervals.get(sourceId));
      this.syncIntervals.delete(sourceId);
    }
    this.startSyncJob(sourceId);
  }

  startAllSyncJobs() {
    const sources = this.db.prepare('SELECT id FROM calendar_sources WHERE enabled = 1').all();

    for (const source of sources) {
      this.startSyncJob(source.id);
    }

    setTimeout(() => {
      this.syncAllSources().catch(err => {
        console.error('Initial sync failed:', err.message);
      });
    }, 5000);
  }

  stopAllSyncJobs() {
    for (const [sourceId, intervalId] of this.syncIntervals) {
      clearInterval(intervalId);
      console.log(`Stopped sync job for source ${sourceId}`);
    }
    this.syncIntervals.clear();
  }

  onSourceCreated(sourceId) {
    this.syncSource(sourceId).then(() => {
      this.startSyncJob(sourceId);
    });
  }

  onSourceUpdated(sourceId) {
    this.syncSource(sourceId);
  }

  onSourceDeleted(sourceId) {
    if (this.syncIntervals.has(sourceId)) {
      clearInterval(this.syncIntervals.get(sourceId));
      this.syncIntervals.delete(sourceId);
    }
  }

  onSourceToggled(sourceId, enabled) {
    if (enabled) {
      this.syncSource(sourceId).then(() => {
        this.startSyncJob(sourceId);
      });
    } else {
      if (this.syncIntervals.has(sourceId)) {
        clearInterval(this.syncIntervals.get(sourceId));
        this.syncIntervals.delete(sourceId);
      }
    }
  }
}

module.exports = CalendarSyncService;
