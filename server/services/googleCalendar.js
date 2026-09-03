const googleConnection = require('./googleConnection');

const API_BASE = 'https://www.googleapis.com/calendar/v3';
const googleFetch = googleConnection.createGoogleFetch(API_BASE, 'Google Calendar API');

async function listCalendars(db, accountId) {
    const items = [];
    let pageToken;
    do {
        const qs = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
        const data = await googleFetch(db, accountId, 'GET', `/users/me/calendarList${qs}`);
        if (data && Array.isArray(data.items)) items.push(...data.items);
        pageToken = data && data.nextPageToken;
    } while (pageToken);
    return items.map((c) => ({
        id: c.id,
        summary: c.summary,
        summaryOverride: c.summaryOverride,
        description: c.description,
        backgroundColor: c.backgroundColor,
        foregroundColor: c.foregroundColor,
        primary: !!c.primary,
        accessRole: c.accessRole,
        timeZone: c.timeZone,
    }));
}

// Google's event palette is effectively static, so a long TTL avoids an extra
// API round trip on every sync.
const EVENT_COLOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const eventColorCache = new Map();

// Maps Google's per-event colorId ('1'...'11') to its background hex. Returns
// an empty map if the palette can't be fetched, which leaves events falling
// back to their calendar's color rather than showing a wrong one.
async function listEventColors(db, accountId) {
    const cached = eventColorCache.get(accountId);
    if (cached && Date.now() - cached.fetchedAt < EVENT_COLOR_CACHE_TTL_MS) {
        return cached.colors;
    }

    try {
        const colors = {};
        const data = await googleFetch(db, accountId, 'GET', '/colors');
        if (data && data.event) {
            for (const [colorId, value] of Object.entries(data.event)) {
                if (value && value.background) colors[colorId] = value.background;
            }
        }
        // Only successful fetches are cached. Caching an empty palette after a
        // transient failure would strip per-event colors for the whole TTL —
        // and since the hex is resolved into raw_data at sync time, events
        // synced during that window stay uncolored until a later sync. Retrying
        // on the next sync costs one request and surfaces the error in the log.
        eventColorCache.set(accountId, { colors, fetchedAt: Date.now() });
        return colors;
    } catch (error) {
        console.error('Error fetching Google event colors:', error.message);
        return {};
    }
}

// Event labels supersede the legacy /colors palette: a label's backgroundColor
// is the color Google's own UI shows. They live on the calendar resource, so a
// per-(account, calendar) cache is the tightest key; a shared TTL with the
// legacy palette keeps both refreshes on the same cadence.
const eventLabelCache = new Map();

function eventLabelCacheKey(accountId, calendarId) {
    return `${accountId}:${calendarId}`;
}

// Maps a calendar's eventLabelId (UUID) to its backgroundColor hex. Returns an
// empty map on failure so callers fall through to the legacy colorId path
// rather than dropping color entirely.
async function listEventLabels(db, accountId, calendarId) {
    const cacheKey = eventLabelCacheKey(accountId, calendarId);
    const cached = eventLabelCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < EVENT_COLOR_CACHE_TTL_MS) {
        return cached.labels;
    }

    try {
        const labels = {};
        const data = await googleFetch(db, accountId, 'GET', `/calendars/${encodeURIComponent(calendarId)}`);
        const list = data && data.labelProperties && data.labelProperties.eventLabels;
        if (Array.isArray(list)) {
            for (const label of list) {
                if (label && label.id && label.backgroundColor) {
                    labels[label.id] = label.backgroundColor;
                }
            }
        }
        // Same reasoning as listEventColors: only cache successful fetches.
        // A transient failure returning an empty map, if cached, would strip
        // label colors for the whole TTL and freeze that state into raw_data
        // for every event synced in that window.
        eventLabelCache.set(cacheKey, { labels, fetchedAt: Date.now() });
        return labels;
    } catch (error) {
        console.error('Error fetching Google event labels:', error.message);
        return {};
    }
}

function parseEventDate(dt) {
    if (!dt) return null;
    if (dt.date) {
        return { date: dt.date, allDay: true };
    }
    if (dt.dateTime) {
        return { date: dt.dateTime, allDay: false, timeZone: dt.timeZone };
    }
    return null;
}

async function listEvents(db, accountId, calendarId, { timeMin, timeMax } = {}) {
    const out = [];
    let pageToken;
    const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
    do {
        const params = new URLSearchParams({
            singleEvents: 'true',
            maxResults: '2500',
            orderBy: 'startTime',
        });
        if (timeMin) params.set('timeMin', new Date(timeMin).toISOString());
        if (timeMax) params.set('timeMax', new Date(timeMax).toISOString());
        if (pageToken) params.set('pageToken', pageToken);
        const data = await googleFetch(db, accountId, 'GET', `${base}?${params.toString()}`);
        if (data && Array.isArray(data.items)) out.push(...data.items);
        pageToken = data && data.nextPageToken;
    } while (pageToken);
    return out;
}

function eventToBody({ title, description, location, start, end, allDay, timeZone }) {
    const body = {};
    if (title !== undefined) body.summary = title;
    if (description !== undefined) body.description = description;
    if (location !== undefined) body.location = location;

    if (start !== undefined || end !== undefined || allDay !== undefined) {
        if (allDay) {
            body.start = { date: typeof start === 'string' ? start.slice(0, 10) : new Date(start).toISOString().slice(0, 10) };
            const endDateSource = end || start;
            body.end = { date: typeof endDateSource === 'string' ? endDateSource.slice(0, 10) : new Date(endDateSource).toISOString().slice(0, 10) };
        } else {
            body.start = { dateTime: new Date(start).toISOString() };
            body.end = { dateTime: new Date(end).toISOString() };
            if (timeZone) { body.start.timeZone = timeZone; body.end.timeZone = timeZone; }
        }
    }
    return body;
}

async function createEvent(db, accountId, calendarId, event) {
    const body = eventToBody(event);
    return await googleFetch(db, accountId, 'POST', `/calendars/${encodeURIComponent(calendarId)}/events`, body);
}

async function updateEvent(db, accountId, calendarId, eventId, event) {
    const body = eventToBody(event);
    return await googleFetch(
        db,
        accountId,
        'PATCH',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        body,
    );
}

async function deleteEvent(db, accountId, calendarId, eventId) {
    return await googleFetch(
        db,
        accountId,
        'DELETE',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
}

module.exports = {
    listCalendars,
    listEventColors,
    listEventLabels,
    listEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    parseEventDate,
};
