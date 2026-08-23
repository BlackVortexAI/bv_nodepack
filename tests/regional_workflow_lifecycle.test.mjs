import test from "node:test";
import assert from "node:assert/strict";
import { activeWorkflowIdentity, watchActiveWorkflow } from "../ui/src/regional/workflowLifecycle.ts";

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

test("a replacement editor can bind directly to the new workflow before an old watcher is cleaned up",()=>{
    const api=new EventTarget(),workflowA={},workflowB={},app={extensionManager:{workflow:{activeWorkflow:workflowB}},graph:{}};
    let staleChanges=0,currentChanges=0;
    const stale=watchActiveWorkflow(app,api,()=>staleChanges++,()=>1,()=>{},workflowA);
    const current=watchActiveWorkflow(app,api,()=>currentChanges++,()=>2,()=>{},workflowB);
    api.dispatchEvent(new Event("graphChanged"));
    assert.equal(staleChanges,1);assert.equal(currentChanges,0);stale();current();
});

test("workflow identity follows the workflow id when ComfyUI reuses its active-workflow proxy",()=>{
    const api=new EventTarget(),proxy={id:"workflow-a"},app={extensionManager:{workflow:{activeWorkflow:proxy}},graph:{}};let changes=0;const pending=[];
    const stop=watchActiveWorkflow(app,api,()=>changes++,callback=>{pending.push(callback);return 1},()=>{});
    proxy.id="workflow-b";api.dispatchEvent(new Event("graphChanged"));assert.equal(changes,1);stop();
});

test("unsaved workflow identity uses ComfyUI's stable workflow key",()=>{
    const app={graph:{},extensionManager:{workflow:{get activeWorkflow(){return {key:"new/7",filename:null}}}}};
    assert.equal(activeWorkflowIdentity(app),"key:new/7");
    assert.equal(activeWorkflowIdentity(app),"key:new/7");
});

test("stable workflow key is authoritative when ComfyUI reuses canvas graph state",()=>{
    const graphA={},graphB={},app={canvas:{graph:graphA},extensionManager:{workflow:{activeWorkflow:{key:"unstable"}}}};
    assert.equal(activeWorkflowIdentity(app),"key:unstable");
    app.canvas.graph=graphB;
    assert.equal(activeWorkflowIdentity(app),"key:unstable");
});
