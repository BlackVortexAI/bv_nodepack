import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const options = readFileSync(new URL("../ui/src/regional/OptionsPanel.tsx", import.meta.url), "utf8");
const detailer = readFileSync(new URL("../ui/src/regional/detailerPlanDialog.ts", import.meta.url), "utf8");
const detailerView = readFileSync(new URL("../ui/src/regional/DetailerPlanDialogView.tsx", import.meta.url), "utf8");
const detectorView = readFileSync(new URL("../ui/src/regional/DetectorRegistryDialogView.tsx", import.meta.url), "utf8");
const dataComponents = readFileSync(new URL("../ui/src/ui/components/data.tsx", import.meta.url), "utf8");
const controls = readFileSync(new URL("../ui/src/ui/controls.tsx", import.meta.url), "utf8");
const forms = readFileSync(new URL("../ui/src/ui/components/forms.tsx", import.meta.url), "utf8");
const overlays = readFileSync(new URL("../ui/src/ui/components/overlays.tsx", import.meta.url), "utf8");
const floating = readFileSync(new URL("../ui/src/ui/components/floating.tsx", import.meta.url), "utf8");
const windowChrome = readFileSync(new URL("../ui/src/ui/window.tsx", import.meta.url), "utf8");
const windowMount = readFileSync(new URL("../ui/src/ui/mount.tsx", import.meta.url), "utf8");
const toolbarLauncher = readFileSync(new URL("../ui/src/ui/ToolbarWindowLauncher.tsx", import.meta.url), "utf8");
const windowActivity = readFileSync(new URL("../ui/src/ui/windowActivity.ts", import.meta.url), "utf8");
const uiEntry = readFileSync(new URL("../ui/src/index.tsx", import.meta.url), "utf8");
const editorMenus = readFileSync(new URL("../ui/src/regional/EditorMenus.tsx", import.meta.url), "utf8");
const regionalToolPalette = readFileSync(new URL("../ui/src/ui/components/RegionalToolPalette.tsx", import.meta.url), "utf8");
const regionalEditor = readFileSync(new URL("../ui/src/regional/RegionalEditor.tsx", import.meta.url), "utf8");
const quickPromptEditor = readFileSync(new URL("../ui/src/regional/QuickPromptEditor.tsx", import.meta.url), "utf8");
const promptTextarea = readFileSync(new URL("../ui/src/completion/PromptTextarea.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../ui/src/index.css", import.meta.url), "utf8");

test("regional inspector composes shared production controls instead of restyling raw widgets", () => {
    for (const component of ["BvSelect", "BvNumberField", "FieldFrame", "PromptTextarea"]) assert.match(options, new RegExp(`<${component}\\b`));
    assert.doesNotMatch(options, /<select\b|<input\s+type="number"|<textarea\b/);
    assert.doesNotMatch(options, /className="option-section"/);
});

test("imperative detailer entrypoint mounts a React framework view", () => {
    assert.match(detailer, /mountBvView/);
    for (const component of ["BvManagedWindow", "NumberField", "SelectField", "TagSelect", "TextField"]) assert.match(detailerView, new RegExp(`<${component}\\b`));
    assert.doesNotMatch(detailerView, /<(?:button|input|select|textarea)\b/);
});

