const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `api-endpoints-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 5200 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

let serverProcess;
let serverLogs = '';

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(`${baseUrl}/api/test`);
            if (response.ok) {
                return;
            }
        } catch {
            // Server is still starting.
        }
        await delay(250);
    }

    throw new Error(`Server did not become ready within ${timeoutMs}ms. Logs:\n${serverLogs}`);
}

async function api(pathname, options = {}) {
    const headers = {
        ...(options.headers || {}),
    };

    if (options.body !== undefined && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers,
    });

    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }

    return { status: response.status, body, headers: response.headers };
}

test.before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    serverProcess = spawn('node', ['index.js'], {
        cwd: serverDir,
        env: {
            ...process.env,
            PORT: String(port),
            DB_PATH: testDbPath,
            TZ: 'UTC',
            HOMEGLOW_DISABLE_BACKGROUND_JOBS: '1',
            HOMEGLOW_DISABLE_CALENDAR_SYNC: '1',
            ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
            BACKEND_VERSION: 'test-backend-version',
            BACKEND_GIT_COMMIT: '1234567890abcdef1234567890abcdef12345678',
            BACKEND_GITHUB_REPOSITORY: 'jherforth/HomeGlow',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (chunk) => {
        serverLogs += chunk.toString();
    });
    serverProcess.stderr.on('data', (chunk) => {
        serverLogs += chunk.toString();
    });

    await waitForServerReady();
});

test.after(async () => {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
        await new Promise((resolve) => {
            serverProcess.once('close', () => resolve());
            setTimeout(resolve, 5000);
        });
    }

    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const filePath = `${testDbPath}${suffix}`;
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    } else {
        console.log(`[test-debug] Preserving API test DB artifacts for inspection: ${testDbPath}`);
    }
});

test('GET /api/test returns basic server health payload', async () => {
    const { status, body } = await api('/api/test');

    assert.equal(status, 200);
    assert.equal(body.message, 'Server is working!');
    assert.equal(typeof body.timestamp, 'string');
    assert.equal(typeof body.widgetsDir, 'string');
});

test('GET /api/timezone returns configured timezone', async () => {
    const { status, body } = await api('/api/timezone');

    assert.equal(status, 200);
    assert.equal(body.timezone, 'UTC');
});

test('GET /api/stats returns backend build metadata', async () => {
    const { status, body } = await api('/api/stats');

    assert.equal(status, 200);
    assert.equal(body.backend.version, 'test-backend-version');
    assert.equal(body.backend.commit, '1234567890abcdef1234567890abcdef12345678');
    assert.equal(body.backend.repository, 'jherforth/HomeGlow');
    assert.equal(
        body.backend.commitUrl,
        'https://github.com/jherforth/HomeGlow/commit/1234567890abcdef1234567890abcdef12345678'
    );
});

test('tabs endpoint returns default Home tab when device has no persisted tabs yet', async () => {
    const deviceName = `new-device-${Date.now()}`;
    const { status, body } = await api(`/api/devices/${encodeURIComponent(deviceName)}/tabs`);

    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    assert.equal(body[0].number, 1);
    assert.equal(body[0].label, 'Home');
    assert.equal(body[0].icon, 'home');
});

test('tabs endpoint returns 200 with If-Modified-Since-only after rapid layout updates', async () => {
    const deviceName = `tabs-ims-${Date.now()}`;

    const createTabRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/tabs`, {
        method: 'POST',
        body: JSON.stringify({ label: 'Calendar', icon: 'calendar_today', show_label: true }),
    });
    assert.equal(createTabRes.status, 200);

    const assignRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments`, {
        method: 'POST',
        body: JSON.stringify({ widget_name: 'calendar', tabNumber: 1 }),
    });
    assert.equal(assignRes.status, 200);

    const firstTabsRead = await api(`/api/devices/${encodeURIComponent(deviceName)}/tabs`);
    assert.equal(firstTabsRead.status, 200);
    const lastModified = firstTabsRead.headers.get('last-modified');
    assert.ok(lastModified);

    const patchRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments/layout`, {
        method: 'PATCH',
        body: JSON.stringify({
            widget_name: 'calendar',
            tabNumber: 1,
            settings: { showStartTimes: false },
        }),
    });
    assert.equal(patchRes.status, 200);

    const conditionalTabsRead = await api(`/api/devices/${encodeURIComponent(deviceName)}/tabs`, {
        headers: {
            'If-Modified-Since': lastModified,
        },
    });

    assert.equal(conditionalTabsRead.status, 200);
    const homeTab = conditionalTabsRead.body.find((row) => row.number === 1);
    assert.ok(homeTab);
    const parsedConfig = JSON.parse(homeTab.config_json || '{}');
    assert.equal(parsedConfig.calendar.showStartTimes, false);
});

