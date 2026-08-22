import * as React from "react";
import { FC } from "react";
import { CollectedGroup } from "../../util/control/collector";
import { BVControl, BVControlAction } from "../../util/control/configHandler";
import type { BVControlConflict } from "../../util/control/controlCenterModel.js";
import { Button, SelectField, TextField } from "../../ui/components";

const BVControlRowComponent: FC<{ control: BVControl; groups: CollectedGroup[]; conflicts: BVControlConflict[]; onChange(value: BVControl | null): void }> = ({ control, groups, conflicts, onChange }) => {
    const actionLabel = (action: string) => action.charAt(0).toUpperCase() + action.slice(1);
    const addAssignment = (groupId: string) => {
        const group = groups.find((item) => item.id === groupId);
        if (!group || control.assignments.some((item) => item.groupId === groupId)) return;
        onChange({ ...control, assignments: [...control.assignments, { groupId, groupPath: group.pathLabel, groupTitle: String(group.group.title || ""), action: "bypass" }] });
    };
    return <section className="bv-control-card">
        <div className="bv-control-title"><TextField label="Control name" value={control.name} onValue={name=>onChange({...control,name})}/><span>{control.assignments.length} groups</span><Button intent="danger" onClick={() => onChange(null)}>Delete</Button></div>
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
                <SelectField label="Action" value={assignment.action} options={[{value:"activate",label:"Activate"},{value:"mute",label:"Mute"},{value:"bypass",label:"Bypass"}]} onValue={action=>onChange({...control,assignments:control.assignments.map((item,itemIndex)=>itemIndex===index?{...item,action:action as BVControlAction}:item)})}/>
                <Button intent="ghost" iconOnly aria-label="Remove assignment" onClick={() => onChange({ ...control, assignments: control.assignments.filter((_, itemIndex) => itemIndex !== index) })}>×</Button>
            </div>;
        })}</div>
        <SelectField label="Add group" value="" onValue={addAssignment} options={[{value:"",label:"Choose group…"},...groups.map(group=>({value:group.id,label:group.pathLabel}))]}/>
    </section>;
};

export default BVControlRowComponent;
