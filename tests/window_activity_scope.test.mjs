import assert from "node:assert/strict";
import test from "node:test";

import { bvWindowActivity } from "../ui/src/ui/windowActivity.ts";
import { createOpenLastBvEditorAction, createScopedBvWindowOpen } from "../ui/src/ui/windowOpenGate.ts";

const node = (id, name, enabled = true) => ({ id, name, enabled });

test("the registered open-last action keeps activity and fallbacks workflow-scoped", () => {
    const workflowA = { name: "A" }, workflowB = { name: "B" };
    const a1 = node(1, "A1"), a2 = node(2, "A2");
    const b1 = node(1, "B1"), b2 = node(2, "B2", false);
    const inventories = new Map([[workflowA, [a1, a2]], [workflowB, [b1, b2]]]);
    const events = [], warnings = [];
    let active = workflowA;
    const candidates = scope => inventories.get(scope).map(item => ({
        scope,
        type: "regional",
        id: String(item.id),
        node: item,
        canOpen: () => item.enabled,
        open: () => { events.push(item); return true; },
    }));
    const direct = (scope, item) => createScopedBvWindowOpen({
        scope,
        type: "regional",
        id: String(item.id),
        node: item,
        currentScope: () => active,
        inventory: owner => inventories.get(owner) ?? [],
        canOpen: () => item.enabled,
        open: () => { events.push(item); return true; },
    });
    const action = createOpenLastBvEditorAction({
        currentScope: () => active,
        candidates,
        inventory: owner => inventories.get(owner) ?? [],
        warn: message => warnings.push(message),
    });

    assert.equal(action.tooltip, "Open last BV editor");
    assert.equal(direct(workflowA, a2)(), true);
    assert.equal(bvWindowActivity(workflowA).lastInstance("regional"), "2");

    active = workflowB;
    const beforeFreshB = events.length;
    assert.equal(action.onClick(), true);
    assert.deepEqual(events.slice(beforeFreshB), [b1]);
    assert.equal(bvWindowActivity(workflowB).lastInstance("regional"), "1");

    b2.enabled = true;
    assert.equal(direct(workflowB, b2)(), true);
    const beforeBLast = events.length;
    assert.equal(action.onClick(), true);
    assert.deepEqual(events.slice(beforeBLast), [b2]);

    active = workflowA;
    const beforeReturnA = events.length;
    assert.equal(action.onClick(), true);
    assert.deepEqual(events.slice(beforeReturnA), [a2]);

    active = workflowB;
    b2.enabled = false;
    const beforeDisabled = events.length;
    assert.equal(action.onClick(), true);
    assert.deepEqual(events.slice(beforeDisabled), [b1]);
    assert.equal(warnings.length, 1);

    bvWindowActivity(workflowB).remember("regional", "missing");
    const beforeMissing = events.length;
    assert.equal(action.onClick(), true);
    assert.deepEqual(events.slice(beforeMissing), [b1]);
    assert.equal(warnings.length, 2);
});

test("the scoped open gate rejects stale workflows and same-id foreign node objects", () => {
    const workflowA = { name: "A" }, workflowB = { name: "B" };
    const a2 = node(2, "A2"), foreignA2 = node(2, "Foreign A2");
    const inventories = new Map([[workflowA, [a2]], [workflowB, []]]);
    const events = [];
    let active = workflowA;
    const delayed = createScopedBvWindowOpen({
        scope: workflowA,
        type: "regional",
        id: "2",
        node: a2,
        currentScope: () => active,
        inventory: owner => inventories.get(owner) ?? [],
        canOpen: () => true,
        open: () => { events.push(a2); return true; },
    });
    const impostor = createScopedBvWindowOpen({
        scope: workflowA,
        type: "regional",
        id: "2",
        node: foreignA2,
        currentScope: () => active,
        inventory: owner => inventories.get(owner) ?? [],
        canOpen: () => true,
        open: () => { events.push(foreignA2); return true; },
    });

    assert.equal(impostor(), false);
    active = workflowB;
    assert.equal(delayed(), false);
    assert.deepEqual(events, []);
    assert.equal(bvWindowActivity(workflowA).lastInstance("regional"), undefined);
});

test("open-last retries with a freshly captured owner after a workflow transition gap",()=>{
    const workflowA={},workflowB={},b1=node(1,"B1"),events=[],scheduled=[];
    let active=workflowA,ready=false;
    const action=createOpenLastBvEditorAction({
        currentScope:()=>active,
        candidates:scope=>scope===workflowB&&ready?[{scope,type:"regional",id:"1",node:b1,canOpen:()=>true,open:()=>{events.push(b1);return true;}}]:[],
        inventory:scope=>scope===workflowB?[b1]:[],
        warn:()=>{},
        schedule:callback=>scheduled.push(callback),
    });
    assert.equal(action.onClick(),false);
    active=workflowB;ready=true;
    assert.equal(scheduled.length,1);
    scheduled[0]();
    assert.deepEqual(events,[b1]);
    assert.equal(bvWindowActivity(workflowB).lastInstance("regional"),"1");
});