test("node-owned windows reactivate by type and node id instead of mounting duplicates", () => {
    assert.match(windowMount, /mountedViews\.get\(options\.key\)/);
    assert.match(windowMount, /existing\.activate\(render\)/);
    assert.match(windowMount, /bv-ui-activate/);
    assert.match(windowMount, /currentState=current\?\.state\(\)/);
    assert.match(windowMount, /pendingStates\.set\(targetKey,currentState\)/);
    assert.match(windowMount, /getBoundingClientRect/);
    assert.match(windowMount, /geometry:box\?\{x:box\.left,y:box\.top,width:box\.width,height:box\.height\}/);
    assert.match(windowChrome, /bv-ui-set-window-state/);
    assert.match(windowChrome, /addEventListener\("bv-ui-activate"/);
    assert.match(uiEntry, /`detailer-plan:\$\{node\.id\}`/);
    assert.match(uiEntry, /`detector-registry:\$\{node\.id\}`/);
});

test("every node editor uses the conditional shared window navigator", () => {
    for (const source of [regionalEditor, quickPromptEditor, detailerView, detectorView]) assert.match(source, /BvWindowNavigator/);
    assert.match(windowChrome, /if\(options\.length<=1\)return null/);
    assert.match(windowChrome, /meta\.shiftKey\?keep:!keep/);
    assert.match(windowChrome, /bv-window-switch-mode/);
    assert.match(styles, /\.bv-window-navigator\s*\{[^}]*display:flex/s);
    assert.match(styles, /\.bv-ui-window-shelf-close/);
    assert.match(regionalEditor, /activationToken/);
    assert.match(regionalEditor, /transferredWindow/);
});

test("ComfyUI toolbar exposes a node-aware multi-column window launcher", () => {
    assert.match(uiEntry, /<ToolbarWindowLauncher\s+getColumns=\{launcherColumns\}/);
    for (const label of ["Regional Editor", "Quick Edit", "Detailer Plan", "Detector Registry"]) assert.match(uiEntry, new RegExp(`label:\"${label}\"`));
    assert.match(toolbarLauncher, /filter\(column=>column\.items\.length\)/);
    assert.match(toolbarLauncher, /\.bv-regional-action/);
    assert.match(toolbarLauncher, /pointerenter/);
    assert.match(toolbarLauncher, /addEventListener\("focus"/);
    assert.match(toolbarLauncher, /event\.key===\"Escape\"/);
    assert.match(styles, /\.bv-toolbar-window-launcher\s*\{[^}]*grid-template-columns:repeat\(var\(--bv-launcher-columns\)/s);
    assert.match(styles, /\.bv-toolbar-window-launcher \.bv-button\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) auto[^}]*min-height:26px/s);
});

test("toolbar primary actions restore the last active node per editor type", () => {
    assert.match(windowActivity, /const lastActive = new Map<BvWindowType, string>/);
    assert.match(uiEntry, /lastBvWindowInstance\("quick"\)/);
    assert.match(uiEntry, /lastBvWindowInstance\("regional"\)/);
    assert.match(quickPromptEditor, /rememberBvWindowInstance\("quick",nextId\)/);
    assert.match(regionalEditor, /rememberBvWindowInstance\("regional",nextId\)/);
    assert.match(uiEntry, /rememberBvWindowInstance\("detailer",node\.id\)/);
    assert.match(uiEntry, /rememberBvWindowInstance\("detector",node\.id\)/);
});

test("detector and detailer editors use shared compact collection and grid modules", () => {
    for (const component of ["UiDensity", "FieldGrid"]) assert.match(detectorView, new RegExp(`<${component}\\b`));
    for (const component of ["UiDensity", "FieldGrid", "TagSelect", "SortableList"]) assert.match(detailerView, new RegExp(`<${component}\\b`));
    assert.match(dataComponents, /summary\?:ReactNode/);
    assert.match(styles, /\.bv-field-grid,\.bv-choice-grid/);
    assert.doesNotMatch(`${detectorView}\n${detailerView}`, /bv-detailer-control-grid|bv-detailer-region-grid/);
});

test("detailer regions use a closed tag selector that preserves one selection", () => {
    assert.match(detailerView, /<TagSelect\b[^>]*minSelected=\{1\}/);
    assert.doesNotMatch(detailerView, /<CheckboxField\b|<ChoiceGrid\b/);
    assert.match(forms, /export function TagSelect/);
    assert.match(forms, /selected&&value\.length<=minSelected/);
    assert.match(forms, /aria-multiselectable="true"/);
    const tagSelect = forms.slice(forms.indexOf("export function TagSelect"), forms.indexOf("export function SearchField"));
    assert.doesNotMatch(tagSelect, /<input\b|contentEditable|onValue\(\[\.\.\.value,draft/);
});

test("shared dialogs reserve header and footer space at narrow heights", () => {
    assert.match(styles, /\.bv-dialog\s*\{[^}]*display:grid[^}]*grid-template-rows:auto minmax\(0,1fr\) auto/s);
    assert.match(styles, /\.bv-dialog-body\s*\{[^}]*min-height:0[^}]*overflow:auto/s);
    assert.doesNotMatch(styles, /\.bv-dialog-body\s*\{[^}]*max-height:calc\(86vh - 120px\)/s);
});

test("BV roots normalize inherited native control metrics without resetting ComfyUI globally", () => {
    assert.match(styles, /:is\(\.bv-ui,#bv-root,\.bv-ui-portal\)/);
    assert.match(styles, /:where\(button,input,select,textarea\)/);
    assert.doesNotMatch(styles, /(^|\n)\s*(button|input|select|textarea)\s*\{/m);
});

test("number fields preserve the approved value-first adaptive structure", () => {
    assert.match(forms, /className="bv-number-value-row"/);
    assert.match(forms, /className="bv-number-box"/);
    assert.match(forms, /className="bv-number-slider"/);
    assert.match(controls, /return <NumberField/);
    assert.match(styles, /@container\s+bv-number-field/);
});

test("compact controls use a real framework density instead of inheriting comfortable height", () => {
    assert.match(forms, /CompactSelect[\s\S]*bv-density-compact/);
    assert.match(styles, /--bv-ui-control-height-compact/);
    assert.match(styles, /\.bv-density-compact\s*\{/);
    assert.match(styles, /\.bv-ui-window-context \.bv-select-shell/);
});

test("anchored select menus keep viewport geometry instead of inheriting portal width", () => {
    assert.doesNotMatch(styles, /\.bv-select-menu\s*\{[^}]*min-width:\s*100%/s);
    assert.doesNotMatch(styles, /\.bv-select-menu\s*\{[^}]*(?:left:\s*0|right:\s*0)/s);
    assert.match(styles, /\.bv-anchored-popover\s*\{[^}]*position:\s*fixed[^}]*right:\s*auto[^}]*min-width:\s*0/s);
});

test("scrollable textareas theme the scrollbar corner and native resize affordance", () => {
    assert.match(styles, /\.bv-textarea-shell>textarea::-webkit-scrollbar-corner\s*\{/);
    assert.match(styles, /\.bv-textarea-shell>textarea::-webkit-resizer\s*\{/);
    assert.match(styles, /\.bv-textarea-shell>textarea\s*\{[^}]*scrollbar-color:/s);
});

test("regional inspector uses compact controls and a viewport-safe framework color picker", () => {
    assert.match(options, /<UiDensity\s+density="compact"/);
    assert.doesNotMatch(options, /<code>\{props\.region\.authoring\.color/);
    assert.match(forms, /<AnchoredPopover\b/);
    assert.match(overlays, /export\s*\{\s*AnchoredPopover,\s*Portal\s*\}\s*from\s*"\.\/floating"/);
    assert.match(floating, /export function AnchoredPopover/);
    assert.match(styles, /\.bv-anchored-popover\s*\{[^}]*position:\s*fixed/s);
    assert.doesNotMatch(styles, /\.region-color-control label\s*\{[^}]*grid-template-columns/s);
});

test("window chrome keeps title and compact context controls in one refined header row", () => {
    assert.match(windowChrome, /bv-ui-window-title/);
    assert.doesNotMatch(windowChrome, /bv-ui-window-copy/);
    assert.match(styles, /\.bv-ui-window-identity\s*\{[^}]*display:flex[^}]*align-items:center/s);
    assert.match(styles, /\.bv-ui-window-control\s*\{[^}]*width:calc\(24px/s);
    assert.match(editorMenus, /<Button intent="ghost" density="compact"/);
    assert.match(windowChrome, /aria-label=\{switchLabel\}/);
    assert.match(styles, /\.bv-managed-window \.bv-ui-window-header\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/s);
    assert.match(styles, /\.bv-window-navigator \.bv-select-trigger\s*\{[^}]*height:22px/s);
    assert.match(styles, /\.bv-window-switch-mode>span:last-child\s*\{\s*display:none/);
});

test("managed workspace windows follow the regional editor inset chrome", () => {
    assert.match(styles, /\.bv-managed-window\.workspace\s*\{[^}]*left:24px[^}]*top:58px[^}]*width:calc\(100vw - 48px\)[^}]*height:calc\(100vh - 82px\)[^}]*border-radius:/s);
    assert.match(styles, /\.bv-managed-window\s*\{[^}]*outline:0/s);
});

test("managed floating windows expose resize hit zones on every edge and corner", () => {
    assert.match(windowChrome, /\["n","ne","e","se","s","sw","w","nw"\]/);
    assert.match(windowChrome, /beginResize\(direction\)/);
    assert.match(windowChrome, /resizeFloatingWindow\(active\.geometry,delta,active\.direction,minSize\)/);
    assert.match(styles, /\.bv-managed-window\.floating\s*\{\s*resize:none/);
    for (const direction of ["n","ne","e","se","s","sw","w","nw"]) assert.match(styles, new RegExp(`\\.bv-window-resize-handle(?:[^}]*|[^\\n]*)\\.${direction}\\b`));
});

test("custom edge resizing has no native ResizeObserver feedback path", () => {
    const managedWindow = windowChrome.slice(windowChrome.indexOf("export function BvManagedWindow"), windowChrome.indexOf("export function BvWindowFooter"));
    assert.doesNotMatch(managedWindow, /new ResizeObserver/);
});

test("regional toolbar uses compact framework buttons and theme-colored outline icons", () => {
    assert.match(regionalToolPalette, /<Toolbar\s+orientation="vertical"[^>]*density="compact"/);
    assert.match(styles, /\.bv-toolbar \.bv-button>svg\s*\{[^}]*fill:none[^}]*stroke:currentColor/s);
});

test("regional default layout separates geometric tools left from prompting right", () => {
    const selectionStart = options.indexOf('activeTab !== "selection"');
    const regionStart = options.indexOf('activeTab !== "region"');
    const documentStart = options.indexOf('activeTab !== "document"');
    const selectionPanel = options.slice(selectionStart, regionStart);
    const regionPanel = options.slice(regionStart, documentStart);
    assert.match(selectionPanel, /<RegionMaskAppearance\b/);
    assert.match(options, /const RegionMaskAppearance[\s\S]*Display color[\s\S]*label="Feather"|const RegionMaskAppearance[\s\S]*label="Feather"[\s\S]*Display color/);
    assert.doesNotMatch(regionPanel, /Display color|label="Feather"/);
    assert.match(regionalEditor, /type:"row", weight:22[\s\S]*component:"regions"[\s\S]*component:"selection"/);
    assert.match(regionalEditor, /type:"tabset", weight:55[^\n]*component:"regions"/);
    assert.match(regionalEditor, /type:"tabset", weight:45[^\n]*component:"selection"/);
    assert.match(regionalEditor, /type:"row", weight:24[\s\S]*component:"global"[\s\S]*component:"region"/);
});

test("prompt editors compose only canonical BV UI controls", () => {
    assert.match(options, /const PromptEditor[\s\S]*<Accordion\b/);
    const promptEditorStart = options.indexOf("const PromptEditor");
    const promptEditorEnd = options.indexOf("export default", promptEditorStart);
    assert.doesNotMatch(options.slice(promptEditorStart, promptEditorEnd), /<(?:details|summary|button|input|select|textarea)\b/);
    for (const component of ["BvManagedWindow", "SelectField", "FieldFrame", "Callout", "Badge", "Button"]) assert.match(quickPromptEditor, new RegExp(`<${component}\\b`));
    assert.doesNotMatch(quickPromptEditor, /<(?:button|input|select|textarea|details|summary)\b/);
    assert.match(quickPromptEditor, /bv-density-compact/);
    assert.match(quickPromptEditor, /<BvManagedWindow[\s\S]*?allowWorkspace=\{false\}/);
    assert.match(detailerView, /<BvManagedWindow\b/);
    assert.match(detectorView, /<BvManagedWindow\b/);
    assert.match(promptTextarea, /className="bv-textarea-shell resize-vertical"/);
    assert.match(promptTextarea, /<TextareaControl\b/);
    for (const source of [quickPromptEditor, detailerView, detectorView]) assert.doesNotMatch(source, /<(?:button|input|select|textarea)\b/);
});
test("selection inspector orders appearance before layer geometry and uses a two by two bounds grid", () => {
    const selectionStart = options.indexOf('activeTab !== "selection"');
    const regionStart = options.indexOf('activeTab !== "region"');
    const selection = options.slice(selectionStart, regionStart);
    assert.ok(selection.indexOf("<RegionMaskAppearance") < selection.indexOf("<section className=\"bv-inspector-section\"><h3>Layer"));
    assert.match(selection, /className="bv-layer-bounds-grid"/);
    assert.match(styles, /\.bv-layer-bounds-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
});
