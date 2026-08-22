import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

type BvViewRenderer = (close: () => void, activationToken: number) => ReactNode;
type WindowTransferState={mode:"workspace"|"floating";geometry?:{x:number;y:number;width:number;height:number}};
type MountedView = { activate: (render?: BvViewRenderer) => void; minimize: () => void; state: () => WindowTransferState; setState: (state:WindowTransferState) => void; close: () => void };
const mountedViews = new Map<string, MountedView>();
const pendingStates = new Map<string,WindowTransferState>();

/** Mounts a framework view for imperative ComfyUI entry points without duplicating controls. */
export function mountBvView(render: BvViewRenderer, options: { key?: string } = {}) {
    const existing = options.key ? mountedViews.get(options.key) : undefined;
    if (existing) {
        existing.activate(render);
        return existing.close;
    }
    const host = document.createElement("div");
    host.className = "bv-ui";
    host.dataset.bvUiMount = "true";
    document.body.append(host);
    const root = createRoot(host);
    let closed = false;
    let activationToken = 0;
    let currentRender = render;
    const close = () => {
        if (closed) return;
        closed = true;
        if (options.key && mountedViews.get(options.key)?.close === close) mountedViews.delete(options.key);
        root.unmount();
        host.remove();
    };
    const activate = (nextRender?: BvViewRenderer) => {
        if (nextRender) currentRender = nextRender;
        activationToken += 1;
        document.body.append(host);
        host.querySelector<HTMLElement>(".bv-managed-window")?.dispatchEvent(new Event("bv-ui-activate"));
        root.render(currentRender(close, activationToken));
    };
    const minimize = () => host.querySelector<HTMLElement>(".bv-managed-window")?.dispatchEvent(new Event("bv-ui-minimize"));
    const state = ():WindowTransferState => {const shell=host.querySelector<HTMLElement>(".bv-managed-window"),box=shell?.getBoundingClientRect();return {mode:shell?.classList.contains("workspace")?"workspace":"floating",geometry:box?{x:box.left,y:box.top,width:box.width,height:box.height}:undefined}};
    const setState = (next:WindowTransferState) => host.querySelector<HTMLElement>(".bv-managed-window")?.dispatchEvent(new CustomEvent("bv-ui-set-window-state",{detail:next}));
    if (options.key) {
        const mounted={ activate, minimize, state, setState, close };
        mountedViews.set(options.key, mounted);
        const pending=pendingStates.get(options.key);
        if(pending){pendingStates.delete(options.key);requestAnimationFrame(()=>mounted.setState(pending));}
    }
    root.render(currentRender(close, activationToken));
    return close;
}

export function switchBvView(currentKey: string, targetKey: string, openTarget: () => void, replaceCurrent: boolean) {
    if (currentKey === targetKey) return mountedViews.get(currentKey)?.activate();
    const current = mountedViews.get(currentKey);
    const currentState=current?.state();
    const target = mountedViews.get(targetKey);
    if(currentState)pendingStates.set(targetKey,currentState);
    target ? target.activate() : openTarget();
    if(currentState&&target){pendingStates.delete(targetKey);requestAnimationFrame(()=>target.setState(currentState));}
    if (replaceCurrent) current?.close(); else current?.minimize();
}
