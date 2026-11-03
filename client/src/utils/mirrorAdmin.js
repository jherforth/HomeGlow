// Mirror-Admin Devices rows: which controls a row offers. The "Current"
// identity is always this browser's own device, even in mirror-Admin —
// rename, the delete guard, and the copy destination all mean the phone,
// never the target — while device-scoped SETTINGS writes route to the
// target. The one exception the mirror banner makes visible: the target
// row offers no delete while mirroring, so the display being driven
// cannot be deleted from its own management view.
//
// Pure function (no DOM, no i18n) so the rule is vitest-pinned; the
// Devices section renders from exactly these flags.
export const getDeviceRowState = (deviceName, { currentDeviceName, mirrorTarget }) => {
    const isCurrent = deviceName === currentDeviceName;
    const isTarget = mirrorTarget != null && deviceName === mirrorTarget;
    return {
        isCurrent,
        isTarget,
        // Copy and remote-control keep their existing rule: offered on
        // every row except this browser's own.
        showCopy: !isCurrent,
        showRemote: !isCurrent,
        // Delete keeps its existing rule outside mirror mode (every
        // non-current row, disabled on the current row — the caller
        // renders the disabled button for isCurrent). In mirror mode the
        // target row offers no delete at all.
        showDelete: !isCurrent && !isTarget,
    };
};
