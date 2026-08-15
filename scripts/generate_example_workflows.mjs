import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "examples", "workflows");
fs.mkdirSync(out, { recursive: true });

const base = (nodes, links = [], groups = [], extra = {}) => ({
  id: crypto.randomUUID(), revision: 0,
  last_node_id: Math.max(...nodes.map((node) => Number(node.id)), 0),
  last_link_id: Math.max(...links.map((link) => Number(link[0])), 0),
  nodes, links, groups, config: {},
  extra: { ds: { scale: 1, offset: [80, 80] }, frontendVersion: "1.48.7", ...extra },
  version: 0.4,
});
const note = (id, title, text, pos, size = [380, 180]) => ({
  id, type: "MarkdownNote", pos, size, flags: {}, order: id, mode: 0,
  inputs: [], outputs: [], title, properties: {}, widgets_values: [text], color: "#223", bgcolor: "#112",
});
const props = (name) => ({ "Node name for S&R": name, cnr_id: "bv_nodepack", ver: "0.1.0" });
const input = (name, type, link = null, widget = false, label = undefined) => ({ name, type, link, ...(widget ? { widget: { name } } : {}), ...(label ? { label } : {}) });
const output = (name, type, links = null) => ({ name, type, links });
const save = (name, workflow) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(workflow, null, 2)}\n`);
const showText = (id, pos, link, value = "") => ({
  id, type: "ShowText|pysssss", pos, size: [260, 90], flags: {}, order: id, mode: 0,
  inputs: [{ localized_name: "text", name: "text", type: "STRING", link }],
  outputs: [{ localized_name: "STRING", name: "STRING", shape: 6, type: "STRING", links: null }],
  properties: { cnr_id: "comfyui-custom-scripts", ver: "1.2.5", "Node name for S&R": "ShowText|pysssss" },
  widgets_values: [value],
});

// Prompt AST: a real category workflow with two independent consumers.
save("prompt-ast-categories.json", base([
  note(1, "Prompt AST – categories instead of string surgery", "## Practical use\nMaintain one structured prompt, enable or disable optional blocks, then decode only the categories required by a downstream encoder. The Debug node keeps the AST visible while building the workflow.", [20, 20], [430, 210]),
  { id: 2, type: "BV Prompt Encode", pos: [500, 40], size: [360, 240], flags: {}, order: 2, mode: 0,
    inputs: [input("prompt", "STRING", null, true)], outputs: [output("ast", "BV_AST", [1, 2]), output("cleaned_prompt", "STRING")], properties: props("BV Prompt Encode"),
    widgets_values: ["A cinematic portrait of an astronaut\n@@lighting\nsoft rim light, volumetric haze\n@@detail\nhighly detailed helmet reflections\n@@negative\ntext, watermark"] },
  { id: 3, type: "BV Prompt Category Switch", pos: [930, 40], size: [340, 190], flags: {}, order: 3, mode: 0,
    inputs: [input("ast", "BV_AST", 1), input("enable_categories", "STRING", null, true), input("disable_categories", "STRING", null, true), input("inherit", "BOOLEAN", null, true), input("mode", "BOOLEAN", null, true)],
    outputs: [output("ast", "BV_AST", [3]), output("report", "STRING")], properties: props("BV Prompt Category Switch"), widgets_values: ["lighting\ndetail", "negative", true, true] },
  { id: 4, type: "BV Prompt Decode", pos: [1340, 40], size: [340, 220], flags: {}, order: 4, mode: 0,
    inputs: [input("ast", "BV_AST", 3), input("category_filter", "STRING", null, true), input("with_comments", "BOOLEAN", null, true), input("inherit", "BOOLEAN", null, true), input("mode", "BOOLEAN", null, true), input("prettify", "BOOLEAN", null, true)],
    outputs: [output("ast", "BV_AST"), output("filtered_prompt", "STRING", [4])], properties: props("BV Prompt Decode"), widgets_values: ["default, lighting, detail", false, true, true, true] },
  { id: 5, type: "BV Prompt AST Debug", pos: [930, 300], size: [750, 230], flags: {}, order: 5, mode: 0,
    inputs: [input("ast", "BV_AST", 2), input("pretty", "BOOLEAN", null, true), input("indent", "INT", null, true), input("sort_keys", "BOOLEAN", null, true)],
    outputs: [output("ast_json", "STRING")], properties: props("BV Prompt AST Debug"), widgets_values: [true, 2, false] },
  showText(6, [1740, 80], 4, "A cinematic portrait of an astronaut\nsoft rim light, volumetric haze\nhighly detailed helmet reflections"),
], [[1,2,0,3,0,"BV_AST"],[2,2,0,5,0,"BV_AST"],[3,3,0,4,0,"BV_AST"],[4,4,1,6,0,"STRING"]]));

// Random latent: configured for a realistic portrait workflow.
save("empty-latent-random-ratio.json", base([
  note(1, "Random ratio latent – reproducible composition variants", "## Practical use\nGenerate a deterministic mix of landscape, portrait and square canvases for prompt exploration. Standard ratios are one-click toggles; project-specific ratios stay in the text field. Connect **latent** directly to your sampler.", [20, 20], [430, 220]),
  { id: 2, type: "BV Empty Latent Random Ratio", pos: [500, 20], size: [420, 430], flags: {}, order: 2, mode: 0,
    inputs: [input("seed","INT",null,true),input("resolution","COMBO",null,true),input("custom_resolution","INT",null,true),input("alignment","COMBO",null,true),
      ...["use_1_1","use_3_2","use_2_3","use_4_3","use_3_4","use_16_9","use_9_16","use_21_9","use_9_21"].map((name)=>input(name,"BOOLEAN",null,true)),input("ratios","STRING",null,true),input("batch_size","INT",null,true)],
    outputs: [output("latent","LATENT"),output("width","INT"),output("height","INT"),output("picked_ratio","STRING")], properties: props("BV Empty Latent Random Ratio"),
    widgets_values: [42,"1024",1024,"64",true,true,true,false,false,true,true,false,false,"5:4\n4:5",1] },
  note(3, "Suggested downstream wiring", "**latent → KSampler.latent_image**\n\nThe additional width, height and picked_ratio outputs are useful for filenames, metadata and resolution-aware post-processing.", [980, 80], [360, 190]),
]));

// Subgraph UI building blocks, laid out in the same order they should be exposed.
save("subgraph-ui-layout.json", base([
  note(1, "Build a clean Subgraph interface", "## Practical use\nExpose these inputs in the shown order. The outer Subgraph node becomes a small purpose-built UI: heading, model preset, divider, numeric settings and intentional spacing.", [20, 20], [420, 210]),
  { id: 2, type: "BV Subgraph Heading", pos: [500, 20], size: [330, 150], flags: {}, order: 2, mode: 0,
    inputs: [input("value","STRING",null,true),input("font_size","INT",null,true),input("show_divider","BOOLEAN",null,true)], outputs:[output("_","STRING")], properties:props("BV Subgraph Heading"), widgets_values:["Generation Settings",26,false] },
  { id: 3, type: "BV Dynamic Combo", pos: [500, 205], size: [330, 210], flags: {}, order: 3, mode: 0,
    inputs:[input("value","STRING",null,true),input("options","STRING",null,true)], outputs:[output("value_str","STRING"),output("value_int","INT"),output("value_float","FLOAT")], properties:props("BV Dynamic Combo"), widgets_values:["Balanced","Fast\nBalanced\nQuality"] },
  { id: 4, type: "BV Subgraph Divider", pos: [900, 70], size: [300, 145], flags: {}, order: 4, mode: 0,
    inputs:[input("thickness","INT",null,true),input("padding","INT",null,true),input("alpha","FLOAT",null,true)], outputs:[output("_","STRING")], properties:props("BV Subgraph Divider"), widgets_values:[2,10,0.35] },
  { id: 5, type: "BV Subgraph Spacer", pos: [900, 250], size: [300, 125], flags: {}, order: 5, mode: 0,
    inputs:[input("height","INT",null,true),input("scale","FLOAT",null,true)], outputs:[output("_","STRING")], properties:props("BV Subgraph Spacer"), widgets_values:[24,1] },
  note(6, "Expose to the Subgraph input", "Connect each presentation output to the Subgraph input bracket, then expose the functional values between them. Stable identities preserve this order across save/load and input changes.", [1260, 90], [380, 210]),
]));

// Use the validated live test graphs for the complex stateful examples.
for (const [source, target] of [
  ["Dev Pipe Test.json", "smart-pipe-wireless-merge.json"],
  ["BV Control Center Test.json", "control-center-workflow-states.json"],
]) {
  const sourcePath = path.resolve(root, "..", "..", "user", "default", "workflows", source);
  if (!fs.existsSync(sourcePath)) continue;
  const workflow = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  if (target === "smart-pipe-wireless-merge.json") {
    const positions = new Map([[204,[20,30]],[199,[320,20]],[205,[20,310]],[198,[320,300]],[200,[820,170]],[201,[1260,150]]]);
    workflow.nodes = workflow.nodes.filter((node) => positions.has(node.id));
    for (const node of workflow.nodes) node.pos = positions.get(node.id);
    const ids = new Set(workflow.nodes.map((node) => node.id));
    workflow.links = workflow.links.filter((link) => ids.has(link[1]) && ids.has(link[3]));
    const first = workflow.nodes.find((node) => node.id === 199);
    const second = workflow.nodes.find((node) => node.id === 198);
    const afterMerge = workflow.nodes.find((node) => node.id === 201);
    workflow.nodes.find((node) => node.id === 204).widgets_values = ["A lighthouse above a stormy sea"];
    workflow.nodes.find((node) => node.id === 205).widgets_values = ["text, watermark"];
    const firstSlot = first.properties.bvSmartPipe.localSlots[0];
    const secondSlot = second.properties.bvSmartPipe.localSlots[0];
    Object.assign(firstSlot, { name: "prompt" });
    Object.assign(first.properties.bvSmartPipe.resolvedSlots[0], { name: "prompt" });
    Object.assign(first.inputs[1], { label: "prompt", localized_name: "prompt" });
    Object.assign(secondSlot, { name: "negative_prompt" });
    Object.assign(second.properties.bvSmartPipe.resolvedSlots[0], { name: "negative_prompt" });
    Object.assign(second.inputs[1], { label: "negative_prompt", localized_name: "negative_prompt" });

    const styleSlot = { id: "5c881b13-e3ab-4caf-9a09-92659fba6419", name: "style", ordinal: 2, type: "STRING", showInput: true, showOutput: false };
    first.properties.bvSmartPipe.localSlots.push(styleSlot);
    first.properties.bvSmartPipe.resolvedSlots.push({ ...styleSlot, missing: false, dormant: false });
    first.properties.bvSmartPipe.nextOrdinal = 3;
    first.inputs.splice(2, 0, { label: "style", localized_name: "style", name: "v_002", shape: 7, type: "STRING", link: 188 });
    first.widgets_values[0] = JSON.stringify([
      { ...first.properties.bvSmartPipe.resolvedSlots[0], connected: true },
      { ...first.properties.bvSmartPipe.resolvedSlots[1], connected: true },
    ]);
    second.widgets_values[0] = JSON.stringify([{ ...second.properties.bvSmartPipe.resolvedSlots[0], connected: true }]);

    const mergedSlots = [
      { ...first.properties.bvSmartPipe.resolvedSlots[0], showInput: false, showOutput: true },
      { ...first.properties.bvSmartPipe.resolvedSlots[1], showInput: false, showOutput: true },
      { ...second.properties.bvSmartPipe.resolvedSlots[0], showInput: false, showOutput: true },
    ];
    afterMerge.properties.bvSmartPipe.inheritedSlots = mergedSlots.map((slot) => ({ ...slot }));
    afterMerge.properties.bvSmartPipe.resolvedSlots = mergedSlots.map((slot) => ({ ...slot }));
    afterMerge.outputs = [afterMerge.outputs[0], ...mergedSlots.map((slot, index) => ({ localized_name: slot.name, name: slot.name, type: "STRING", links: [189 + index] }))];
    afterMerge.widgets_values[0] = JSON.stringify(mergedSlots.map((slot) => ({ ...slot, connected: true })));
    const routeKey = Object.keys(workflow.extra.bvSmartPipeRoutes).find((key) => key.endsWith(afterMerge.properties.bvSmartPipe.routing.nodeId));
    workflow.extra.bvSmartPipeRoutes[routeKey].projection = { version: 1, inheritedSlots: mergedSlots.map((slot) => ({ ...slot })), resolvedSlots: mergedSlots.map((slot) => ({ ...slot })) };

    const styleValue = JSON.parse(JSON.stringify(workflow.nodes.find((node) => node.id === 204)));
    Object.assign(styleValue, { id: 206, pos: [20, 150], order: 11, widgets_values: ["cinematic"] });
    styleValue.outputs[0].links = [188];
    workflow.nodes.push(styleValue, showText(207, [1740, 40], 189, "A lighthouse above a stormy sea"), showText(208, [1740, 170], 190, "cinematic"), showText(209, [1740, 300], 191, "text, watermark"));
    workflow.links.push([188,206,0,199,2,"STRING"],[189,201,1,207,0,"STRING"],[190,201,2,208,0,"STRING"],[191,201,3,209,0,"STRING"]);
    workflow.last_node_id = 209; workflow.last_link_id = 191;
    workflow.extra.ds = { scale: 0.72, offset: [100, 250] };
  }
  if (target === "control-center-workflow-states.json") {
    const keep = new Set([6, 2, 3]);
    workflow.nodes = workflow.nodes.filter((node) => keep.has(node.id));
    const control = workflow.nodes.find((node) => node.id === 6);
    const generate = workflow.nodes.find((node) => node.id === 2);
    const upscale = workflow.nodes.find((node) => node.id === 3);
    control.pos = [30, 150]; control.size = [330, 130]; control.title = "🌀 BV Control Center";
    const controlConfig = JSON.parse(control.widgets_values[0]);
    controlConfig.controls[0].name = "Generate only";
    controlConfig.controls[0].assignments = controlConfig.controls[0].assignments.filter((assignment) => assignment.groupTitle === "Upscale");
    controlConfig.controls[1].name = "Full pipeline";
    controlConfig.controls[1].assignments = controlConfig.controls[1].assignments.map((assignment) => ({ ...assignment, groupId: "db2a373c-9542-4657-ad6d-1a2dd6b3757c", groupPath: "Generate", groupTitle: "Generate", action: "activate" }));
    controlConfig.controls[0].enabled = true;
    controlConfig.controls[1].enabled = false;
    control.widgets_values[0] = JSON.stringify(controlConfig);
    control.widgets_values[2] = true;
    control.widgets_values[3] = false;
    control.inputs[1].label = "Generate only";
    control.inputs[2].label = "Full pipeline";
    workflow.extra.bv_settings.controlConfig = controlConfig;
    generate.pos = [540, 80]; generate.size = [270, 106]; generate.mode = 0;
    upscale.pos = [540, 310]; upscale.size = [270, 106]; upscale.mode = 4;
    workflow.groups = workflow.groups.filter((group) => group.id === 2 || group.id === 4);
    const generateGroup = workflow.groups.find((group) => group.id === 4);
    const upscaleGroup = workflow.groups.find((group) => group.id === 2);
    generateGroup.bounding = [500, 20, 350, 205];
    upscaleGroup.bounding = [500, 250, 350, 205];
    workflow.last_node_id = 6; workflow.last_link_id = 0;
    workflow.extra.ds = { scale: 0.9, offset: [140, 170] };
  }
  fs.writeFileSync(path.join(out, target), `${JSON.stringify(workflow, null, 2)}\n`);
}
