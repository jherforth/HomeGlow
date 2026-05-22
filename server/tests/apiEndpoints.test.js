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
