import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateRegionalNode, migrationReportMessage } from "../ui/src/regional/milestoneE.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const goldens = JSON.parse(readFileSync(join(root, "tests/fixtures/regional/legacy_workflow_goldens.json"), "utf8"));

function workflow(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function promptHarness(node) {
  const widgetInputs = node.inputs.filter(input => input.widget);
  let changes = 0, dirty = 0;
  return {
    node: {
      id: node.id,
      title: node.title ?? node.type,
      widgets: widgetInputs.map((input, index) => ({ name: input.widget.name, value: node.widgets_values[index] })),
      graph: { change() { changes++; }, setDirtyCanvas() { dirty++; } },
    },
    counts: () => ({ changes, dirty }),
  };
}

test("released Legacy workflow goldens retain their native sidecar wiring", () => {
  for (const golden of goldens.cases) {
    const value = workflow(golden.workflow);
    assert.equal(value.nodes.filter(node => node.type === "BV Named LoRA Stack").length, golden.named_lora_stack_count, golden.id);
    for (const expected of golden.legacy_links) {
      assert.ok(value.links.some(link => link[1] === expected.from_node && link[2] === expected.from_slot && link[3] === expected.to_node && link[4] === expected.to_slot && link[5] === expected.type), `${golden.id}: missing ${expected.type} link`);
    }
  }
});

test("released v1 workflow goldens migrate node-locally without rewriting Legacy sidecars", () => {
  for (const golden of goldens.cases) {
    const value = workflow(golden.workflow);
    const source = value.nodes.find(node => node.id === golden.prompt_node_id);
    const harness = promptHarness(source);
    const regional = harness.node.widgets.find(widget => widget.name === "regional_json");
    const sidecar = harness.node.widgets.find(widget => widget.name === "lora_bindings_json");
    const sidecarBefore = sidecar.value;
    const before = JSON.parse(regional.value);
    assert.equal(before.version, golden.document_version_before, golden.id);
    assert.equal(before.regions.length, golden.region_count, golden.id);
    assert.ok(before.regions.every(region => !("usage" in region)), golden.id);

    const result = migrateRegionalNode(harness.node);
    const after = JSON.parse(regional.value);
    assert.equal(result.migrated, true, golden.id);
    assert.deepEqual(result.assumedDefaults, golden.migration.assumed_defaults, golden.id);
    assert.equal(after.version, golden.migration.document_version_after, golden.id);
    assert.ok(after.regions.every(region => region.usage === golden.migration.region_usage), golden.id);
    assert.equal(sidecar.value, sidecarBefore, `${golden.id}: Legacy sidecar changed`);
    assert.deepEqual(harness.counts(), { changes: 1, dirty: 1 }, golden.id);
  }
});

test("detailer goldens preserve collector and resource identity through native links", () => {
  for (const golden of goldens.detailer_cases) {
    const value = workflow(golden.workflow);
    const prompt = value.nodes.find(node => node.id === golden.prompt_node_id);
    const plan = value.nodes.find(node => node.id === golden.plan_node_id);
    const collector = value.nodes.find(node => node.id === golden.collector_node_id);
    const document = JSON.parse(prompt.widgets_values[0]);
    const planConfig = JSON.parse(plan.widgets_values[0]);
    const collectorConfig = JSON.parse(collector.widgets_values[0]);
    const assignments = planConfig.jobs.flatMap(job => job.detector_assignments);

    assert.deepEqual(document.regions.map(region => region.id), golden.expected_region_ids, golden.id);
    assert.deepEqual(planConfig.jobs.map(job => job.primary_region_id), golden.expected_region_ids, golden.id);
    assert.equal(collectorConfig.collector_id, golden.expected_collector_id, golden.id);
    assert.deepEqual(collectorConfig.detectors.map(resource => resource.id), golden.expected_resource_ids, golden.id);
    assert.ok(assignments.every(item => item.source.collector_id === golden.expected_collector_id), golden.id);
    assert.deepEqual(assignments.map(item => item.source.resource_id), golden.expected_resource_ids, golden.id);
    assert.ok(value.links.some(link => link[1] === golden.collector_node_id && link[3] === golden.plan_node_id && link[5] === golden.provider_link_type), `${golden.id}: missing provider link`);
    for (const type of golden.loop_link_types) assert.ok(value.links.some(link => link[5] === type), `${golden.id}: missing ${type} link`);
  }
});

test("saved migrated Goldens reload canonically without a repeated migration", () => {
  for (const golden of goldens.cases) {
    const value = workflow(golden.workflow);
    const first = promptHarness(value.nodes.find(node => node.id === golden.prompt_node_id));
    assert.equal(migrateRegionalNode(first.node).migrated, true, golden.id);

    const savedWidgets = first.node.widgets.map(widget => ({ ...widget }));
    let changes = 0, dirty = 0;
    const reloaded = {
      id: first.node.id,
      title: first.node.title,
      widgets: savedWidgets,
      graph: { change() { changes++; }, setDirtyCanvas() { dirty++; } },
    };
    const second = migrateRegionalNode(reloaded);
    assert.equal(second.migrated, false, golden.id);
    assert.equal(second.error, undefined, golden.id);
    assert.deepEqual({ changes, dirty }, { changes: 0, dirty: 0 }, golden.id);
  }
});

test("one corrupted node stays byte-identical while another Golden migrates", () => {
  const golden = goldens.cases[0];
  const value = workflow(golden.workflow);
  const source = value.nodes.find(node => node.id === golden.prompt_node_id);
  const failed = promptHarness(source);
  const migrated = promptHarness(structuredClone(source));
  failed.node.id = "broken";
  failed.node.widgets.push({ name: "lora_v3_config_json", value: "{" });
  const documentBefore = failed.node.widgets.find(widget => widget.name === "regional_json").value;

  const reports = [migrateRegionalNode(failed.node), migrateRegionalNode(migrated.node)];
  assert.ok(reports[0].error);
  assert.equal(reports[0].migrated, false);
  assert.equal(failed.node.widgets.find(widget => widget.name === "regional_json").value, documentBefore);
  assert.deepEqual(failed.counts(), { changes: 0, dirty: 0 });
  assert.equal(reports[1].migrated, true);
  assert.deepEqual(migrationReportMessage(reports), {
    title: "Regional migration needs attention",
    message: "1 migrated, 1 failed · Defaults: region usage = generation.",
    tone: "warning",
  });
});
