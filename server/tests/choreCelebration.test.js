// All-chores-done celebration (issue #140).
//
// The celebration is driven by a new catalog event, chore.allCompleted, emitted
// at the one moment a user's regular-chore list becomes empty for the day. The
// interesting properties are that it fires exactly when the daily bonus is
// newly awarded (so: once per user per day, from any route that can finish
// someone's list) and that it never arrives before the completion that caused it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `chore-celebration-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 8300 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

// The award path checks *today's* due chores, so the tests act on today.
const today = new Date().toISOString().slice(0, 10);

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
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }
        await delay(250);
    }
    throw new Error(`Server did not become ready within ${timeoutMs}ms. Logs:\n${serverLogs}`);
}

async function api(pathname, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { status: response.status, body };
}

// Same SSE reader the plugin platform suite uses.
async function openEventStream() {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/plugin/v1/events/stream`, { signal: controller.signal });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const messages = [];

    (async () => {
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop();
                for (const part of parts) {
                    const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
                    if (dataLine) messages.push(JSON.parse(dataLine.slice('data: '.length)));
                }
            }
        } catch {
            // Aborted — expected on close.
        }
    })();

    return {
        messages,
        close: () => controller.abort(),
        async waitFor(predicate, timeoutMs = 5000) {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                const match = messages.find(predicate);
                if (match) return match;
                await delay(50);
            }
            throw new Error(`Timed out waiting for event. Received: ${JSON.stringify(messages)}`);
        },
    };
}

const createUser = async (username) => (await api('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, email: `${username}@example.com` }),
})).body.id;

// A regular chore is one worth zero clams — those are what the daily bonus
// tracks. Bonus chores (clam_value > 0) are excluded from the "all done" set.
const createSchedule = async (userId, title, clamValue = 0) => {
    const chore = await api('/api/chores', {
        method: 'POST',
        body: JSON.stringify({ title, clam_value: clamValue }),
    });
    const schedule = await api('/api/chore-schedules', {
        method: 'POST',
        body: JSON.stringify({ chore_id: chore.body.id, user_id: userId, duration: 'day-of' }),
    });
    return schedule.body.id;
};

const complete = (scheduleId, userId) => api('/api/chores/complete', {
    method: 'POST',
    body: JSON.stringify({ chore_schedule_id: scheduleId, user_id: userId, date: today }),
});

const uncomplete = (scheduleId, userId) => api('/api/chores/uncomplete', {
    method: 'POST',
    body: JSON.stringify({ chore_schedule_id: scheduleId, user_id: userId, date: today }),
});

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
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
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
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
});

test('chore.allCompleted is in the catalog and a manifest may declare it', async () => {
    // The catalog is the plugin contract; declaring an unknown event rejects
    // the install, so this proves the event is genuinely subscribable.
    const html = `<!DOCTYPE html><html><head>
<script type="application/json" id="homeglow-manifest">
${JSON.stringify({
        manifestVersion: 1,
        id: 'celebration-listener',
        name: 'Celebration Listener',
        version: '1.0.0',
        apiVersion: 'v1',
        events: ['chore.allCompleted'],
    })}
</script></head><body></body></html>`;

    const form = new FormData();
    form.append('file', new Blob([html], { type: 'text/html' }), 'celebration-listener.html');
    const upload = await fetch(`${baseUrl}/api/widgets/upload`, { method: 'POST', body: form });

    assert.equal(upload.status, 200, await upload.text());
});

test('finishing the last regular chore fires chore.allCompleted with the bonus amount', async () => {
    const stream = await openEventStream();
    try {
        const userId = await createUser(`celebrate-${process.pid}`);
        const first = await createSchedule(userId, 'Make bed');
        const second = await createSchedule(userId, 'Feed cat');

        await complete(first, userId);
        // One still open — the day is not done, so nothing should fire.
        await delay(400);
        assert.equal(
            stream.messages.some((m) => m.event === 'chore.allCompleted' && m.payload.userId === userId),
            false,
            'fired while a regular chore was still open',
        );

        await complete(second, userId);

        const done = await stream.waitFor((m) => m.event === 'chore.allCompleted' && m.payload.userId === userId);
        assert.equal(done.payload.username, `celebrate-${process.pid}`);
        assert.equal(done.payload.date, today);
        // Matches the default daily_completion_clam_reward.
        assert.equal(done.payload.reward, 2);
        assert.equal(typeof done.emittedAt, 'string');
    } finally {
        stream.close();
    }
});

test('the completion that finished the day is announced before the day itself', async () => {
    // A plugin counting completions must not be told "all done" while the chore
    // that finished the list is still unannounced.
    const stream = await openEventStream();
    try {
        const userId = await createUser(`ordering-${process.pid}`);
        const only = await createSchedule(userId, 'Only chore');

        await complete(only, userId);
        await stream.waitFor((m) => m.event === 'chore.allCompleted' && m.payload.userId === userId);

        const completedIndex = stream.messages.findIndex(
            (m) => m.event === 'chore.completed' && m.payload.userId === userId
        );
        const allDoneIndex = stream.messages.findIndex(
            (m) => m.event === 'chore.allCompleted' && m.payload.userId === userId
        );

        assert.ok(completedIndex >= 0, 'chore.completed was not delivered');
        assert.ok(
            completedIndex < allDoneIndex,
            `chore.completed (${completedIndex}) must precede chore.allCompleted (${allDoneIndex})`,
        );
    } finally {
        stream.close();
    }
});

test('it fires once per day, not again for a bonus chore completed afterwards', async () => {
    const stream = await openEventStream();
    try {
        const userId = await createUser(`once-${process.pid}`);
        const regular = await createSchedule(userId, 'Tidy room');
        const bonus = await createSchedule(userId, 'Extra: wash car', 5);

        await complete(regular, userId);
        await stream.waitFor((m) => m.event === 'chore.allCompleted' && m.payload.userId === userId);

        // A bonus chore is outside the regular set, so completing it must not
        // re-award the daily bonus and must not celebrate again.
        await complete(bonus, userId);
        await delay(500);

        const fired = stream.messages.filter(
            (m) => m.event === 'chore.allCompleted' && m.payload.userId === userId
        );
        assert.equal(fired.length, 1, `expected exactly one celebration, got ${fired.length}`);
    } finally {
        stream.close();
    }
});

test('undoing and redoing the last chore celebrates again, matching the bonus', async () => {
    // Uncompleting revokes the daily bonus, so re-completing genuinely re-earns
    // it. The celebration tracks the bonus rather than trying to be cleverer.
    const stream = await openEventStream();
    try {
        const userId = await createUser(`redo-${process.pid}`);
        const only = await createSchedule(userId, 'Sweep');

        await complete(only, userId);
        await stream.waitFor((m) => m.event === 'chore.allCompleted' && m.payload.userId === userId);

        await uncomplete(only, userId);
        await complete(only, userId);

        const start = Date.now();
        let fired = [];
        while (Date.now() - start < 5000) {
            fired = stream.messages.filter(
                (m) => m.event === 'chore.allCompleted' && m.payload.userId === userId
            );
            if (fired.length >= 2) break;
            await delay(50);
        }
        assert.equal(fired.length, 2, 're-earning the bonus should celebrate again');
    } finally {
        stream.close();
    }
});

test('the reward in the payload follows the household setting', async () => {
    await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'daily_completion_clam_reward', value: '7' }),
    });

    const stream = await openEventStream();
    try {
        const userId = await createUser(`reward-${process.pid}`);
        const only = await createSchedule(userId, 'Dishes');
        await complete(only, userId);

        const done = await stream.waitFor((m) => m.event === 'chore.allCompleted' && m.payload.userId === userId);
        assert.equal(done.payload.reward, 7, 'payload must reflect the configured reward, not a hardcoded 2');
    } finally {
        stream.close();
        await api('/api/settings', {
            method: 'POST',
            body: JSON.stringify({ key: 'daily_completion_clam_reward', value: '2' }),
        });
    }
});

test('a user with no chores today never celebrates', async () => {
    const stream = await openEventStream();
    try {
        const userId = await createUser(`idle-${process.pid}`);
        // Someone else finishing their list must not celebrate for this user.
        const otherId = await createUser(`busy-${process.pid}`);
        const only = await createSchedule(otherId, 'Their chore');
        await complete(only, otherId);
        await stream.waitFor((m) => m.event === 'chore.allCompleted' && m.payload.userId === otherId);

        assert.equal(
            stream.messages.some((m) => m.event === 'chore.allCompleted' && m.payload.userId === userId),
            false,
            'an empty list is not an achievement',
        );
    } finally {
        stream.close();
    }
});
