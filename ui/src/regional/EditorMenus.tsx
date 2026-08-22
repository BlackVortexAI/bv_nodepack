import React, { useEffect, useRef, useState } from "react";
import type { EditorMenu } from "./editorState";
import { setCompletionEnabled, setCompletionPlacement, useCompletionEnabled, useCompletionPlacement } from "../completion/settings";
import DatasetPicker from "../completion/DatasetPicker";
import { Button, CheckboxField, DefinitionList, NumberField, Popover, SelectField } from "../ui/components";

type Props = {
    displayOpacity: number;
    backgroundOpacity: number;
    isolate: boolean;
    binaryMaskPreview: boolean;
    hasSelection: boolean;
    onDisplayOpacity: (value: number) => void;
    onBackgroundOpacity: (value: number) => void;
    onToggleIsolate: () => void;
    onToggleBinaryMaskPreview: () => void;
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
    canvas: { width: number; height: number };
    onCanvas: (value: { width: number; height: number }) => void;
    openMenu: EditorMenu;
    onOpenMenu: (menu: EditorMenu) => void;
};

export default function EditorMenus(props: Props) {
    const autocomplete = useCompletionEnabled();
    const completionPlacement = useCompletionPlacement();
    const menu = props.openMenu, root = useRef<HTMLDivElement>(null),[showMenusInOverflow,setShowMenusInOverflow]=useState(false);
    const documentInput = useRef<HTMLInputElement>(null), regionsInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) props.onOpenMenu(null); };
        window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close);
    }, [props.onOpenMenu]);
    useEffect(()=>{const header=root.current?.closest<HTMLElement>(".bv-ui-window-header");if(!header)return;const measure=()=>setShowMenusInOverflow(header.clientWidth<520),observer=new ResizeObserver(measure);observer.observe(header);measure();return()=>observer.disconnect()},[]);
    const toggle = (value: EditorMenu) => props.onOpenMenu(menu === value ? null : value);
    const controlled=(id:Exclude<EditorMenu,null>,label:string,content:React.ReactNode)=><Popover open={menu===id} onOpen={open=>props.onOpenMenu(open?id:null)} trigger={({toggle})=><Button intent="ghost" density="compact" aria-label={label} title={label} aria-expanded={menu===id} onClick={toggle}><span className="editor-menu-label-full">{label}</span><span className="editor-menu-label-short" aria-hidden="true">{label==="?"?label:label[0]}</span></Button>}>{content}</Popover>;
    const buttons=<>
        {controlled("file","File",<div className="bv-menu-stack"><Button intent="ghost" onClick={()=>{props.onExportDocument();props.onOpenMenu(null)}}>Export Document</Button><Button intent="ghost" onClick={()=>documentInput.current?.click()}>Load and Replace Document</Button><hr/><Button intent="ghost" onClick={()=>{props.onExportRegions();props.onOpenMenu(null)}}>Export Regions</Button><Button intent="ghost" onClick={()=>regionsInput.current?.click()}>Add Regions</Button></div>)}
        {controlled("edit","Edit",<div className="bv-menu-stack"><Button intent="ghost" disabled={!props.canUndo} onClick={props.onUndo}>Undo <kbd>Ctrl Z</kbd></Button><Button intent="ghost" disabled={!props.canRedo} onClick={props.onRedo}>Redo <kbd>Ctrl Shift Z</kbd></Button><CheckboxField label="Prompt Autocomplete" help="Optional. Disable it when using another completion extension." checked={autocomplete} onValue={value=>setCompletionEnabled(value,true)}/><SelectField label="Popup Position" value={completionPlacement} onValue={value=>setCompletionPlacement(value,true)} options={[{value:"caret",label:"At Caret"},{value:"field",label:"Below Text Field"}]}/><DatasetPicker/></div>)}
        {controlled("view","View",<div className="bv-menu-stack"><NumberField label="Mask Display" value={props.displayOpacity} min={.05} max={1} step={.05} unit="×" onValue={props.onDisplayOpacity}/><NumberField label="Background Image" value={props.backgroundOpacity} min={0} max={1} step={.05} unit="×" onValue={props.onBackgroundOpacity}/><CheckboxField label="Binary Mask Preview" checked={props.binaryMaskPreview} onValue={props.onToggleBinaryMaskPreview}/><CheckboxField label="Isolate Selection" checked={props.isolate} disabled={!props.hasSelection} onValue={props.onToggleIsolate}/><small>Affects the editor display only.</small></div>)}
        {controlled("artboard","Artboard",<div className="bv-menu-stack"><NumberField label="Width" value={props.canvas.width} min={1} max={32768} step={1} unit="px" slider={false} onValue={width=>props.onCanvas({...props.canvas,width})}/><NumberField label="Height" value={props.canvas.height} min={1} max={32768} step={1} unit="px" slider={false} onValue={height=>props.onCanvas({...props.canvas,height})}/></div>)}
        {controlled("layers","Layers",<div className="bv-menu-stack"><Button intent="ghost" disabled={!props.canMergeLayers} onClick={()=>{props.onMergeLayers();props.onOpenMenu(null)}}>Merge Selected Layers <kbd>Ctrl E</kbd></Button><small>Ctrl-click or Shift-click layers in one region to select them.</small></div>)}
        {controlled("help","?",<div className="help-menu"><DefinitionList items={[{term:"Ctrl Z",description:"Undo"},{term:"Ctrl Shift Z",description:"Redo"},{term:"Ctrl E",description:"Merge selected layers"},{term:"Escape",description:"Cancel action"},{term:"Delete",description:"Delete layer"},{term:"Shift + Resize",description:"Scale proportionally"},{term:"Space + Drag",description:"Pan artboard"}]}/><DefinitionList items={[{term:"Click",description:"Select layer"},{term:"Ctrl + Click",description:"Add/remove layer selection"},{term:"Shift + Click",description:"Select layer range"},{term:"Drag",description:"Draw or move"},{term:"Mouse wheel",description:"Zoom under cursor"}]}/></div>)}
    </>;
    return <div className="editor-menus" ref={root}>{showMenusInOverflow?<Popover trigger={({toggle})=><Button intent="ghost" density="compact" aria-label="Editor menus" onClick={toggle}>•••</Button>}><div className="editor-menus-overflow-panel">{buttons}</div></Popover>:buttons}
        <input hidden ref={documentInput} type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) props.onImportDocument(file); event.target.value = ""; }}/>
        <input hidden ref={regionsInput} type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) props.onImportRegions(file); event.target.value = ""; }}/>
    </div>;
}
