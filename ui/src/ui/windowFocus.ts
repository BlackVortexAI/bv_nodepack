const windows: HTMLElement[] = [];
let listening = false;

const visible = (node: HTMLElement) => node.isConnected && !node.hidden && node.offsetParent !== null;
const syncLayers = () => windows.forEach((node,index) => node.style.zIndex=`calc(var(--bv-layer-window) + ${index})`);

function cycle(reverse: boolean) {
    const available = windows.filter(visible);
    if (available.length < 2) return;
    const active = document.activeElement instanceof Element ? available.findIndex(node => node === document.activeElement || node.contains(document.activeElement)) : -1;
    const next = active < 0 ? available.length - 1 : (active + (reverse ? -1 : 1) + available.length) % available.length;
    available[next].dispatchEvent(new CustomEvent("bv-ui-activate"));
}

function ensureListener() {
    if (listening) return;
    listening = true;
    window.addEventListener("keydown", event => {
        if (event.key !== "Tab" || !event.ctrlKey || event.altKey || event.metaKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        cycle(event.shiftKey);
    }, true);
}

export function registerBvWindow(node: HTMLElement) {
    ensureListener();
    windows.push(node);
    syncLayers();
    return () => { const index = windows.indexOf(node); if (index >= 0) windows.splice(index, 1); syncLayers(); };
}

export function activateBvWindow(node: HTMLElement) {
    const index = windows.indexOf(node);
    if (index >= 0) windows.splice(index, 1);
    windows.push(node);
    syncLayers();
}
