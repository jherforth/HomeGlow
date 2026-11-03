// Mirror-Admin Devices rows: which controls a row offers. The Devices
// section renders copy/remote/delete from exactly these flags, except
// that the current row keeps its disabled delete button (showDelete is
// false there, and the section renders it via the isCurrent branch).
// These cases pin what the user sees: the phone keeps Current, the
// target gains Target and loses delete, everything else is unchanged.
import { describe, it, expect } from 'vitest';
import { getDeviceRowState, getMirrorAdminBannerTarget } from './mirrorAdmin.js';

const PHONE = 'Adam HomeGlow app';
const WALL = 'Kitchen Wall Display';
const OTHER = "Adam's phone desktop view";

describe('mirror-Admin Devices rows', () => {
    it('outside mirror mode: current row keeps Current + disabled delete, others offer copy/remote/delete', () => {
        const current = getDeviceRowState(PHONE, { currentDeviceName: PHONE, mirrorTarget: null });
        expect(current).toEqual({ isCurrent: true, isTarget: false, showCopy: false, showRemote: false, showDelete: false });

        const other = getDeviceRowState(OTHER, { currentDeviceName: PHONE, mirrorTarget: null });
        expect(other).toEqual({ isCurrent: false, isTarget: false, showCopy: true, showRemote: true, showDelete: true });
    });

    it('in mirror mode: phone row unchanged (Current, no copy/remote), target row gains Target and loses delete', () => {
        const current = getDeviceRowState(PHONE, { currentDeviceName: PHONE, mirrorTarget: WALL });
        expect(current).toEqual({ isCurrent: true, isTarget: false, showCopy: false, showRemote: false, showDelete: false });

        const target = getDeviceRowState(WALL, { currentDeviceName: PHONE, mirrorTarget: WALL });
        expect(target).toEqual({ isCurrent: false, isTarget: true, showCopy: true, showRemote: true, showDelete: false });
    });

    it('in mirror mode: a third row is unaffected (copy/remote/delete all offered)', () => {
        const other = getDeviceRowState(OTHER, { currentDeviceName: PHONE, mirrorTarget: WALL });
        expect(other).toEqual({ isCurrent: false, isTarget: false, showCopy: true, showRemote: true, showDelete: true });
    });

    it('the target is only a target while mirroring: same row outside mirror mode offers delete again', () => {
        const inMirror = getDeviceRowState(WALL, { currentDeviceName: PHONE, mirrorTarget: WALL });
        expect(inMirror.showDelete).toBe(false);
        const exited = getDeviceRowState(WALL, { currentDeviceName: PHONE, mirrorTarget: null });
        expect(exited).toEqual({ isCurrent: false, isTarget: false, showCopy: true, showRemote: true, showDelete: true });
    });
});

describe('mirror-Admin banner above the panel', () => {
    it('shows the target exactly when Admin is open while mirroring', () => {
        expect(getMirrorAdminBannerTarget({ showAdminPanel: true, mirrorTarget: WALL })).toBe(WALL);
    });

    it('shows nothing when Admin is closed, even while mirroring', () => {
        expect(getMirrorAdminBannerTarget({ showAdminPanel: false, mirrorTarget: WALL })).toBeNull();
    });

    it('shows nothing when Admin is open outside mirror mode', () => {
        expect(getMirrorAdminBannerTarget({ showAdminPanel: true, mirrorTarget: null })).toBeNull();
        expect(getMirrorAdminBannerTarget({ showAdminPanel: true, mirrorTarget: undefined })).toBeNull();
    });

    it('shows nothing when neither Admin nor a mirror is active', () => {
        expect(getMirrorAdminBannerTarget({ showAdminPanel: false, mirrorTarget: null })).toBeNull();
    });
});
