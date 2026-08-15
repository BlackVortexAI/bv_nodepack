import * as React from "react";
import { FC, useMemo, useState } from "react";
import { getApp } from "../../appHelper";
import { collectAllGroups } from "../../util/control/collector";
import { BVControl, BVControlConfig, readConfig, writeConfig } from "../../util/control/configHandler";
import { findActiveControlConflicts } from "../../util/control/controlCenterModel.js";
import BVControlRowComponent from "./BVControlRowComponent";

function id() {
    return globalThis.crypto?.randomUUID?.() ?? `bv-control-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const BVControlComponent: FC<{ onClose(): void }> = ({ onClose }) => {
    const [config, setConfig] = useState<BVControlConfig>(() => {
        const current = readConfig();
        const available = new Set(collectAllGroups(getApp()).map((group) => group.id));
        return {
            ...current,
            controls: current.controls.map((control) => ({
                ...control,
                assignments: control.assignments.map((assignment) => ({ ...assignment, unresolved: !available.has(assignment.groupId) })),
            })),
        };
    });
    const groups = useMemo(() => collectAllGroups(getApp()), [config]);
    const conflicts = useMemo(() => findActiveControlConflicts(config), [config]);
    const updateControl = (index: number, control: BVControl | null) => {
        setConfig({ ...config, controls: control ? config.controls.map((item, itemIndex) => itemIndex === index ? control : item) : config.controls.filter((_, itemIndex) => itemIndex !== index) });
    };
    const addControl = () => {
        let name = "New Control";
        let suffix = 2;
        while (config.controls.some((control) => control.name === name)) name = `New Control ${suffix++}`;
        setConfig({ ...config, controls: [...config.controls, { id: id(), name, enabled: true, assignments: [] }] });
    };
    const save = () => {
        const names = config.controls.map((control) => control.name.trim());
        if (names.some((name) => !name) || new Set(names).size !== names.length) return;
        const available = new Set(groups.map((group) => group.id));
        const resolved = {
            ...config,
            controls: config.controls.map((control) => ({
                ...control,
                name: control.name.trim(),
                assignments: control.assignments.map((assignment) => ({ ...assignment, unresolved: !available.has(assignment.groupId) })),
            })),
        };
        writeConfig(resolved);
        setConfig(resolved);
    };

    return <div className="bv-rack">
        <header><div><h2>BV Control Rack</h2><p>User-defined workflow states</p></div><button onClick={onClose}>×</button></header>
        <label className="bv-force"><input type="checkbox" checked={config.forceActive} onChange={(event) => setConfig({ ...config, forceActive: event.target.checked })} /> Force active after releasing restrictions</label>
        <div className="bv-controls">{config.controls.map((control, index) => <BVControlRowComponent key={control.id} control={control} groups={groups} conflicts={conflicts} onChange={(value) => updateControl(index, value)} />)}</div>
        <footer><button onClick={addControl}>Add Control</button><button className="primary" onClick={save}>Save Configuration</button></footer>
    </div>;
};

export default BVControlComponent;
