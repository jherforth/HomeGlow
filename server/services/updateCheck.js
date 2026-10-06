// Update check (issue #220): is a newer HomeGlow release out than the one
// running here?
//
// One server-side check, cached, rather than one per display: every kiosk polls
// this, and GitHub allows an unauthenticated address 60 API calls an hour. A
// failed check is remembered for a shorter time so an offline install doesn't
// retry on every poll, and a check can be switched off entirely with
// HOMEGLOW_DISABLE_UPDATE_CHECK=1 for installs that shouldn't call out.

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;

// 'v1.9.1', '1.9.1' or 'v1.9' → [1, 9, 1] / [1, 9, 0]. Anything else — the
// 'sha-abc1234' a latest-test image reports, 'dev', a pre-release — is not a
// release and returns null.
function parseReleaseVersion(version) {
    const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(version ?? '').trim());
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

function isNewerRelease(latest, current) {
    const a = parseReleaseVersion(latest);
    const b = parseReleaseVersion(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
}

function createUpdateChecker({
    repository,
    currentVersion,
    disabled = false,
    fetchImpl = (...args) => fetch(...args),
    now = () => Date.now(),
}) {
    // { latest, releaseUrl, checkedAt } from the last successful check, kept
    // through later failures so a blip doesn't hide a known update.
    let lastRelease = null;
    let nextCheckAt = 0;
    let inFlight = null;

    async function fetchLatestRelease() {
        const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases/latest`, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'HomeGlow update check' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
        const release = await response.json();
        if (!release || typeof release.tag_name !== 'string') throw new Error('No release tag in the response');
        return { latest: release.tag_name, releaseUrl: typeof release.html_url === 'string' ? release.html_url : null };
    }

    async function refresh() {
        try {
            lastRelease = { ...(await fetchLatestRelease()), checkedAt: new Date(now()).toISOString() };
            nextCheckAt = now() + CHECK_INTERVAL_MS;
        } catch (error) {
            console.warn(`Update check failed: ${error.message}`);
            nextCheckAt = now() + RETRY_AFTER_FAILURE_MS;
        }
    }

    async function getStatus() {
        if (disabled) return { enabled: false, current: currentVersion };

        if (now() >= nextCheckAt) {
            // Concurrent polls share one request.
            inFlight = inFlight || refresh().finally(() => { inFlight = null; });
            await inFlight;
        }

        return {
            enabled: true,
            current: currentVersion,
            // Only a release build can be behind; a test build or dev server
            // still reports the latest release but never claims an update.
            isRelease: parseReleaseVersion(currentVersion) !== null,
            latest: lastRelease?.latest ?? null,
            releaseUrl: lastRelease?.releaseUrl ?? null,
            checkedAt: lastRelease?.checkedAt ?? null,
            updateAvailable: lastRelease ? isNewerRelease(lastRelease.latest, currentVersion) : false,
        };
    }

    return { getStatus };
}

module.exports = {
    CHECK_INTERVAL_MS,
    RETRY_AFTER_FAILURE_MS,
    createUpdateChecker,
    isNewerRelease,
    parseReleaseVersion,
};
