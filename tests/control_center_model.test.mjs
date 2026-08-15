import test from "node:test";
import assert from "node:assert/strict";
import { findActiveControlConflicts, formatControlConflictStatus, nodesInControlGroup } from "../ui/src/util/control/controlCenterModel.js";

test("empty ComfyUI group membership falls back to group geometry after reload", () => {
    const target = { id: 1, pos: [120, 120], size: [80, 40] };
    const outside = { id: 2, pos: [400, 400], size: [80, 40] };
    const item = {
        group: { nodes: [], pos: [100, 100], size: [200, 120] },
        graph: { _nodes: [target, outside] },
    };

    assert.deepEqual(nodesInControlGroup(item), [target]);
});

test("resolved native group membership remains authoritative", () => {
    const native = { id: 1, pos: [400, 400], size: [80, 40] };
    const geometric = { id: 2, pos: [120, 120], size: [80, 40] };
    const item = {
        group: { nodes: [native], pos: [100, 100], size: [200, 120] },
        graph: { _nodes: [native, geometric] },
    };

    assert.deepEqual(nodesInControlGroup(item), [native]);
});

test("explicit activate wins conflicts between active controls", () => {
    const conflicts = findActiveControlConflicts({ controls: [
        { id: "generate", name: "Generate only", enabled: true, assignments: [{ groupId: "upscale", groupPath: "Upscale", action: "bypass" }] },
        { id: "upscale", name: "Upscale only", enabled: true, assignments: [{ groupId: "upscale", groupPath: "Upscale", action: "activate" }] },
    ] });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].winnerAction, "activate");
});

test("inactive controls and identical actions do not create conflicts", () => {
    const conflicts = findActiveControlConflicts({ controls: [
        { id: "a", enabled: true, assignments: [{ groupId: "g", action: "mute" }] },
        { id: "b", enabled: false, assignments: [{ groupId: "g", action: "activate" }] },
        { id: "c", enabled: true, assignments: [{ groupId: "g", action: "mute" }] },
    ] });

    assert.deepEqual(conflicts, []);
});

test("node status describes conflicts and reserves a stable success row", () => {
    const conflicts = findActiveControlConflicts({ controls: [
        { id: "a", name: "A", enabled: true, assignments: [{ groupId: "g", groupPath: "Upscale", action: "bypass" }] },
        { id: "b", name: "B", enabled: true, assignments: [{ groupId: "g", groupPath: "Upscale", action: "activate" }] },
    ] });

    assert.equal(formatControlConflictStatus(conflicts), "⚠ Upscale: Activate overrides Bypass");
    assert.equal(formatControlConflictStatus([]), "✓ No active conflicts");
});