test('deleting a non-home tab moves assigned widgets to Home tab', async () => {
    const deviceName = `delete-tab-move-${Date.now()}`;

    const createTabRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/tabs`, {
        method: 'POST',
        body: JSON.stringify({ label: 'Extras', icon: 'star', show_label: true }),
    });
    assert.equal(createTabRes.status, 200);
    assert.equal(createTabRes.body.number, 2);

    const createAssignmentRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments`, {
        method: 'POST',
        body: JSON.stringify({ widget_name: 'plugin:sample-widget', tabNumber: 2 }),
    });
    assert.equal(createAssignmentRes.status, 200);

    const deleteTabRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/tabs/2`, {
        method: 'DELETE',
    });
    assert.equal(deleteTabRes.status, 200);

    const assignmentsRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments`);
    assert.equal(assignmentsRes.status, 200);

    const movedAssignment = assignmentsRes.body.find((row) => row.widget_name === 'plugin:sample-widget');
    assert.ok(movedAssignment, 'Expected plugin assignment to remain after tab deletion');
    assert.equal(movedAssignment.tab_number, 1);
});

test('device settings endpoints merge incoming keys without overwriting unspecified values', async () => {
    const deviceName = `device-settings-${Date.now()}`;

    const firstWrite = await api(`/api/devices/${encodeURIComponent(deviceName)}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ theme: 'dark', widgetsLocked: true }),
    });
    assert.equal(firstWrite.status, 200);
    assert.equal(firstWrite.body.theme, 'dark');
    assert.equal(firstWrite.body.widgetsLocked, true);

    const secondWrite = await api(`/api/devices/${encodeURIComponent(deviceName)}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ themeMode: 'auto' }),
    });
    assert.equal(secondWrite.status, 200);
    assert.equal(secondWrite.body.theme, 'dark');
    assert.equal(secondWrite.body.widgetsLocked, true);
    assert.equal(secondWrite.body.themeMode, 'auto');

    const readBack = await api(`/api/devices/${encodeURIComponent(deviceName)}/settings`);
    assert.equal(readBack.status, 200);
    assert.equal(readBack.body.theme, 'dark');
    assert.equal(readBack.body.widgetsLocked, true);
    assert.equal(readBack.body.themeMode, 'auto');
});

test('device settings GET supports conditional requests with ETag', async () => {
    const deviceName = `etag-settings-${Date.now()}`;

    const writeRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ theme: 'light' }),
    });
    assert.equal(writeRes.status, 200);

    const firstRead = await api(`/api/devices/${encodeURIComponent(deviceName)}/settings`);
    assert.equal(firstRead.status, 200);
    const etag = firstRead.headers.get('etag');
    assert.ok(etag, 'Expected ETag header to be present');

    const secondRead = await api(`/api/devices/${encodeURIComponent(deviceName)}/settings`, {
        headers: {
            'If-None-Match': etag,
        },
    });
    assert.equal(secondRead.status, 304);
});

test('If-None-Match mismatch returns 200 even when If-Modified-Since is in the future', async () => {
    const deviceName = `etag-precedence-${Date.now()}`;

    const firstWrite = await api(`/api/devices/${encodeURIComponent(deviceName)}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ theme: 'light' }),
    });
    assert.equal(firstWrite.status, 200);

    const initialRead = await api(`/api/devices/${encodeURIComponent(deviceName)}/settings`);
    assert.equal(initialRead.status, 200);
    const staleEtag = initialRead.headers.get('etag');
    assert.ok(staleEtag);

    const secondWrite = await api(`/api/devices/${encodeURIComponent(deviceName)}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ theme: 'dark' }),
    });
    assert.equal(secondWrite.status, 200);

    const readWithBothValidators = await api(`/api/devices/${encodeURIComponent(deviceName)}/settings`, {
        headers: {
            'If-None-Match': staleEtag,
            'If-Modified-Since': 'Fri, 31 Dec 9999 23:59:59 GMT',
        },
    });

    assert.equal(readWithBothValidators.status, 200);
    assert.equal(readWithBothValidators.body.theme, 'dark');
});

