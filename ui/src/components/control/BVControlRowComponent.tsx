import * as React from "react";
import { FC } from "react";
import { CollectedGroup } from "../../util/control/collector";
import { BVControl, BVControlAction } from "../../util/control/configHandler";
import type { BVControlConflict } from "../../util/control/controlCenterModel.js";

const BVControlRowComponent: FC<{ control: BVControl; groups: CollectedGroup[]; conflicts: BVControlConflict[]; onChange(value: BVControl | null): void }> = ({ control, groups, conflicts, onChange }) => {
    const actionLabel = (action: string) => action.charAt(0).toUpperCase() + action.slice(1);
    const addAssignment = (groupId: string) => {
        const group = groups.find((item) => item.id === groupId);
        if (!group || control.assignments.some((item) => item.groupId === groupId)) return;
        onChange({ ...control, assignments: [...control.assignments, { groupId, groupPath: group.pathLabel, groupTitle: String(group.group.title || ""), action: "bypass" }] });
    };
    return <section className="bv-control-card">
        <div className="bv-control-title"><input value={control.name} onChange={(event) => onChange({ ...control, name: event.target.value })} /><span>{control.assignments.length} groups</span><button onClick={() => onChange(null)}>Delete</button></div>
        <div className="bv-assignments">{control.assignments.map((assignment, index) => {
            const conflict = conflicts.find((item) => item.groupId === assignment.groupId);
            const winnerNames = conflict?.entries.filter((entry) => entry.action === conflict.winnerAction).map((entry) => entry.controlName).join(", ");
            const conflictText = conflict
                ? assignment.action === conflict.winnerAction
                    ? `Overrides ${[...new Set(conflict.entries.filter((entry) => entry.action !== conflict.winnerAction).map((entry) => actionLabel(entry.action)))].join(", ")}`
                    : `Overridden by ${actionLabel(conflict.winnerAction)} from ${winnerNames}`
                : "";
            return <div className={assignment.unresolved ? "unresolved" : conflict ? "conflict" : ""} key={assignment.groupId}>
                <span>{assignment.unresolved ? "⚠ " : ""}{assignment.groupPath}{conflictText && <small>⚠ {conflictText}</small>}</span>
                <select value={assignment.action} onChange={(event) => onChange({ ...control, assignments: control.assignments.map((item, itemIndex) => itemIndex === index ? { ...item, action: event.target.value as BVControlAction } : item) })}><option value="activate">Activate</option><option value="mute">Mute</option><option value="bypass">Bypass</option></select>
                <button onClick={() => onChange({ ...control, assignments: control.assignments.filter((_, itemIndex) => itemIndex !== index) })}>×</button>
            </div>;
        })}</div>
        <select value="" onChange={(event) => addAssignment(event.target.value)}><option value="">Add group…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.pathLabel}</option>)}</select>
    </section>;
};

export default BVControlRowComponent;
