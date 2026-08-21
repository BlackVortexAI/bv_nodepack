export const MAX_EXTERNAL_DETECTORS = 10;
export const visibleExternalDetectorSlots = (connected: number[], maximum = MAX_EXTERNAL_DETECTORS) => {
    const valid = [...new Set(connected.filter(index => Number.isInteger(index) && index >= 1 && index <= maximum))];
    const lastConnected = valid.length ? Math.max(...valid) : 0;
    const visibleThrough = Math.min(maximum, lastConnected + 1);
    return Array.from({ length: Math.max(1, visibleThrough) }, (_, index) => index + 1);
};
