import React, { useState } from "react";

export type Tool = "select" | "rect" | "brush-add" | "brush-subtract";
export type BrushSettings = { size: number; hardness: number; opacity: number; shape: "round" | "square"; pressureMode: "constant" | "stylus" };

const Icon = ({ name }: { name: Tool | "settings" }) => {
    if (name === "select") return <svg viewBox="0 0 24 24"><path d="M5 3l13 9-6 1 4 7-3 1-4-7-4 4z"/></svg>;
    if (name === "rect") return <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1"/></svg>;
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

export default function ToolPalette({ tool, brush, canSubtract, canvas, onTool, onBrush }: Props) {
    const [options, setOptions] = useState(false), brushActive = tool.startsWith("brush");
    const tools: Array<{ id: Tool; title: string }> = [
        { id: "select", title: "Select and transform" },
        { id: "rect", title: "Draw rectangle" },
        { id: "brush-add", title: "Add brush stroke" },
        { id: "brush-subtract", title: "Subtract from selected layer" },
    ];
    return <div className="artboard-tools" onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
        <div className="tool-palette">{tools.map(item => <button key={item.id} title={item.title} disabled={item.id === "brush-subtract" && !canSubtract} className={tool === item.id ? "active" : ""} onClick={() => { onTool(item.id); if (!item.id.startsWith("brush")) setOptions(false); }}><Icon name={item.id}/></button>)}{brushActive && <button title="Brush settings" className={options ? "active" : ""} onClick={() => setOptions(value => !value)}><Icon name="settings"/></button>}</div>
        {brushActive && options && <div className="brush-flyout">
            <header><strong>Brush</strong><button onClick={() => setOptions(false)}>×</button></header>
            <label>Brush Size <output>{Math.round(brush.size * Math.min(canvas.width, canvas.height))} px</output><input type="range" min=".005" max=".25" step=".005" value={brush.size} onChange={event => onBrush({ ...brush, size: +event.target.value })}/></label>
            <label>Hardness <output>{Math.round(brush.hardness * 100)} %</output><input type="range" min="0" max="1" step=".05" value={brush.hardness} onChange={event => onBrush({ ...brush, hardness: +event.target.value })}/></label>
            <label>Opacity <output>{Math.round(brush.opacity * 100)} %</output><input type="range" min=".05" max="1" step=".05" value={brush.opacity} onChange={event => onBrush({ ...brush, opacity: +event.target.value })}/></label>
            <label>Shape<select value={brush.shape} onChange={event => onBrush({ ...brush, shape: event.target.value as BrushSettings["shape"] })}><option value="round">Round</option><option value="square">Square</option></select></label>
            <label>Pressure<select value={brush.pressureMode} onChange={event => onBrush({ ...brush, pressureMode: event.target.value as BrushSettings["pressureMode"] })}><option value="constant">Constant</option><option value="stylus">Stylus</option></select></label>
        </div>}
    </div>;
}
