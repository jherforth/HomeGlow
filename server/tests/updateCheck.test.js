// Update check (issue #220): compares the running version with GitHub's latest
// release, once per interval for the whole server.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CHECK_INTERVAL_MS,
    RETRY_AFTER_FAILURE_MS,
    createUpdateChecker,
    isNewerRelease,
    parseReleaseVersion,
} = require('../services/updateCheck');

const quietly = async (fn) => {
    const warn = console.warn;
    console.warn = () => {};
    try { return await fn(); } finally { console.warn = warn; }
};

// A GitHub stand-in that records each call and answers with `release`, or
// fails when `release` is an Error.
function fakeGitHub(release) {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        if (fake.release instanceof Error) throw fake.release;
        if (fake.release === 403) return { ok: false, status: 403, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => fake.release };
    };
    const fake = { calls, fetchImpl, release };
    return fake;
}

const release = (tag) => ({ tag_name: tag, html_url: `https://github.com/jherforth/HomeGlow/releases/tag/${tag}` });

test('release versions parse with or without the v and the patch number', () => {
    assert.deepEqual(parseReleaseVersion('v1.9.1'), [1, 9, 1]);
    assert.deepEqual(parseReleaseVersion('1.10.0'), [1, 10, 0]);
    assert.deepEqual(parseReleaseVersion('v1.9'), [1, 9, 0]);
    for (const notARelease of ['sha-1fca161', 'dev', '', null, 'v1.10.0-rc1', 'test-backend-version']) {
        assert.equal(parseReleaseVersion(notARelease), null, String(notARelease));
    }
});

test('a newer release is compared by number, not as text', () => {
    assert.equal(isNewerRelease('v1.10.0', 'v1.9.1'), true);
    assert.equal(isNewerRelease('v1.9.2', 'v1.9.1'), true);
    assert.equal(isNewerRelease('v2.0', 'v1.12.4'), true);
    assert.equal(isNewerRelease('v1.9.1', 'v1.9.1'), false);
    assert.equal(isNewerRelease('v1.9', 'v1.9.0'), false);
    assert.equal(isNewerRelease('v1.9.0', 'v1.9.1'), false);
    // Nothing to compare against on a test build.
    assert.equal(isNewerRelease('v1.10.0', 'sha-1fca161'), false);
});

test('reports an update when GitHub has a newer release', async () => {
    const github = fakeGitHub(release('v1.10.0'));
    const checker = createUpdateChecker({ repository: 'jherforth/HomeGlow', currentVersion: 'v1.9.1', fetchImpl: github.fetchImpl });

    const status = await checker.getStatus();
    assert.equal(github.calls[0], 'https://api.github.com/repos/jherforth/HomeGlow/releases/latest');
    assert.equal(status.enabled, true);
    assert.equal(status.current, 'v1.9.1');
    assert.equal(status.latest, 'v1.10.0');
    assert.equal(status.updateAvailable, true);
    assert.equal(status.isRelease, true);
    assert.equal(status.releaseUrl, 'https://github.com/jherforth/HomeGlow/releases/tag/v1.10.0');
    assert.ok(status.checkedAt);
});

test('reports no update on the latest release, and none on a test build', async () => {
    const upToDate = createUpdateChecker({
        repository: 'jherforth/HomeGlow', currentVersion: 'v1.9.1', fetchImpl: fakeGitHub(release('v1.9.1')).fetchImpl,
    });
    assert.equal((await upToDate.getStatus()).updateAvailable, false);

    const testBuild = await createUpdateChecker({
        repository: 'jherforth/HomeGlow', currentVersion: 'sha-1fca161', fetchImpl: fakeGitHub(release('v1.9.1')).fetchImpl,
    }).getStatus();
    assert.equal(testBuild.updateAvailable, false);
    assert.equal(testBuild.isRelease, false);
    assert.equal(testBuild.latest, 'v1.9.1', 'still says what the latest release is');
});

test('asks GitHub once per interval, however many displays poll', async () => {
    let clock = 1_000_000;
    const github = fakeGitHub(release('v1.10.0'));
    const checker = createUpdateChecker({
        repository: 'jherforth/HomeGlow', currentVersion: 'v1.9.1', fetchImpl: github.fetchImpl, now: () => clock,
    });

    await Promise.all([checker.getStatus(), checker.getStatus(), checker.getStatus()]);
    await checker.getStatus();
    assert.equal(github.calls.length, 1, 'concurrent and repeat polls share one request');

    clock += CHECK_INTERVAL_MS;
    github.release = release('v1.10.1');
    assert.equal((await checker.getStatus()).latest, 'v1.10.1');
    assert.equal(github.calls.length, 2);
});

test('a failed check keeps the last known release and retries sooner', async () => {
    let clock = 1_000_000;
    const github = fakeGitHub(release('v1.10.0'));
    const checker = createUpdateChecker({
        repository: 'jherforth/HomeGlow', currentVersion: 'v1.9.1', fetchImpl: github.fetchImpl, now: () => clock,
    });
    await checker.getStatus();

    clock += CHECK_INTERVAL_MS;
    github.release = new Error('getaddrinfo ENOTFOUND api.github.com');
    const afterFailure = await quietly(() => checker.getStatus());
    assert.equal(afterFailure.updateAvailable, true, 'a blip does not hide a known update');
    assert.equal(afterFailure.latest, 'v1.10.0');

    // Not retried on every poll...
    await checker.getStatus();
    assert.equal(github.calls.length, 2);
    // ...but well before the full interval.
    clock += RETRY_AFTER_FAILURE_MS;
    github.release = release('v1.10.1');
    assert.equal((await checker.getStatus()).latest, 'v1.10.1');
    assert.equal(github.calls.length, 3);
});

test('a server that has never reached GitHub reports nothing, not an error', async () => {
    for (const failure of [new Error('offline'), 403, { message: 'Not Found' }]) {
        const status = await quietly(() => createUpdateChecker({
            repository: 'jherforth/HomeGlow', currentVersion: 'v1.9.1', fetchImpl: fakeGitHub(failure).fetchImpl,
        }).getStatus());
        assert.equal(status.enabled, true);
        assert.equal(status.latest, null);
        assert.equal(status.updateAvailable, false);
    }
});

test('a disabled check never calls out', async () => {
    const github = fakeGitHub(release('v1.10.0'));
    const status = await createUpdateChecker({
        repository: 'jherforth/HomeGlow', currentVersion: 'v1.9.1', disabled: true, fetchImpl: github.fetchImpl,
    }).getStatus();
    assert.deepEqual(status, { enabled: false, current: 'v1.9.1' });
    assert.equal(github.calls.length, 0);
});
