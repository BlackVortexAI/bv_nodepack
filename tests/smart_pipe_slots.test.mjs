import assert from "node:assert/strict";
import test from "node:test";

import { moveMarkedPortToEnd, nextFreeOrdinal, promoteConnectedInheritedSlots, promoteInheritedSlot, resolveLocalSlotNameCollisions, retainedMissingSlots, reusableSmartPipePortIndex, smartPipeSlotName, uniqueSmartPipeSlotName, updateSmartPipePort } from "../js/bv_smart_pipe_slots.js";

test("menu-created inputs remain above the Add Slot connector", () => {
  const pipe = { name: "pipe" };
  const addSlot = { name: "bv_add_slot", bvAddSlot: true };
  const newSlot = { name: "v_001", bvSlotId: "new" };
  const ports = [pipe, addSlot, newSlot];
  moveMarkedPortToEnd(ports, (port) => port.bvAddSlot);
  assert.deepEqual(ports, [pipe, newSlot, addSlot]);
});

test("resolved inherited slot replaces its stale missing presentation", () => {
  const missing = {
    name: "v_001",
    label: "⚠ Missing: new_slot 1",
    localized_name: "⚠ Missing: new_slot 1",
    type: "STRING",
    bvSlotId: "slot-1",
    link: 42,
  };

  const resolved = updateSmartPipePort(missing, "new_slot 1", "STRING", "slot-1");

  assert.notStrictEqual(resolved, missing);
  assert.equal(resolved.label, "new_slot 1");
  assert.equal(resolved.localized_name, "new_slot 1");
  assert.equal(resolved.link, 42);
});

test("copied connected ports with localized names are adopted instead of duplicated", () => {
  const ports = [
    { name: "pipe", type: "BV_SMART_PIPE" },
    { name: "out_001", label: "string", localized_name: "out_001", type: "*", links: [42] },
    { name: "out_002", label: "string", localized_name: "string", type: "STRING", links: null },
  ];
  assert.equal(reusableSmartPipePortIndex(ports, {
    slotId: "slot-1", portName: "out_002", label: "string", type: "STRING",
  }), 1);
});

test("removed upstream slots remain only when used downstream", () => {
  const previous = [
    { id: "still-present" },
    { id: "used-removed", showOutput: true },
    { id: "unused-removed" },
  ];

  const missing = retainedMissingSlots(previous, new Set(["still-present"]), (slot) => Boolean(slot.showOutput));

  assert.deepEqual(missing.map((slot) => slot.id), ["used-removed"]);
});

test("connecting a missing inherited input promotes it to a local slot", () => {
  const state = {
    localSlots: [],
    inheritedSlots: [{ id: "slot-1", name: "image", ordinal: 3, type: "*", showInput: true, showOutput: true, missing: true }],
  };
  const promoted = promoteInheritedSlot(state, "slot-1", "IMAGE");
  assert.deepEqual(promoted, {
    id: "slot-1", name: "image", ordinal: 3, type: "IMAGE", showInput: true, showOutput: true, missing: false,
  });
  assert.deepEqual(state.inheritedSlots, []);
  assert.equal(state.localSlots[0], promoted);
});

test("disconnecting a pipe promotes already connected inherited inputs only", () => {
  const state = {
    localSlots: [],
    inheritedSlots: [
      { id: "connected", name: "prompt", ordinal: 1, type: "STRING", showInput: true, missing: false },
      { id: "empty", name: "model", ordinal: 2, type: "MODEL", showInput: true, missing: false },
    ],
  };
  promoteConnectedInheritedSlots(state, new Set(["connected"]));
  assert.deepEqual(state.localSlots.map((slot) => slot.id), ["connected"]);
  assert.equal(state.localSlots[0].missing, false);
  assert.deepEqual(state.inheritedSlots.map((slot) => slot.id), ["empty"]);
});

test("new slots do not reuse a deleted ordinal", () => {
  assert.equal(nextFreeOrdinal(new Set([1, 2]), 4, 100), 4);
  assert.equal(nextFreeOrdinal(new Set([1, 2, 4]), 4, 100), 5);
  assert.equal(nextFreeOrdinal(new Set([100]), 100, 100), undefined);
});

test("source output labels become stable slot names", () => {
  assert.equal(smartPipeSlotName("Positive Conditioning"), "positive_conditioning");
  assert.equal(smartPipeSlotName("  IMAGE  "), "image");
  assert.equal(smartPipeSlotName("***"), "new_slot");
});

test("derived slot names receive deterministic suffixes", () => {
  const used = new Set(["image", "image_2"]);
  assert.equal(uniqueSmartPipeSlotName("image", used), "image_3");
  assert.equal(uniqueSmartPipeSlotName("model", used), "model");
});

test("different slot IDs with the same name remain separate and local names are suffixed", () => {
  const localSlots = [
    { id: "local-image", name: "image" },
    { id: "local-mask", name: "mask" },
  ];
  const renamed = resolveLocalSlotNameCollisions(localSlots, ["image", "image_2"]);
  assert.deepEqual(localSlots.map((slot) => slot.name), ["image_3", "mask"]);
  assert.deepEqual(renamed, [{ id: "local-image", from: "image", to: "image_3" }]);
});
