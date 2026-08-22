import React, { useState } from "react";
import { Button, Toolbar } from "./actions";
import { NumberField, SelectField } from "./forms";

export type Tool = "select" | "rect-add" | "rect-subtract" | "ellipse-add" | "ellipse-subtract" | "polygon-add" | "polygon-subtract" | "brush-add" | "brush-subtract";
export type BrushSettings = { size: number; hardness: number; opacity: number; shape: "round" | "square"; pressureMode: "constant" | "stylus" };

const Icon = ({ name }: { name: Tool | "settings" }) => {
    if (name === "select") return <svg viewBox="0 0 24 24"><path d="M5 3l13 9-6 1 4 7-3 1-4-7-4 4z"/></svg>;
    if (name.startsWith("rect")) return <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1"/><path d={name.endsWith("subtract") ? "M16 17h6" : "M16 17h6M19 14v6"}/></svg>;
    if (name.startsWith("ellipse")) return <svg viewBox="0 0 24 24"><ellipse cx="11" cy="12" rx="8" ry="6"/><path d={name.endsWith("subtract") ? "M16 18h6" : "M16 18h6M19 15v6"}/></svg>;
    if (name.startsWith("polygon")) return <svg viewBox="0 0 24 24"><path d="M4 18L7 5l12 3 1 11z"/><path d={name.endsWith("subtract") ? "M16 18h6" : "M16 18h6M19 15v6"}/></svg>;
    if (name === "brush-add") return <svg viewBox="0 0 24 24"><path d="M14 4l6 6-9 9H5v-6z"/><path d="M16 17h6M19 14v6"/></svg>;
    if (name === "brush-subtract") return <svg viewBox="0 0 24 24"><path d="M14 4l6 6-9 9H5v-6z"/><path d="M16 17h6"/></svg>;
    return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>;
};

type Props = {
    tool: Tool;
    brush: BrushSettings;
    canSubtract: boolean;
    canvas: { width: number; height: number };
    onTool: (tool: Tool) => void;
    onBrush: (settings: BrushSettings) => void;
};

export default function RegionalToolPalette({ tool, brush, canSubtract, canvas, onTool, onBrush }: Props) {
    const [options, setOptions] = useState(false), brushActive = tool.startsWith("brush");
    const tools: Array<{ id: Tool; title: string }> = [
        { id: "select", title: "Select and transform" },
        { id: "rect-add", title: "Add rectangle" }, { id: "rect-subtract", title: "Subtract rectangle from selected layer" },
        { id: "ellipse-add", title: "Add ellipse" }, { id: "ellipse-subtract", title: "Subtract ellipse from selected layer" },
        { id: "polygon-add", title: "Add polygon (click points, Enter or double-click to close)" }, { id: "polygon-subtract", title: "Subtract polygon from selected layer" },
        { id: "brush-add", title: "Add brush stroke" },
        { id: "brush-subtract", title: "Subtract from selected layer" },
    ];
    return <div className="artboard-tools" onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
        <Toolbar orientation="vertical" density="compact" label="Regional drawing tools" items={[...tools.map(item => ({ id:item.id,label:item.title,icon:<Icon name={item.id}/>,active:tool===item.id,disabled:item.id.endsWith("subtract")&&!canSubtract,onSelect:()=>{onTool(item.id);if(!item.id.startsWith("brush"))setOptions(false);},group:item.id.split("-")[0] })),...(brushActive?[{id:"brush-settings",label:"Brush settings",icon:<Icon name="settings"/>,active:options,onSelect:()=>setOptions(value=>!value),group:"settings"}]:[])]}/>
        {brushActive && options && <div className="brush-flyout">
            <header><strong>Brush</strong><Button intent="ghost" iconOnly aria-label="Close brush settings" onClick={() => setOptions(false)}>×</Button></header>
            <NumberField label="Brush size" value={brush.size} min={.005} max={.25} step={.005} unit={`${Math.round(brush.size * Math.min(canvas.width, canvas.height))} px`} onValue={size=>onBrush({...brush,size})}/>
            <NumberField label="Hardness" value={brush.hardness} min={0} max={1} step={.05} unit="×" onValue={hardness=>onBrush({...brush,hardness})}/>
            <NumberField label="Opacity" value={brush.opacity} min={.05} max={1} step={.05} unit="×" onValue={opacity=>onBrush({...brush,opacity})}/>
            <SelectField label="Shape" value={brush.shape} onValue={shape=>onBrush({...brush,shape:shape as BrushSettings["shape"]})} options={[{value:"round",label:"Round"},{value:"square",label:"Square"}]}/>
            <SelectField label="Pressure" value={brush.pressureMode} onValue={pressureMode=>onBrush({...brush,pressureMode:pressureMode as BrushSettings["pressureMode"]})} options={[{value:"constant",label:"Constant"},{value:"stylus",label:"Stylus"}]}/>
        </div>}
    </div>;
}
