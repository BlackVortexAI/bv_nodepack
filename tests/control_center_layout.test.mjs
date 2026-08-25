import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const portal=readFileSync(new URL("../ui/src/components/BVPortal.tsx",import.meta.url),"utf8");
const editor=readFileSync(new URL("../ui/src/components/control/BVControlComponent.tsx",import.meta.url),"utf8");
const row=readFileSync(new URL("../ui/src/components/control/BVControlRowComponent.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");
const nodeIntegration=readFileSync(new URL("../ui/src/components/control/bv_control_center.ts",import.meta.url),"utf8");
const entrypoint=readFileSync(new URL("../ui/src/index.tsx",import.meta.url),"utf8");

test("Control Center live controls use switch rows instead of bare checkboxes",()=>{
  assert.match(portal,/className="bv-control-live-row"/);
  assert.match(portal,/<ToggleField className="bv-control-live-toggle-field"/);
  assert.doesNotMatch(portal,/config\.controls\.map\(control=><CheckboxField/);
});

test("Control Center keeps FlexLayout with silent autosave and a plain reset action",()=>{
  assert.match(portal,/<BvDockLayout storageId="control-center"/);
  assert.match(portal,/<ResetLayoutButton onClick=/);
  assert.doesNotMatch(portal,/<ResetLayoutButton[^>]+storageId=/);
  assert.match(portal,/selected:hasControls\?0:1/);
});

test("Control Center configuration owns a responsive editor layout",()=>{
  assert.match(editor,/className="bv-control-editor"/);
  assert.match(editor,/<ToggleField[^>]+label="Force active after releasing restrictions"/);
  assert.match(row,/className="bv-control-card-header"/);
  assert.match(row,/bv-control-assignment-row/);
  assert.match(styles,/\.bv-control-editor\s*\{[^}]*grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(styles,/@container bv-control-editor \(max-width:560px\)/);
});

test("Control Center node keeps conflict status after dynamic controls",()=>{
  assert.match(nodeIntegration,/function moveWidgetToEnd/);
  assert.match(nodeIntegration,/moveWidgetToEnd\(node, CONTROL_STATUS_WIDGET\);/);
});

test("Regional legacy debug uses one setting and the native Ctrl Alt B command binding",()=>{
  assert.match(entrypoint,/name: "Enable BV Regional Legacy Debug Mode"/);
  assert.match(entrypoint,/keybindings: \[\{commandId:LEGACY_DEBUG_COMMAND_ID,combo:\{key:"b",ctrl:true,alt:true\}\}\]/);
  assert.match(entrypoint,/Default shortcut · change it in ComfyUI Settings → Shortcuts/);
  assert.doesNotMatch(entrypoint,/name: "Show BV Regional Legacy Ports"/);
});

test("retired HTTP debug bridge is absent from the frontend",()=>{
  assert.doesNotMatch(entrypoint,/Debug Bridge|debug\/snapshot|debug\/session|publishDebugSnapshot/);
});