test('widget assignment IDs can be round-tripped for delete operations', async () => {
    const deviceName = `assignment-id-${Date.now()}`;

    const createTabRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/tabs`, {
        method: 'POST',
        body: JSON.stringify({ label: 'Workspace', icon: 'star', show_label: true }),
    });
    assert.equal(createTabRes.status, 200);

    const createAssignmentRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments`, {
        method: 'POST',
        body: JSON.stringify({ widget_name: 'plugin:delete-me', tabNumber: 2 }),
    });
    assert.equal(createAssignmentRes.status, 200);

    const listBeforeDelete = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments`);
    assert.equal(listBeforeDelete.status, 200);
    const created = listBeforeDelete.body.find((row) => row.widget_name === 'plugin:delete-me' && row.tab_number === 2);
    assert.ok(created);
    assert.equal(typeof created.id, 'string');

    const deleteRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments/${encodeURIComponent(created.id)}`, {
        method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);

    const listAfterDelete = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments`);
    assert.equal(listAfterDelete.status, 200);
    const stillThere = listAfterDelete.body.find((row) => row.widget_name === 'plugin:delete-me' && row.tab_number === 2);
    assert.equal(Boolean(stillThere), false);
});

test('widget layout settings PATCH persists calendar showStartTimes=false in tabs config_json', async () => {
    const deviceName = `calendar-settings-${Date.now()}`;

    const createTabRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/tabs`, {
        method: 'POST',
        body: JSON.stringify({ label: 'Calendar', icon: 'calendar_today', show_label: true }),
    });
    assert.equal(createTabRes.status, 200);

    const assignRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments`, {
        method: 'POST',
        body: JSON.stringify({ widget_name: 'calendar', tabNumber: 1 }),
    });
    assert.equal(assignRes.status, 200);

    const patchRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments/layout`, {
        method: 'PATCH',
        body: JSON.stringify({
            widget_name: 'calendar',
            tabNumber: 1,
            settings: {
                showStartTimes: false,
            },
        }),
    });

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.showStartTimes, false);

    const tabsRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/tabs`);
    assert.equal(tabsRes.status, 200);
    const homeTab = tabsRes.body.find((row) => row.number === 1);
    assert.ok(homeTab);

    const parsedConfig = JSON.parse(homeTab.config_json || '{}');
    assert.equal(parsedConfig.calendar.showStartTimes, false);
});

test('widget layout PATCH rejects requests that provide neither settings nor layout fields', async () => {
    const deviceName = `calendar-layout-invalid-${Date.now()}`;

    const createTabRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/tabs`, {
        method: 'POST',
        body: JSON.stringify({ label: 'Calendar', icon: 'calendar_today', show_label: true }),
    });
    assert.equal(createTabRes.status, 200);

    const assignRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments`, {
        method: 'POST',
        body: JSON.stringify({ widget_name: 'calendar', tabNumber: 1 }),
    });
    assert.equal(assignRes.status, 200);

    const badPatchRes = await api(`/api/devices/${encodeURIComponent(deviceName)}/widget-assignments/layout`, {
        method: 'PATCH',
        body: JSON.stringify({
            widget_name: 'calendar',
            tabNumber: 1,
        }),
    });

    assert.equal(badPatchRes.status, 400);
    assert.equal(badPatchRes.body.error, 'Request must include layout fields or settings object');
});

test('settings endpoints persist and query values', async () => {
    const saveRes = await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
            key: 'TEST_SETTING_JSON',
            value: JSON.stringify({ featureEnabled: true, retries: 2 }),
        }),
    });
    assert.equal(saveRes.status, 200);
    assert.equal(saveRes.body.success, true);

    const getRes = await api('/api/settings');
    assert.equal(getRes.status, 200);
    assert.deepEqual(getRes.body.TEST_SETTING_JSON, { featureEnabled: true, retries: 2 });

    const searchRes = await api('/api/settings/search', {
        method: 'POST',
        body: JSON.stringify(['TEST_SETTING_*']),
    });
    assert.equal(searchRes.status, 200);
    assert.deepEqual(searchRes.body.TEST_SETTING_JSON, { featureEnabled: true, retries: 2 });
});

test('prize endpoints validate and support CRUD lifecycle', async () => {
    const invalidRes = await api('/api/prizes', {
        method: 'POST',
        body: JSON.stringify({ name: 'Invalid', clam_cost: 0 }),
    });
    assert.equal(invalidRes.status, 400);

    const createRes = await api('/api/prizes', {
        method: 'POST',
        body: JSON.stringify({ name: 'Movie Night', clam_cost: 15 }),
    });
    assert.equal(createRes.status, 200);
    assert.equal(typeof createRes.body.id, 'number');

    const prizeId = createRes.body.id;

    const listRes = await api('/api/prizes');
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body));
    assert.ok(listRes.body.some((row) => row.id === prizeId && row.name === 'Movie Night'));

    const updateRes = await api(`/api/prizes/${prizeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Pizza Night', clam_cost: 20 }),
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);

    const deleteRes = await api(`/api/prizes/${prizeId}`, { method: 'DELETE' });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.success, true);

    const deleteAgainRes = await api(`/api/prizes/${prizeId}`, { method: 'DELETE' });
    assert.equal(deleteAgainRes.status, 404);
});

