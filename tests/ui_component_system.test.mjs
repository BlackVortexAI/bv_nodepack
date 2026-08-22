import assert from "node:assert/strict";
import { existsSync,readFileSync,readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const files=["actions","content","data","feedback","forms","navigation","overlays"];
const source=files.map(name=>readFileSync(new URL(`../ui/src/ui/components/${name}.tsx`,import.meta.url),"utf8")).join("\n");
const barrel=readFileSync(new URL("../ui/src/ui/index.ts",import.meta.url),"utf8");
const actions=readFileSync(new URL("../ui/src/ui/components/actions.tsx",import.meta.url),"utf8");
const showcase=readFileSync(new URL("../ui/src/showcase.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");

test("the internal BV UI module owns every approved showcase primitive",()=>{
    const exports=[
        "Button","MenuButton","SplitButton","Toolbar","FieldFrame","TextField","TextareaField","NumberField","SelectField","RichSelect","CheckboxField","ToggleField","BooleanField","OptionSet","TagInput","TagSelect","MultiSelect","SearchField","SecretField","NativePickerField","ColorField","KeybindingField","JsonEditor","CoordinateField","BoundsField",
        "Callout","Badge","Progress","Skeleton","EmptyState","Toast","ToastStack","ValidationSummary","Tabs","Accordion","Breadcrumbs","Pagination","Steps","Tooltip","Section","Card","Divider","PanelHeader","PanelFooter","CodeBlock","Quote","DataTable","DefinitionList","Dialog","Popover","CommandPalette","ContextMenu","SortableList","ImagePicker","ImagePreview","Tree"
    ];
    for(const name of exports)assert.match(source,new RegExp(`export (?:function|type) ${name}\\b`),`missing canonical ${name}`);
});

test("the project interface exports components, preferences, window chrome and docking",()=>{
    assert.match(barrel,/export \* from "\.\/components"/);
    assert.match(barrel,/export \* from "\.\/window"/);
    assert.match(barrel,/BvDockLayout/);
});

test("feature React code renders visible controls only through the BV UI module",()=>{
    const sourceRoot=fileURLToPath(new URL("../ui/src/",import.meta.url));
    const featureRoots=["regional","completion","components"].map(name=>`${sourceRoot}${name}`);
    const visit=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?visit(`${directory}/${entry.name}`):entry.name.endsWith(".tsx")?[`${directory}/${entry.name}`]:[]);
    for(const file of featureRoots.flatMap(visit)){
        const text=readFileSync(file,"utf8").split(/\r?\n/).filter(line=>!line.includes("<input hidden")).join("\n");
        assert.doesNotMatch(text,/<(?:button|input|select|textarea)\b/,`${file} bypasses the internal BV UI module`);
    }
});

test("imperative Comfy adapters mount React instead of maintaining a second control system",()=>{
    const sourceRoot=fileURLToPath(new URL("../ui/src/",import.meta.url));
    const visit=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?visit(`${directory}/${entry.name}`):/\.tsx?$/.test(entry.name)?[`${directory}/${entry.name}`]:[]);
    const exempt=[`${sourceRoot}ui/components`,`${sourceRoot}ui/window.tsx`];
    for(const file of visit(sourceRoot)){
        if(exempt.some(path=>file.startsWith(path)))continue;
        const text=readFileSync(file,"utf8");
        assert.doesNotMatch(text,/createElement\(["'](?:button|input|select|textarea)["']/,`${file} creates a parallel native control`);
    }
    assert.equal(existsSync(new URL("../ui/src/ui/dom.ts",import.meta.url)),false);
    assert.equal(existsSync(new URL("../ui/src/ui/react.tsx",import.meta.url)),false);
});

test("the reference showcase has no legacy static implementation",()=>{
    const html=readFileSync(new URL("../ui/showcase/index.html",import.meta.url),"utf8");
    assert.match(html,/src="\.\.\/\.\.\/src\/showcase\.tsx"/);
    assert.doesNotMatch(html,/<(?:button|input|select|textarea)\b/);
    for(const name of ["extended-controls.js","extended-controls.css","extended-controls.bundle.js"])
        assert.equal(existsSync(new URL(`../ui/showcase/${name}`,import.meta.url)),false);
});

test("density is inherited by default and can still be overridden locally",()=>{
    assert.doesNotMatch(actions,/function Button\([^\n]+density="comfortable"/);
    assert.doesNotMatch(actions,/function Toolbar\([^\n]+density="comfortable"/);
    assert.match(actions,/density\?`bv-density-\$\{density\}`:""/);
    assert.match(actions,/MenuButton[^\n]+density\?:ControlDensity/);
    assert.match(actions,/SplitButton[^\n]+density\?:ControlDensity/);
});

test("the showcase previews every component in compact and comfortable density",()=>{
    assert.match(showcase,/useState<ControlDensity>\("compact"\)/);
    assert.match(showcase,/<UiDensity density=\{density\} className="bv-ui bv-showcase">/);
    assert.match(showcase,/value:"compact",label:"Compact"/);
    assert.match(showcase,/value:"comfortable",label:"Comfortable"/);
});

test("the showcase documents the shared responsive window contract",()=>{
    for(const component of ["BvWindowHeader","BvWindowNavigator","BvWindowFooter","BvFooterActions"])
        assert.match(showcase,new RegExp(`<${component}\\b`),`showcase misses ${component}`);
    assert.match(showcase,/id="Windows"/);
    assert.match(showcase,/nodes=\{windowNodes\}/);
});

test("complex component spacing follows the shared density tokens",()=>{
    for(const token of ["--bv-ui-field-gap","--bv-ui-content-padding","--bv-ui-row-height","--bv-ui-textarea-height","--bv-ui-check-size"])
        assert.match(styles,new RegExp(token));
    for(const use of ["gap:var(--bv-ui-field-gap)","height:var(--bv-ui-control-height)","min-height:var(--bv-ui-textarea-height)","min-height:var(--bv-ui-row-height)","width:var(--bv-ui-check-size)"])
        assert.match(styles,new RegExp(use.replace(/[()]/g,"\\$&")));
});
test("compact is the framework fallback while comfortable remains opt-in",()=>{
    assert.match(actions,/UiDensity\(\{density="compact"/);
    for(const token of ["control-height","field-gap","content-padding","row-height","textarea-height","check-size"])
        assert.match(styles,new RegExp(`--bv-ui-${token}:var\\(--bv-ui-${token}-compact\\)`));
    assert.match(styles,/\.bv-density-comfortable \{[^}]+control-height-comfortable[^}]+textarea-height-comfortable/);
});
test("showcase issue batch uses canonical interactive chrome",()=>{
    const forms=readFileSync(new URL("../ui/src/ui/components/forms.tsx",import.meta.url),"utf8");
    const overlays=readFileSync(new URL("../ui/src/ui/components/overlays.tsx",import.meta.url),"utf8");
    const data=readFileSync(new URL("../ui/src/ui/components/data.tsx",import.meta.url),"utf8");
    assert.match(actions,/iconOnly\?\(icon\?\?children\)/,"icon-only buttons need a visible child fallback");
    assert.match(actions,/icon=\{<span className="bv-chevron"\/?>\}/,"split buttons own their chevron contract");
    assert.match(forms,/function SelectField[^]+role="listbox"/,"one-line selects must use themed listbox chrome");
    assert.match(forms,/className="bv-field-action"/,"embedded actions must use canonical action chrome");
    assert.match(overlays,/className="[^"]*bv-command-input[^"]*"/);
    assert.match(overlays,/className="bv-command-option"/);
    assert.match(data,/<Portal><div className="bv-image-preview"/);
    assert.match(data,/event\.key==="Escape"/);
    assert.match(data,/className="bv-image-preview-action"/);
    assert.match(data,/export function ImagePreview/);
    assert.match(data,/bv-image-preview-dialog/);
    assert.match(data,/naturalWidth/);
    assert.match(data,/onWheel=/);
    assert.match(data,/setPointerCapture/);
    assert.match(data,/onDoubleClick=/);
    assert.match(data,/event\.key==="0"/);
    assert.doesNotMatch(data,/\[open,src,onClose,view\.scale\]/);
    assert.match(data,/aria-label="Fit image to window"/);
    assert.doesNotMatch(data,/>Large preview<\/Button>/);
});

test("narrow component containers retain usable minimal layouts",()=>{
    assert.match(styles,/\.bv-compound-field \{[^}]+auto-fit/);
    assert.match(styles,/@container bv-control-field \(max-width:/);
    assert.match(styles,/\.bv-toolbar \{[^}]+flex-wrap:wrap/);
    assert.match(styles,/\.bv-toast \{[^}]+max-width:calc\(100vw/);
    assert.match(styles,/\.bv-option-set>button\[aria-checked=true\] \{[^}]+z-index:1/);
});
test("adaptive field contract restores the approved minimal popover mode",()=>{
    const forms=readFileSync(new URL("../ui/src/ui/components/forms.tsx",import.meta.url),"utf8");
    const overlays=readFileSync(new URL("../ui/src/ui/components/overlays.tsx",import.meta.url),"utf8");
    const data=readFileSync(new URL("../ui/src/ui/components/data.tsx",import.meta.url),"utf8");
    assert.match(overlays,/export function AdaptiveFieldPopover/);
    const floating=readFileSync(new URL("../ui/src/ui/components/floating.tsx",import.meta.url),"utf8");
    assert.match(floating,/matchWidth\?:boolean/);
    for(const component of ["TextField","TextareaField","NumberField","ColorField"]){
        const start=forms.indexOf(`export function ${component}`), next=forms.indexOf("export function ",start+16), block=forms.slice(start,next<0?undefined:next);
        assert.match(block,/AdaptiveFieldPopover/,`${component} lacks minimal popover mode`);
    }
    assert.match(forms,/className="bv-select-menu"[^>]*matchWidth/);
    assert.match(forms,/className="bv-search-results"[^>]*matchWidth/);
    assert.match(data,/className="bv-image-picker-menu"[^>]*matchWidth/);
    assert.match(styles,/@container bv-number-field \(max-width:380px\)/, "NumberField lacks its medium stacked state");
    assert.match(styles,/@container bv-adaptive-field \(max-width:220px\)/, "minimal popover starts before the medium state has useful room");
});

test("showcase exposes resizable component containers independent of viewport width",()=>{
    assert.match(showcase,/function ResizableDemo/);
    assert.match(showcase,/id="Responsive"/);
    assert.match(styles,/\.bv-resizable-demo \{[^}]+resize:horizontal/);
});

test("navigation and data components define narrow container behavior",()=>{
    assert.match(styles,/@container bv-tabs \(max-width:280px\)/);
    assert.match(styles,/\.bv-steps \{[^}]+overflow-x:auto/);
    assert.match(styles,/@container bv-definition-list \(max-width:280px\)/);
    assert.match(styles,/@container bv-sortable-item \(max-width:280px\)/);
});
test("every anchored popup uses the shared viewport portal",()=>{
    const forms=readFileSync(new URL("../ui/src/ui/components/forms.tsx",import.meta.url),"utf8");
    const overlays=readFileSync(new URL("../ui/src/ui/components/overlays.tsx",import.meta.url),"utf8");
    assert.match(actions,/className="bv-menu"/);
    assert.match(actions,/AnchoredPopover/);
    assert.match(overlays,/className="bv-popover"/);
    assert.ok((forms.match(/<AnchoredPopover/g)??[]).length>=4);
});
