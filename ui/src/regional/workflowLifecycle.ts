type Scheduler = (callback: () => void, milliseconds: number) => unknown;
type Canceller = (handle: unknown) => void;
type WorkflowEventSource = {
    addEventListener(type: string, callback: (event: any) => void): void;
    removeEventListener(type: string, callback: (event: any) => void): void;
};

export function activeWorkflowIdentity(app: any): unknown {
    return app?.extensionManager?.workflow?.activeWorkflow
        ?? app?.workflowManager?.activeWorkflow
        ?? app?.graph
        ?? null;
}

export function watchActiveWorkflow(
    app: any,
    api: WorkflowEventSource,
    onWorkflowChanged: () => void,
    schedule: Scheduler = (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
    cancel: Canceller = handle => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
): () => void {
    const initial = activeWorkflowIdentity(app);
    let changed = false;
    const check = () => {
        if (changed || activeWorkflowIdentity(app) === initial) return;
        changed = true;
        onWorkflowChanged();
    };
    api.addEventListener("graphChanged", check);
    const interval = schedule(check, 250);
    return () => {
        api.removeEventListener("graphChanged", check);
        cancel(interval);
    };
}
