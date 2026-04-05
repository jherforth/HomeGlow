const DEVICE_NAME_STORAGE_KEY = 'homeglow_device_name';

const generateDeviceName = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export const getDeviceName = () => {
    let deviceName = localStorage.getItem(DEVICE_NAME_STORAGE_KEY);

    if (!deviceName) {
        deviceName = generateDeviceName();
        localStorage.setItem(DEVICE_NAME_STORAGE_KEY, deviceName);
    }

    return deviceName;
};

export const setDeviceName = (deviceName) => {
    localStorage.setItem(DEVICE_NAME_STORAGE_KEY, deviceName);
};

export const getDeviceApiBase = (apiBaseUrl) => {
    const deviceName = getDeviceName();
    return `${apiBaseUrl}/api/devices/${encodeURIComponent(deviceName)}`;
};