test('user endpoints support create, list, and update', async () => {
    const createRes = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({
            username: 'Test User',
            email: 'test-user@example.com',
            profile_picture: null,
        }),
    });

    assert.equal(createRes.status, 200);
    assert.equal(typeof createRes.body.id, 'number');

    const userId = createRes.body.id;

    const listRes = await api('/api/users');
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body));

    const user = listRes.body.find((row) => row.id === userId);
    assert.ok(user);
    assert.equal(user.username, 'Test User');
    assert.equal(typeof user.clam_total, 'number');

    const updateRes = await api(`/api/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({
            username: 'Updated User',
            email: 'updated-user@example.com',
            profile_picture: null,
        }),
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);
});

test('GET /api/sounds lists seeded default sounds', async () => {
    const { status, body } = await api('/api/sounds');

    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    const chime = body.find((s) => s.filename === 'chime.wav');
    assert.ok(chime, 'expected the default chime.wav sound to be present');
    assert.equal(chime.isDefault, true);
    assert.equal(chime.url, '/Uploads/sounds/chime.wav');
});

test('DELETE /api/sounds refuses to delete a bundled default', async () => {
    const { status, body } = await api('/api/sounds/chime.wav', { method: 'DELETE' });

    assert.equal(status, 400);
    assert.match(body.error, /default/i);
});

test('chore schedule persists due_time and sound fields through create and patch', async () => {
    const choreRes = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Take medicine', description: '', clam_value: 0 }),
    });
    assert.equal(choreRes.status, 200);
    const choreId = choreRes.body.id;

    const createRes = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            crontab: '0 0 * * *',
            duration: 'day-of',
            visible: 1,
            due_time: '15:30',
            sound_enabled: 1,
            sound: 'bell.wav',
            reminder_interval_minutes: 30,
        }),
    });
    assert.equal(createRes.status, 200);
    const scheduleId = createRes.body.id;

    const afterCreate = await api(`/api/chore-schedules/${scheduleId}`);
    assert.equal(afterCreate.status, 200);
    assert.equal(afterCreate.body.due_time, '15:30');
    assert.equal(afterCreate.body.sound_enabled, 1);
    assert.equal(afterCreate.body.sound, 'bell.wav');
    assert.equal(afterCreate.body.reminder_interval_minutes, 30);

    const patchRes = await api(`/api/chore-schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ due_time: '08:00', sound_enabled: 0, reminder_interval_minutes: 0 }),
    });
    assert.equal(patchRes.status, 200);

    const afterPatch = await api(`/api/chore-schedules/${scheduleId}`);
    assert.equal(afterPatch.body.due_time, '08:00');
    assert.equal(afterPatch.body.sound_enabled, 0);
    assert.equal(afterPatch.body.reminder_interval_minutes, null);
});

test('chore schedule rejects an invalid due_time', async () => {
    const choreRes = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Bad time chore', description: '', clam_value: 0 }),
    });
    const choreId = choreRes.body.id;

    const createRes = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({
            chore_id: choreId,
            crontab: '0 0 * * *',
            duration: 'day-of',
            due_time: '25:99',
        }),
    });

    assert.equal(createRes.status, 400);
    assert.match(createRes.body.error, /due_time/);
});

