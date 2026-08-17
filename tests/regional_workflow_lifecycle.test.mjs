import test from "node:test";
import assert from "node:assert/strict";
import { watchActiveWorkflow } from "../ui/src/regional/workflowLifecycle.ts";

test("regional windows close only when the active workflow identity changes", () => {
    const api = new EventTarget();
    const workflowA = {}, workflowB = {};
    const app = { extensionManager: { workflow: { activeWorkflow: workflowA } }, graph: {} };
    let changes = 0;
    const pending = [];
    const stop = watchActiveWorkflow(app, api, () => changes++, callback => { pending.push(callback); return pending.length; }, () => {});

    api.dispatchEvent(new Event("graphChanged"));
    assert.equal(changes, 0);

    app.extensionManager.workflow.activeWorkflow = workflowB;
    api.dispatchEvent(new Event("graphChanged"));
    assert.equal(changes, 1);

    stop();
});

test("workflow watcher detects silent tab switches through its fallback check", () => {
    const api = new EventTarget();
    const app = { workflowManager: { activeWorkflow: {} }, graph: {} };
    let changes = 0;
    const pending = [];
    const stop = watchActiveWorkflow(app, api, () => changes++, callback => { pending.push(callback); return pending.length; }, () => {});

    app.workflowManager.activeWorkflow = {};
    pending[0]();
    assert.equal(changes, 1);

    stop();
});
