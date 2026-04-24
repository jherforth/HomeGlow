const googleConnection = require('./googleConnection');

const API_BASE = 'https://www.googleapis.com/calendar/v3';

async function googleFetch(db, accountId, method, pathAndQuery, body) {
    const accessToken = await googleConnection.getValidAccessToken(db, accountId);
    const url = pathAndQuery.startsWith('http') ? pathAndQuery : `${API_BASE}${pathAndQuery}`;
    const init = {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
        },
    };
    if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (res.status === 204) return null;
    const text = await res.text();
    let parsed = null;
    if (text) {
        try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }
    }
    if (!res.ok) {
        const msg = parsed && parsed.error && parsed.error.message ? parsed.error.message : `Google API error ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.details = parsed;
        throw err;
    }
    return parsed;
}

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
    listEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    parseEventDate,
};
