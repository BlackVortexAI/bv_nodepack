import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Layout, Model, TabNode, type IJsonModel } from "flexlayout-react";
import "flexlayout-react/style/combined.css";
import "./styles.css";

const STORAGE_KEY = "bv.prototype.workspace-layout.v1";
const variants = ["alpha-dark", "dark", "bv"] as const;
type Variant = typeof variants[number];

const defaultLayout: IJsonModel = {
  global: {
    tabEnableClose: false,
    tabEnablePopout: false,
    tabEnablePopoutIcon: false,
    tabEnablePopoutFloatIcon: true,
    splitterSize: 8,
    tabSetMinWidth: 180,
    tabSetMinHeight: 130,
  },
  borders: [],
  layout: {
    type: "row",
    weight: 100,
    children: [
      { type: "tabset", id: "tools", weight: 22, selected: 0, children: [
        { type: "tab", id: "regions", name: "Regions", component: "regions", enablePopoutFloatIcon: true },
        { type: "tab", id: "brushes", name: "Brushes", component: "brushes", enablePopoutFloatIcon: true },
      ]},
      { type: "tabset", id: "workspace", weight: 54, selected: 0, children: [
        { type: "tab", id: "canvas", name: "Region Canvas", component: "canvas", enablePopoutFloatIcon: true },
      ]},
      { type: "tabset", id: "properties", weight: 24, selected: 0, children: [
        { type: "tab", id: "settings", name: "Properties", component: "properties", enablePopoutFloatIcon: true },
        { type: "tab", id: "history", name: "History", component: "history", enablePopoutFloatIcon: true },
      ]},
    ],
  },
};

function loadModel() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return Model.fromJson(stored ? JSON.parse(stored).layout : defaultLayout);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return Model.fromJson(defaultLayout);
  }
}

function Panel({ type }: { type: string }) {
  if (type === "canvas") return <div className="panel canvas-panel"><div className="canvas-grid"/><div className="canvas-card"><span>WORKSPACE</span><strong>Region editing canvas</strong><p>Drag tabs to dock them. Use the square icon in a tab to create an internal floating panel.</p></div></div>;
  if (type === "regions") return <div className="panel"><h2>Regions</h2>{["Subject · P0", "Clothing · P1", "Background · P2"].map((name, i) => <button className={i === 0 ? "list-row active" : "list-row"} key={name}><span className="region-dot"/>{name}<small>{i + 2} layers</small></button>)}</div>;
  if (type === "brushes") return <div className="panel"><h2>Brush tools</h2><div className="tool-grid">{["Select", "Brush", "Erase", "Polygon", "Move", "Fill"].map(x => <button key={x}>{x}</button>)}</div></div>;
  if (type === "properties") return <div className="panel properties"><h2>Region properties</h2><label>Name<input value="Subject" readOnly/></label><label>Opacity<input type="range" defaultValue="72"/></label><label>Priority<input value="0" readOnly/></label><button className="primary">Apply changes</button></div>;
  if (type === "history") return <div className="panel"><h2>History</h2>{["Changed mask opacity", "Moved Clothing", "Created Subject"].map(x => <div className="history-row" key={x}>{x}<small>just now</small></div>)}</div>;
  return <div className="panel">Unknown panel</div>;
}

function App() {
  const initialVariant = new URLSearchParams(location.search).get("variant") as Variant | null;
  const [variant, setVariantState] = useState<Variant>(variants.includes(initialVariant as Variant) ? initialVariant as Variant : "bv");
  const [model, setModel] = useState(loadModel);
  const [status, setStatus] = useState("Stored layout restored when available.");
  const themeClass = variant === "alpha-dark" ? "flexlayout__theme_alpha_dark" : "flexlayout__theme_dark";
  const factory = useMemo(() => (node: TabNode) => <Panel type={node.getComponent() ?? "unknown"}/>, []);
  const selectVariant = (next: Variant) => {
    setVariantState(next);
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(null, "", url);
  };
  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, library: "flexlayout-react@0.10.5", layout: model.toJson() }));
    setStatus(`Saved ${new Date().toLocaleTimeString("en-GB")}`);
  };
  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setModel(Model.fromJson(defaultLayout));
    setStatus("Default three-column layout restored.");
  };
  return <main className={`prototype ${themeClass} variant-${variant}`}>
    <header className="prototype-header"><div><span className="eyebrow">THROWAWAY INTEGRATION PROTOTYPE</span><h1>BV docking workspace</h1><p>FlexLayout 0.10.5 · internal floating only · React 18 · offline bundle</p></div><div className="header-actions"><button onClick={save}>Save layout</button><button onClick={reset}>Reset</button></div></header>
    <section className="layout-stage" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      <Layout model={model} factory={factory} constrainFloatPanels onModelChange={() => setStatus("Layout changed · save when ready")}/>
    </section>
    <footer className="state-strip"><output>{status}</output><code>{JSON.stringify({ variant, storage: STORAGE_KEY, layouts: 1 + Object.keys(model.toJson().subLayouts ?? {}).length }, null, 0)}</code></footer>
    <nav className="variant-bar" aria-label="Prototype variants"><span>Theme</span>{variants.map(item => <button key={item} className={item === variant ? "active" : ""} onClick={() => selectVariant(item)}>{item === "bv" ? "BV Custom" : item}</button>)}</nav>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App/>);