test('chore schedule persists transferable, can_snooze, and snoozed_until (issue #122)', async () => {
    const choreRes = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Water garden', description: '', clam_value: 0 }),
    });
    const choreId = choreRes.body.id;

    const snoozeIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const createRes = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({ chore_id: choreId, crontab: '0 0 * * *', duration: 'day-of', transferable: 0, can_snooze: 0, snoozed_until: snoozeIso }),
    });
    assert.equal(createRes.status, 200);
    const scheduleId = createRes.body.id;

    const afterCreate = await api(`/api/chore-schedules/${scheduleId}`);
    assert.equal(afterCreate.body.transferable, 0);
    assert.equal(afterCreate.body.can_snooze, 0);
    assert.equal(afterCreate.body.snoozed_until, snoozeIso);

    // Omitted fields default to enabled / not snoozed.
    const defaultsCreate = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({ chore_id: choreId, crontab: '0 0 * * *', duration: 'day-of' }),
    });
    const defaults = await api(`/api/chore-schedules/${defaultsCreate.body.id}`);
    assert.equal(defaults.body.transferable, 1);
    assert.equal(defaults.body.can_snooze, 1);
    assert.equal(defaults.body.snoozed_until, null);

    // PATCH round-trips; an empty string clears the snooze.
    const patchRes = await api(`/api/chore-schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ transferable: 1, can_snooze: 1, snoozed_until: '' }),
    });
    assert.equal(patchRes.status, 200);
    const afterPatch = await api(`/api/chore-schedules/${scheduleId}`);
    assert.equal(afterPatch.body.transferable, 1);
    assert.equal(afterPatch.body.can_snooze, 1);
    assert.equal(afterPatch.body.snoozed_until, null);

    const badRes = await api(`/api/chore-schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ snoozed_until: 'not-a-date' }),
    });
    assert.equal(badRes.status, 400);
    assert.match(badRes.body.error, /snoozed_until/);
});

test('transfer onto a completed day supports revoke and keep-with-bonus paths (issue #122)', async () => {
    const today = new Date().toISOString().slice(0, 10);

    const giverRes = await api('/api/users', { method: 'POST', body: JSON.stringify({ username: 'Giver Gwen' }) });
    const receiverRes = await api('/api/users', { method: 'POST', body: JSON.stringify({ username: 'Receiver Rae' }) });
    const giverId = giverRes.body.id;
    const receiverId = receiverRes.body.id;

    const makeRegularChoreSchedule = async (title, userId) => {
        const chore = await api('/api/chores', { method: 'POST', body: JSON.stringify({ title, description: '', clam_value: 0 }) });
        const schedule = await api('/api/chore-schedules', {
            method: 'POST',
            body: JSON.stringify({ chore_id: chore.body.id, user_id: userId, crontab: '0 0 * * *', duration: 'day-of', visible: 1 }),
        });
        return schedule.body.id;
    };
    const clamsOf = async (userId) => (await api(`/api/users/${userId}/clams`)).body.clam_total;

    // Receiver completes their only regular chore -> earns the daily bonus (default 2).
    const receiverChore = await makeRegularChoreSchedule('Rae dishes', receiverId);
    await api('/api/chores/complete', { method: 'POST', body: JSON.stringify({ chore_schedule_id: receiverChore, user_id: receiverId, date: today }) });
    assert.equal(await clamsOf(receiverId), 2, 'receiver should hold the daily completion bonus');

    // REVOKE path: moving an open chore onto the completed day takes the bonus back.
    const revokeChore = await makeRegularChoreSchedule('Gwen laundry', giverId);
    const revokeRes = await api(`/api/chore-schedules/${revokeChore}`, {
        method: 'PATCH',
        body: JSON.stringify({ user_id: receiverId, visible: 1, revoke_daily_bonus: true }),
    });
    assert.equal(revokeRes.status, 200);
    assert.equal(await clamsOf(receiverId), 0, 'revoke_daily_bonus should delete the receiver bonus row');

    // Completing the transferred chore re-completes the day and re-awards once.
    await api('/api/chores/complete', { method: 'POST', body: JSON.stringify({ chore_schedule_id: revokeChore, user_id: receiverId, date: today }) });
    assert.equal(await clamsOf(receiverId), 2);

    // KEEP path: bonus stays and the pending transfer bonus pays on completion.
    const keepChore = await makeRegularChoreSchedule('Gwen vacuum', giverId);
    const keepRes = await api(`/api/chore-schedules/${keepChore}`, {
        method: 'PATCH',
        body: JSON.stringify({ user_id: receiverId, visible: 1, transfer_bonus_clams: 3 }),
    });
    assert.equal(keepRes.status, 200);
    assert.equal(await clamsOf(receiverId), 2, 'keep path must not touch the daily bonus');
    assert.equal((await api(`/api/chore-schedules/${keepChore}`)).body.transfer_bonus_clams, 3);

    await api('/api/chores/complete', { method: 'POST', body: JSON.stringify({ chore_schedule_id: keepChore, user_id: receiverId, date: today }) });
    assert.equal(await clamsOf(receiverId), 5, 'completion should pay the 3-clam transfer bonus without double daily bonus');
    assert.equal((await api(`/api/chore-schedules/${keepChore}`)).body.transfer_bonus_clams, 0, 'payout clears the pending bonus');

    // Uncompleting takes the payout back, re-arms it, and revokes the daily bonus.
    await api('/api/chores/uncomplete', { method: 'POST', body: JSON.stringify({ chore_schedule_id: keepChore, user_id: receiverId, date: today }) });
    assert.equal(await clamsOf(receiverId), 0);
    assert.equal((await api(`/api/chore-schedules/${keepChore}`)).body.transfer_bonus_clams, 3, 'uncomplete re-arms the pending bonus');
});

