const DEVICE_GUID_STORAGE_KEY = 'homeglow_device_guid';

const generateDeviceGuid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export const getDeviceGuid = () => {
    let deviceGuid = localStorage.getItem(DEVICE_GUID_STORAGE_KEY);

    if (!deviceGuid) {
        deviceGuid = generateDeviceGuid();
        localStorage.setItem(DEVICE_GUID_STORAGE_KEY, deviceGuid);
    }

    return deviceGuid;
};

export const getDeviceApiBase = (apiBaseUrl) => {
    const deviceGuid = getDeviceGuid();
    return `${apiBaseUrl}/api/devices/${encodeURIComponent(deviceGuid)}`;
};
