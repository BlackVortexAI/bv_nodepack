import React, { useEffect, useRef } from "react";
import type { EditorMenu } from "./editorState";
import { setCompletionEnabled, setCompletionPlacement, useCompletionEnabled, useCompletionPlacement } from "../completion/settings";
import DatasetPicker from "../completion/DatasetPicker";

type Props = {
    displayOpacity: number;
    backgroundOpacity: number;
    isolate: boolean;
    hasSelection: boolean;
    onDisplayOpacity: (value: number) => void;
    onBackgroundOpacity: (value: number) => void;
    onToggleIsolate: () => void;
    onExportDocument: () => void;
    onExportRegions: () => void;
    onImportDocument: (file: File) => void;
    onImportRegions: (file: File) => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    canMergeLayers: boolean;
    onMergeLayers: () => void;
    canSplitCompoundLayer: boolean;
    onSplitCompoundLayer: () => void;
    canSplitDisconnectedAreas: boolean;
    onSplitDisconnectedAreas: () => void;
    canvas: { width: number; height: number };
    onCanvas: (value: { width: number; height: number }) => void;
    openMenu: EditorMenu;
    onOpenMenu: (menu: EditorMenu) => void;
};

export default function EditorMenus(props: Props) {
    const autocomplete = useCompletionEnabled();
    const completionPlacement = useCompletionPlacement();
    const menu = props.openMenu, root = useRef<HTMLDivElement>(null);
    const documentInput = useRef<HTMLInputElement>(null), regionsInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) props.onOpenMenu(null); };
        window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close);
    }, [props.onOpenMenu]);
    const toggle = (value: EditorMenu) => props.onOpenMenu(menu === value ? null : value);
    return <div className="editor-menus" ref={root}>
        <div className="menu-item"><button onClick={() => toggle("file")}>File</button>{menu === "file" && <div className="menu-popover">
            <button onClick={() => { props.onExportDocument(); props.onOpenMenu(null); }}>Export Document</button>
            <button onClick={() => { documentInput.current?.click(); props.onOpenMenu(null); }}>Load and Replace Document</button>
            <hr/>
            <button onClick={() => { props.onExportRegions(); props.onOpenMenu(null); }}>Export Regions</button>
            <button onClick={() => { regionsInput.current?.click(); props.onOpenMenu(null); }}>Add Regions</button>
        </div>}</div>
        <div className="menu-item"><button onClick={() => toggle("edit")}>Edit</button>{menu === "edit" && <div className="menu-popover completion-menu"><button disabled={!props.canUndo} onClick={props.onUndo}>Undo <kbd>Ctrl Z</kbd></button><button disabled={!props.canRedo} onClick={props.onRedo}>Redo <kbd>Ctrl Shift Z</kbd></button><hr/><button className={autocomplete ? "active" : ""} onClick={() => setCompletionEnabled(!autocomplete, true)}>{autocomplete ? "✓ " : ""}Prompt Autocomplete</button><small>Optional. Disable it when using another completion extension.</small><label>Popup Position<select value={completionPlacement} onChange={event => setCompletionPlacement(event.target.value, true)}><option value="caret">At Caret</option><option value="field">Below Text Field</option></select></label><hr/><DatasetPicker/></div>}</div>
        <div className="menu-item"><button onClick={() => toggle("view")}>View</button>{menu === "view" && <div className="menu-popover view-menu"><label>Mask Display <output>{Math.round(props.displayOpacity * 100)} %</output><input type="range" min=".05" max="1" step=".05" value={props.displayOpacity} onChange={event => props.onDisplayOpacity(+event.target.value)}/></label><label>Background Image <output>{Math.round(props.backgroundOpacity * 100)} %</output><input type="range" min="0" max="1" step=".05" value={props.backgroundOpacity} onChange={event => props.onBackgroundOpacity(+event.target.value)}/></label><button disabled={!props.hasSelection} className={props.isolate ? "active" : ""} onClick={props.onToggleIsolate}>Isolate Selection</button><small>Affects the editor display only.</small></div>}</div>
        <div className="menu-item"><button onClick={() => toggle("artboard")}>Artboard</button>{menu === "artboard" && <div className="menu-popover artboard-menu"><label>Width<input type="number" min="1" value={props.canvas.width} onChange={event => props.onCanvas({ ...props.canvas, width: Math.max(1, +event.target.value) })}/></label><label>Height<input type="number" min="1" value={props.canvas.height} onChange={event => props.onCanvas({ ...props.canvas, height: Math.max(1, +event.target.value) })}/></label></div>}</div>
        <div className="menu-item"><button onClick={() => toggle("layers")}>Layers</button>{menu === "layers" && <div className="menu-popover"><button disabled={!props.canMergeLayers} onClick={() => { props.onMergeLayers(); props.onOpenMenu(null); }}>Merge Selected Layers <kbd>Ctrl E</kbd></button><small>Ctrl-click or Shift-click layers in one region to select them.</small><button disabled={!props.canSplitCompoundLayer} onClick={() => { props.onSplitCompoundLayer(); props.onOpenMenu(null); }}>Split Compound Layer <kbd>Ctrl Shift E</kbd></button><small>Restores the independent mask groups retained by Merge.</small><hr/><button disabled={!props.canSplitDisconnectedAreas} onClick={() => { props.onSplitDisconnectedAreas(); props.onOpenMenu(null); }}>Split Disconnected Areas…</button><small>Rasterizes the selected layer and converts its visible islands into independent pixel-preserving layers at the current canvas resolution.</small></div>}</div>
        <div className="menu-item"><button className="help-button" title="Keyboard and mouse commands" onClick={() => toggle("help")}>?</button>{menu === "help" && <div className="menu-popover help-menu"><section className="help-section"><strong>Keyboard</strong><dl><dt>Ctrl Z</dt><dd>Undo</dd><dt>Ctrl Shift Z</dt><dd>Redo</dd><dt>Ctrl E</dt><dd>Merge selected layers</dd><dt>Ctrl Shift E</dt><dd>Split compound layer</dd><dt>Escape</dt><dd>Cancel action</dd><dt>Delete</dt><dd>Delete layer</dd><dt>Shift + Resize</dt><dd>Scale proportionally</dd><dt>Space + Drag</dt><dd>Pan artboard</dd></dl></section><section className="help-section"><strong>Mouse</strong><dl><dt>Click</dt><dd>Select layer</dd><dt>Ctrl + Click</dt><dd>Add/remove layer selection</dd><dt>Shift + Click</dt><dd>Select layer range</dd><dt>Drag</dt><dd>Draw or move</dd><dt>Drag handles</dt><dd>Resize</dd><dt>Mouse wheel</dt><dd>Zoom under cursor</dd><dt>Middle button + Drag</dt><dd>Pan artboard</dd><dt>Double-click name</dt><dd>Rename</dd></dl></section></div>}</div>
        <input hidden ref={documentInput} type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) props.onImportDocument(file); event.target.value = ""; }}/>
        <input hidden ref={regionsInput} type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) props.onImportRegions(file); event.target.value = ""; }}/>
    </div>;
}
