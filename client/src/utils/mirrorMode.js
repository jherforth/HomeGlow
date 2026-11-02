// Remote-control mirror mode: the URL hash form, and the viewport reporter
// that gives the mirror its target size.
//
// Mirror URLs look like `#/mirror/<encoded device name>`. The hash is the
// launch/restore mechanism only — app.jsx owns the live mirror state, and
// the banner on screen is the source of truth while mirroring, not the URL.

export const buildMirrorHash = (deviceName) => `#/mirror/${encodeURIComponent(deviceName)}`;

export const parseMirrorHash = (hash) => {
    if (typeof hash !== 'string') return null;
    const match = /^#\/mirror\/([^/]+)\/?$/.exec(hash);
    if (!match) return null;
    try {
        const name = decodeURIComponent(match[1]);
        return name ? name : null;
    } catch {
        return null;
    }
};

export const isMirrorHash = (hash) => parseMirrorHash(hash) !== null;

// Fallback size for a target that has never reported a viewport. 1280x800
// is the kiosk regression size the repo already documents
// (docs/architecture/mobile-experience.md), so it is the least surprising
// stand-in until the target's dashboard reports its real size.
export const MIRROR_FALLBACK_VIEWPORT = { width: 1280, height: 800, devicePixelRatio: 1 };

export const viewportSizesEqual = (a, b) => Boolean(
    a && b && a.width === b.width && a.height === b.height
    && (a.devicePixelRatio || 1) === (b.devicePixelRatio || 1),
);

// Debounced, on-change-only viewport reporter. `send` fires at most once
// per quiet window, and never for a size identical to the last one sent —
// so a display resizing (or a resize loop) cannot spam the server, and the
// server side never bumps on these reports, so no refetch loop is possible
// from this side either. `report` is safe to call on every resize event.
export const createViewportReporter = (send, debounceMs = 500) => {
    let timer = null;
    let pending = null;
    let lastSent = null;

    const flush = () => {
        timer = null;
        if (!pending || viewportSizesEqual(pending, lastSent)) {
            pending = null;
            return;
        }
        const toSend = pending;
        pending = null;
        lastSent = toSend;
        send(toSend);
    };

    return {
        report(size) {
            if (!size || !Number.isInteger(size.width) || size.width <= 0
                || !Number.isInteger(size.height) || size.height <= 0) {
                return;
            }
            const normalized = {
                width: size.width,
                height: size.height,
                devicePixelRatio: size.devicePixelRatio || 1,
            };
            if (viewportSizesEqual(normalized, lastSent) || viewportSizesEqual(normalized, pending)) {
                return;
            }
            pending = normalized;
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(flush, debounceMs);
        },
        cancel() {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            pending = null;
        },
    };
};
