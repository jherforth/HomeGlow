// Prize store (spending mechanism): the request-queue lifecycle.
// prizes = definitions ledger; prize_offers = one-time redeemable instances.
// available → requested (kid) → redeemed (parent approves; clams deducted,
// offer leaves the store). Decline/cancel returns requested → available.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `prize-store-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 6800 + Math.floor(Math.random() * 300);
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

let kidId;
let richKidId;
let prizeId;

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

    // Shared fixtures.
    kidId = (await api('/api/users', { method: 'POST', body: JSON.stringify({ username: 'store-kid', email: 'k@example.com' }) })).body.id;
    richKidId = (await api('/api/users', { method: 'POST', body: JSON.stringify({ username: 'rich-kid', email: 'r@example.com' }) })).body.id;
    await api(`/api/users/${richKidId}/clams/add`, { method: 'POST', body: JSON.stringify({ amount: 100 }) });
    prizeId = (await api('/api/prizes', { method: 'POST', body: JSON.stringify({ name: 'Lego set', clam_cost: 40 }) })).body.id;
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

test('parent stocks the store from the prize ledger; definition survives', async () => {
    const offer = await api('/api/prize-offers', { method: 'POST', body: JSON.stringify({ prize_id: prizeId }) });
    assert.equal(offer.status, 200);

    const store = await api('/api/prize-offers');
    assert.equal(store.body.length, 1);
    assert.equal(store.body[0].name, 'Lego set');
    assert.equal(store.body[0].clam_cost, 40);
    assert.equal(store.body[0].status, 'available');

    // Unknown prize rejected.
    assert.equal((await api('/api/prize-offers', { method: 'POST', body: JSON.stringify({ prize_id: 9999 }) })).status, 404);
});

test('request queue: kid requests, only once; cancel and decline return it to the shelf', async () => {
    const offerId = (await api('/api/prize-offers')).body[0].id;

    const req = await api(`/api/prize-offers/${offerId}/request`, { method: 'POST', body: JSON.stringify({ user_id: richKidId }) });
    assert.equal(req.status, 200);

    // Second kid can't request an already-requested offer.
    const conflict = await api(`/api/prize-offers/${offerId}/request`, { method: 'POST', body: JSON.stringify({ user_id: kidId }) });
    assert.equal(conflict.status, 409);

    let store = (await api('/api/prize-offers')).body;
    assert.equal(store[0].status, 'requested');
    assert.equal(store[0].requested_by_name, 'rich-kid');

    // Cancel → available again; decline path behaves identically.
    await api(`/api/prize-offers/${offerId}/cancel-request`, { method: 'POST' });
    store = (await api('/api/prize-offers')).body;
    assert.equal(store[0].status, 'available');
    assert.equal(store[0].requested_by, null);

    await api(`/api/prize-offers/${offerId}/request`, { method: 'POST', body: JSON.stringify({ user_id: richKidId }) });
    await api(`/api/prize-offers/${offerId}/decline`, { method: 'POST' });
    assert.equal((await api('/api/prize-offers')).body[0].status, 'available');
});

test('approval blocks on insufficient clams and leaves the request pending', async () => {
    const offerId = (await api('/api/prize-offers')).body[0].id;
    await api(`/api/prize-offers/${offerId}/request`, { method: 'POST', body: JSON.stringify({ user_id: kidId }) });

    const approve = await api(`/api/prize-offers/${offerId}/approve`, { method: 'POST' });
    assert.equal(approve.status, 400);
    assert.match(approve.body.error, /Insufficient clams/);
    assert.equal((await api('/api/prize-offers')).body[0].status, 'requested', 'request stays pending so the parent sees why');

    await api(`/api/prize-offers/${offerId}/cancel-request`, { method: 'POST' });
});

test('approval redeems once: clams deducted with the prize name, offer leaves the store, ledger intact', async () => {
    const offerId = (await api('/api/prize-offers')).body[0].id;
    await api(`/api/prize-offers/${offerId}/request`, { method: 'POST', body: JSON.stringify({ user_id: richKidId }) });

    const approve = await api(`/api/prize-offers/${offerId}/approve`, { method: 'POST' });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.clam_total, 60);
    assert.equal(approve.body.prize, 'Lego set');

    // One-time: gone from the store; a second approval is a 409.
    assert.equal((await api('/api/prize-offers')).body.length, 0);
    assert.equal((await api(`/api/prize-offers/${offerId}/approve`, { method: 'POST' })).status, 409);

    // Ledger row names the prize; definitions ledger untouched.
    const history = (await api(`/api/chore-history/user/${richKidId}`)).body;
    const spent = history.find((r) => r.kind === 'spent');
    assert.equal(spent.title, 'Lego set');
    assert.equal(spent.clam_value, -40);
    const prizes = (await api('/api/prizes')).body;
    assert.ok(prizes.some((p) => p.id === prizeId), 'prize definition retained in management');
});

test('avatar quick-spend: reduce accepts a title note', async () => {
    const reduce = await api(`/api/users/${richKidId}/clams/reduce`, {
        method: 'POST',
        body: JSON.stringify({ amount: 5, title: 'Toy store' }),
    });
    assert.equal(reduce.status, 200);
    const history = (await api(`/api/chore-history/user/${richKidId}`)).body;
    const row = history.find((r) => r.kind === 'spent' && r.title === 'Toy store');
    assert.ok(row, 'quick-spend note recorded');
    assert.equal(row.clam_value, -5);
});

test('prize.redeemed is delivered over the event stream', async () => {
    // Fresh offer + request, stream open during approval.
    const offerId = (await api('/api/prize-offers', { method: 'POST', body: JSON.stringify({ prize_id: prizeId }) })).body.id;
    await api(`/api/prize-offers/${offerId}/request`, { method: 'POST', body: JSON.stringify({ user_id: richKidId }) });

    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/plugin/v1/events/stream`, { signal: controller.signal });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const messages = [];
    let buffer = '';
    const pump = (async () => {
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop();
                for (const part of parts) {
                    const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
                    if (dataLine) messages.push(JSON.parse(dataLine.slice(6)));
                }
            }
        } catch { /* aborted */ }
    })();

    await api(`/api/prize-offers/${offerId}/approve`, { method: 'POST' });
    const start = Date.now();
    let redeemed = null;
    while (Date.now() - start < 5000 && !redeemed) {
        redeemed = messages.find((m) => m.event === 'prize.redeemed');
        if (!redeemed) await delay(50);
    }
    controller.abort();
    await pump;

    assert.ok(redeemed, 'prize.redeemed event received');
    assert.equal(redeemed.payload.userId, richKidId);
    assert.equal(redeemed.payload.prizeName, 'Lego set');
    assert.equal(redeemed.payload.cost, 40);
    assert.equal(typeof redeemed.payload.newTotal, 'number');
});
