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

// Google's per-event colorId ('1'...'11') and the hex Google's own UI shows
// for it (Lavender, Sage, Grape, Flamingo, Banana, Tangerine, Peacock,
// Graphite, Blueberry, Basil, Tomato). The API's /colors endpoint still
// returns the pre-2016 hexes (colorId 8 -> #e1e1e1 near-white where the UI
// shows #616161 dark grey), so sync resolves colorId here instead. The event
// editor offers the same eleven swatches (issue #244), so a color picked in
// HomeGlow is the color the dashboard and Google both show.
const EVENT_COLORS = Object.freeze({
    '1': '#7986cb',
    '2': '#33b679',
    '3': '#8e24aa',
    '4': '#e67c73',
    '5': '#f6bf26',
    '6': '#f4511e',
    '7': '#039be5',
    '8': '#616161',
    '9': '#3f51b5',
    '10': '#0b8043',
    '11': '#d50000',
});

// Event labels supersede the colorId palette: a custom label has a name and
// color of its own, and its backgroundColor is what Google's UI shows. Labels
// live on the calendar resource, so a per-(account, calendar) cache is the
// tightest key; they change rarely, so a day avoids an extra API round trip on
// every sync.
const EVENT_LABEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const eventLabelCache = new Map();

function eventLabelCacheKey(accountId, calendarId) {
    return `${accountId}:${calendarId}`;
}

// Maps a calendar's eventLabelId (UUID) to its backgroundColor hex. Returns an
// empty map on failure so callers fall through to the colorId palette rather
// than dropping color entirely.
async function listEventLabels(db, accountId, calendarId) {
    const cacheKey = eventLabelCacheKey(accountId, calendarId);
    const cached = eventLabelCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < EVENT_LABEL_CACHE_TTL_MS) {
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
        // Only successful fetches are cached. A transient failure returning an
        // empty map, if cached, would strip label colors for the whole TTL and
        // freeze that state into raw_data for every event synced in that
        // window; retrying on the next sync costs one request.
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

const toYmd = (value) => (typeof value === 'string' ? value.slice(0, 10) : new Date(value).toISOString().slice(0, 10));

// The calendar day after a 'YYYY-MM-DD', with no time zone in play.
function nextDay(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// undefined (leave the color alone), null (back to the calendar's color), or
// a colorId string. Anything else is the caller's mistake, so it is a 400
// rather than something passed on for Google to reject.
function normalizeEventColorId(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const id = String(value);
    if (Object.prototype.hasOwnProperty.call(EVENT_COLORS, id)) return id;
    const error = new Error('color_id must be a Google event color from 1 to 11.');
    error.status = 400;
    throw error;
}

// The event editor, like the rest of HomeGlow's API, says `all_day` and gives
// an inclusive end date: a one-day event ends on the day it starts. Google's
// all-day end is exclusive, so it gets one day added. `allDay` is the original
// key, whose end is passed through unchanged as Google's own exclusive end.
// Reading only `allDay` sent every edit from the editor down the timed branch,
// saving an all-day event as a zero-length event at UTC midnight (#215).
function eventToBody({ title, description, location, start, end, allDay, all_day: allDayInclusive, timeZone, color_id: colorId }) {
    const body = {};
    if (title !== undefined) body.summary = title;
    if (description !== undefined) body.description = description;
    if (location !== undefined) body.location = location;
    // `color_id` is one of Google's eleven event colors, or null (or '') for
    // the calendar's own color. Left out, the event's color is not touched.
    const color = normalizeEventColorId(colorId);
    if (color !== undefined) body.colorId = color;

    const inclusiveEnd = allDayInclusive !== undefined;
    const isAllDay = inclusiveEnd ? !!allDayInclusive : !!allDay;

    if (start !== undefined || end !== undefined || allDay !== undefined || inclusiveEnd) {
        if (isAllDay) {
            const startDate = toYmd(start);
            let endDate = toYmd(end || start);
            if (inclusiveEnd) endDate = nextDay(endDate < startDate ? startDate : endDate);
            body.start = { date: startDate };
            body.end = { date: endDate };
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
    // A new event already wears its calendar's color; there is nothing to clear.
    if (body.colorId === null) delete body.colorId;
    return await googleFetch(db, accountId, 'POST', `/calendars/${encodeURIComponent(calendarId)}/events`, body);
}

async function updateEvent(db, accountId, calendarId, eventId, event) {
    const body = eventToBody(event);
    // An update merges into the stored start and end, so turning a timed event
    // into an all-day one (or back) must clear the other kind of time, or Google
    // is left holding both a date and a dateTime.
    for (const edge of [body.start, body.end]) {
        if (!edge) continue;
        if (edge.date) {
            edge.dateTime = null;
            edge.timeZone = null;
        } else if (edge.dateTime) {
            edge.date = null;
        }
    }
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
    EVENT_COLORS,
    listCalendars,
    listEventLabels,
    listEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    parseEventDate,
};