test('snoozing the last open chore awards the daily bonus, un-snoozing never revokes (issue #122)', async () => {
    const today = new Date().toISOString().slice(0, 10);

    const userRes = await api('/api/users', { method: 'POST', body: JSON.stringify({ username: 'Snoozy Sam' }) });
    const userId = userRes.body.id;

    const makeSchedule = async (title) => {
        const chore = await api('/api/chores', { method: 'POST', body: JSON.stringify({ title, description: '', clam_value: 0 }) });
        const schedule = await api('/api/chore-schedules', {
            method: 'POST',
            body: JSON.stringify({ chore_id: chore.body.id, user_id: userId, crontab: '0 0 * * *', duration: 'day-of', visible: 1 }),
        });
        return schedule.body.id;
    };
    const clamsOf = async () => (await api(`/api/users/${userId}/clams`)).body.clam_total;

    const doneChore = await makeSchedule('Sam bed');
    const openChore = await makeSchedule('Sam homework');
    await api('/api/chores/complete', { method: 'POST', body: JSON.stringify({ chore_schedule_id: doneChore, user_id: userId, date: today }) });
    assert.equal(await clamsOf(), 0, 'no bonus while a regular chore is still open');

    // Snoozing the open chore defers it out of today's required set.
    const snoozeRes = await api(`/api/chore-schedules/${openChore}`, {
        method: 'PATCH',
        body: JSON.stringify({ snoozed_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }),
    });
    assert.equal(snoozeRes.status, 200);
    assert.equal(await clamsOf(), 2, 'snoozing the last open chore completes the day');

    // Un-snoozing reopens the chore but never claws the bonus back.
    await api(`/api/chore-schedules/${openChore}`, { method: 'PATCH', body: JSON.stringify({ snoozed_until: '' }) });
    assert.equal(await clamsOf(), 2, 'award-only: un-snooze does not revoke');
});

test('chore schedule persists and updates due_date', async () => {
    const choreRes = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Guest room sheets', description: '', clam_value: 0 }),
    });
    const choreId = choreRes.body.id;

    const createRes = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({ chore_id: choreId, crontab: null, duration: 'day-of', due_date: '2026-07-03' }),
    });
    assert.equal(createRes.status, 200);
    const scheduleId = createRes.body.id;

    const afterCreate = await api(`/api/chore-schedules/${scheduleId}`);
    assert.equal(afterCreate.body.due_date, '2026-07-03');

    const patchRes = await api(`/api/chore-schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ due_date: '' }),
    });
    assert.equal(patchRes.status, 200);

    const afterPatch = await api(`/api/chore-schedules/${scheduleId}`);
    assert.equal(afterPatch.body.due_date, null);
});

test('chore schedule rejects an impossible due_date', async () => {
    const choreRes = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title: 'Bad date chore', description: '', clam_value: 0 }),
    });
    const choreId = choreRes.body.id;

    const createRes = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({ chore_id: choreId, crontab: '0 0 * * *', duration: 'day-of', due_date: '2026-02-30' }),
    });

    assert.equal(createRes.status, 400);
    assert.match(createRes.body.error, /due_date/);
});
