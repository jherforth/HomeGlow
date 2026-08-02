// Two-phase backfill test for schema migration 20 (chore_history.kind):
// 1) boot a fresh server (migrates to latest), stop it;
// 2) surgically revert the DB to schema 19 (drop kind + its indexes, reset the
//    schema id) and insert pre-migration magic-string fixture rows;
// 3) boot again — migration 20 re-runs — and assert each row's backfilled kind.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const serverDir = path.resolve(__dirname, '..');
const tmpDir = path.resolve(__dirname, '.tmp');
const testDbPath = path.join(tmpDir, `kind-migration-${process.pid}-${Date.now()}.db`);
const keepTestArtifacts = process.env.HOMEGLOW_TEST_KEEP_ARTIFACTS === '1';
const port = 6500 + Math.floor(Math.random() * 300);
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

function startServer() {
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
    return waitForServerReady();
}

async function stopServer() {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
        await new Promise((resolve) => {
            serverProcess.once('close', () => resolve());
            setTimeout(resolve, 5000);
        });
    }
}

test.after(async () => {
    await stopServer();
    if (!keepTestArtifacts) {
        for (const suffix of ['', '-shm', '-wal', '-journal']) {
            const filePath = `${testDbPath}${suffix}`;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
});

test('migration 20 backfills kind from the magic-string heuristics', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    // Phase 1: fresh boot migrates to latest.
    await startServer();
    await stopServer();

    // Phase 2: revert to schema 19 and plant pre-migration fixture rows.
    const db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');
    db.exec('DROP INDEX IF EXISTS idx_chore_history_missed_unique');
    db.exec('DROP INDEX IF EXISTS idx_chore_history_kind');
    db.exec('ALTER TABLE chore_history DROP COLUMN kind');
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('19', 'SYSTEM_SCHEMA_ID');

    const userId = db.prepare("INSERT INTO users (username, email) VALUES ('fixture-kid', 'f@example.com')").run().lastInsertRowid;
    const choreId = db.prepare("INSERT INTO chores (title, clam_value) VALUES ('Dishes', 0)").run().lastInsertRowid;
    const scheduleId = db.prepare('INSERT INTO chore_schedules (chore_id, user_id, visible) VALUES (?, ?, 1)').run(choreId, userId).lastInsertRowid;

    const insert = db.prepare('INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value, title) VALUES (?, ?, ?, ?, ?)');
    const fixtures = [
        // [schedule, title, clam, expectedKind]
        [scheduleId, 'Dishes', 0, 'completion'],            // real completion
        [null, 'Regular chores', 2, 'daily_bonus'],         // daily bonus
        [scheduleId, 'Transfer bonus', 3, 'transfer_bonus'],// transfer payout
        [null, 'Adjustment', 5, 'adjustment'],              // manual add
        [null, null, 7, 'adjustment'],                      // legacy migrateClamsToHistory balance import
        [null, 'Brush teeth', 0, 'completion'],             // demo-style NULL-schedule completion
    ];
    const ids = fixtures.map(([schedule, title, clam]) =>
        insert.run(userId, schedule, '2026-07-01', clam, title).lastInsertRowid
    );
    db.close();

    // Phase 3: boot again — migration 20 re-runs against the fixture data.
    await startServer();
    const response = await fetch(`${baseUrl}/api/chore-history/user/${userId}`);
    assert.equal(response.status, 200);
    const rows = await response.json();

    fixtures.forEach(([schedule, title, clam, expectedKind], index) => {
        const row = rows.find((r) => r.id === ids[index]);
        assert.ok(row, `fixture row ${index} present`);
        assert.equal(
            row.kind,
            expectedKind,
            `fixture ${index} (title=${title}, schedule=${schedule}, clam=${clam}) → ${expectedKind}, got ${row.kind}`
        );
    });
});
