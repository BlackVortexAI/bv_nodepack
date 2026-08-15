import test from "node:test";
import assert from "node:assert/strict";
import {
  SMART_PIPE_DEFAULT_TITLE,
  SMART_PIPE_MERGE_DEFAULT_TITLE,
  compactMergeNodeHeight,
  duplicateDynamicInputIndexes,
  hasMergeSource,
  mergePipeSchemas,
  normalizeMergeSources,
} from "../js/bv_smart_pipe_merge_model.js";

test("new nodes retain their complete public display titles", () => {
  assert.equal(SMART_PIPE_DEFAULT_TITLE, "🌀 BV Smart Pipe");
  assert.equal(SMART_PIPE_MERGE_DEFAULT_TITLE, "🌀 BV Smart Pipe Merge");
});

test("the same pipe cannot be added twice across wired and wireless modes", () => {
  const sources = [{ key: "pipe_001", mode: "wired", address: "root/source" }];
  assert.equal(hasMergeSource(sources, { mode: "wireless", address: "root/source" }), true);
  assert.equal(hasMergeSource(sources, { mode: "wireless", address: "root/other" }), false);
});

test("merged frontend schema contains every source and later metadata wins", () => {
  const schema = mergePipeSchemas([
    [{ id: "model", name: "model", type: "*", ordinal: 4 }],
    [{ id: "model", name: "model", type: "MODEL", ordinal: 2 }, { id: "image", name: "image", type: "IMAGE", ordinal: 3 }],
  ]);
  assert.deepEqual(schema.map(({ id, type, ordinal }) => ({ id, type, ordinal })), [
    { id: "model", type: "MODEL", ordinal: 1 },
    { id: "image", type: "IMAGE", ordinal: 2 },
  ]);
});

test("compatible frontend slots with the same name are coalesced", () => {
  const schema = mergePipeSchemas([
    [{ id: "string-a", name: "string", type: "STRING", ordinal: 1 }],
    [{ id: "string-b", name: "string", type: "STRING", ordinal: 1 }],
  ]);
  assert.equal(schema.length, 1);
  assert.equal(schema[0].id, "string-a");
  assert.deepEqual(schema[0].aliases, ["string-b"]);
});

test("empty merge nodes use a compact deterministic height", () => {
  assert.equal(compactMergeNodeHeight(0), 88);
  assert.equal(compactMergeNodeHeight(2), 132);
});

test("reload drops wireless merge ghosts that claim to be unconnected wired sources", () => {
  const sources = [
    { key: "pipe_001", mode: "wireless", address: "root/source-a", label: "Source A" },
    { key: "pipe_002", mode: "wireless", address: "root/source-b", label: "Source B" },
    { key: "pipe_007", mode: "wired", address: null, label: "Wired 3" },
  ];

  assert.deepEqual(normalizeMergeSources(sources, new Set()), sources.slice(0, 2));
  assert.deepEqual(
    normalizeMergeSources(sources, new Set(["pipe_007"])),
    sources,
  );
});

test("reload identifies duplicate dynamic inputs while retaining the linked copy", () => {
  const inputs = [
    { name: "pipe_007", link: null },
    { name: "bv_smart_pipe_merge_config_json", link: null },
    { name: "pipe_007", link: 42 },
    { name: "bv_add_pipe_source", link: null },
  ];

  assert.deepEqual(duplicateDynamicInputIndexes(inputs), [0]);
});
