import assert from "node:assert/strict";
import test from "node:test";
import { sourceRegionalDocument } from "../ui/src/regional/regionalSourceDocument.ts";

const document = JSON.stringify({
    schema: "bv.regional", version: 2, document_id: "doc", title: "Test",
    canvas: { width: 512, height: 512 },
    prompts: { global: { positive_source: "", negative_source: "" }, background: { positive_source: "", negative_source: "" } },
    negative_mode: "auto", overlap: { mode: "joint" }, regions: [],
});

function fixture() {
    const prompt = { id: 1, type: "BV Regional Prompt", outputs:[{type:"BV_REGIONAL",links:[10]}], widgets: [{ name: "regional_json", value: document }] };
    const lora = { id: 2, type: "BV Regional LoRA", outputs:[{type:"BV_REGIONAL",links:[11]}], inputs: [{ name: "regional", link: 10 }] };
    const mask = { id: 3, type: "BV Regional Detailer Mask", inputs: [{ name: "regional", link: 11 }] };
    const nodes = new Map([[1, prompt], [2, lora], [3, mask]]);
    const graph = {
        _links: new Map([[10, { origin_id: 1,origin_slot:0,target_id:2,target_slot:0 }], [11, { origin_id: 2,origin_slot:0,target_id:3,target_slot:0 }]]),
        getNodeById(id) { return nodes.get(id); },
    };
    for (const node of nodes.values()) node.__bvConcreteGraph = graph;
    return { graph, mask };
}

test("detailer UI resolves the persisted document through a same-graph Regional LoRA chain", () => {
    const { mask } = fixture();
    assert.equal(sourceRegionalDocument(mask)?.document_id, "doc");
});

test("detailer UI does not cross a concrete graph boundary", () => {
    const { mask } = fixture();
    const foreignGraph = { _links: new Map(), getNodeById() { throw new Error("foreign graph accessed"); } };
    assert.equal(sourceRegionalDocument(mask, foreignGraph)?.document_id, "doc");
});
