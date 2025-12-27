import {FC} from "react";
import {BVControlEntry} from "../../util/control/configHandler";
import * as React from 'react';
import {BVControlRow} from "../../util/control/configHandler";
import { getApp } from "../../appHelper.js";
import {collectAllGroups} from "../../util/control/collector";

const BvControlRowComponent: FC<{ index: number, row: BVControlRow, maxCols: number, onChange(index: number, row: BVControlRow, del: boolean): void}> = ({index, row, maxCols, onChange}) => {

    const comfyApp = getApp();

    const groups = collectAllGroups(comfyApp);

    const onSelectedChange = (entryIndex: number | null, value: string) => {
        if (entryIndex === null) {
            const newEntry: BVControlEntry = {
                kind: "group",
                ref: {
                    title: value
                },
                action: "bypass"
            };
            onChange(index, {...row, entries: [...row.entries, newEntry]}, false);
            return
        }

        if (value == "Nothing Selected") {
            onChange(index, {...row, entries: row.entries.filter((_, i) => i !== entryIndex)}, false);
            return
        }
        const currentEntry = row.entries[entryIndex];
        const newEntry: BVControlEntry = {
            ...currentEntry,
            kind: "group",
            ref: {
                title: value
            }
        };
        onChange(index, {...row, entries: [...row.entries.slice(0, entryIndex), newEntry, ...row.entries.slice(entryIndex + 1)]}, false);
    }

    const onActionChange = (entryIndex: number, action: BVControlEntry["action"]) => {
        const currentEntry = row.entries[entryIndex];
        const newEntry: BVControlEntry = {
            ...currentEntry,
            action: action
        };
        onChange(index, {...row, entries: [...row.entries.slice(0, entryIndex), newEntry, ...row.entries.slice(entryIndex + 1)]}, false);
    }

    return (
        <>
            <div>
                <input type="text" value={row.title} onChange={(e) => onChange(index, {...row, title: e.target.value}, false)}/>
            </div>
            {row.entries.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: "4px" }}>
                    <select
                        value={entry.ref.title}
                        onChange={(e) => onSelectedChange(i, e.target.value)}
                    >
                        <option>Nothing Selected</option>
                        {groups.map((group) => {
                            return <option key={group.group.title}>{group.group.title}</option>;
                        })}
                    </select>
                    <select
                        value={entry.action}
                        onChange={(e) => onActionChange(i, e.target.value as BVControlEntry["action"])}
                    >
                        <option value="mute">Mute</option>
                        <option value="bypass">Bypass</option>
                    </select>
                </div>
            ))}
            <div>
                <select
                    value={"Nothing Selected"}
                    onChange={(e) => onSelectedChange(null, e.target.value)}
                >
                    <option>Nothing Selected</option>
                    {groups.map((group) => {
                        return <option key={group.group.title}>{group.group.title}</option>;
                    })}

                </select>
            </div>
            {Array.from({length: maxCols - row.entries.length - 3}).map((_, i) => (
                <div key={`empty_${i}`}></div>
            ))}
            <div>
                <button onClick={() => onChange(index, row, true)}>Delete</button>
            </div>
        </>
    );
};

export default BvControlRowComponent;
