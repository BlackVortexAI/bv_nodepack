type Scheduler = (callback: () => void, milliseconds: number) => unknown;
type Canceller = (handle: unknown) => void;
type WorkflowEventSource = {
    addEventListener(type: string, callback: (event: any) => void): void;
    removeEventListener(type: string, callback: (event: any) => void): void;
};

export function activeWorkflowIdentity(app: any): unknown {
    const workflow=app?.extensionManager?.workflow?.activeWorkflow
        ?? app?.workflowManager?.activeWorkflow
        ?? null;
    if(workflow&&typeof workflow==="object"){
        for(const field of ["key","id","workflowId","workflow_id","uuid","path"]){const value=workflow[field];if(value!=null&&String(value))return `${field}:${String(value)}`;}
        return workflow;
    }
    return app?.canvas?.graph??app?.graph??workflow;
}

export function watchActiveWorkflow(
    app: any,
    api: WorkflowEventSource,
    onWorkflowChanged: () => void,
    schedule: Scheduler = (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
    cancel: Canceller = handle => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
    owner: unknown = activeWorkflowIdentity(app),
): () => void {
    let changed = false;
    const check = () => {
        if (changed || activeWorkflowIdentity(app) === owner) return;
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
