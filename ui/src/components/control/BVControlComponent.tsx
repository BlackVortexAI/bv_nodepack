
import * as React from 'react';
import {BVControlRow, readConfig, writeConfig} from "../../util/control/configHandler";
import BVControlRowComponent from "./BVControlRowComponent";

const BVControlComponent = () => {

    const [config, setConfig] = React.useState(readConfig());

    const addRow = () => {
        if (config) {
            const baseTitle = "New Row";
            let newTitle = baseTitle;
            let counter = 1;
            while (config.rows.some(r => r.title === newTitle)) {
                newTitle = `${baseTitle} ${counter}`;
                counter++;
            }
            setConfig({rows: [...config.rows, {title: newTitle, entries: []}]});
        } else {
            setConfig({rows: [{title: "New Row", entries: []}]});
        }
    }

    const saveConfig = () => {
        writeConfig(config);
    }

    const clearConfig = () => {
        writeConfig(null);
        setConfig(null);
    }

    const onChange = (index: number, row: BVControlRow, del: boolean) => {
        if (config) {
            if (del) {
                setConfig({...config, rows: config.rows.filter((_, i) => i !== index)});
            }else{
                // Prevent duplicate titles
                const isDuplicate = config.rows.some((r, i) => i !== index && r.title === row.title);
                if (isDuplicate) {
                    // Option 1: Just don't update if it's a duplicate title
                    // But we might want to update other parts of the row (entries)
                    // So we only block if the title specifically is being changed to a duplicate
                    const oldRow = config.rows[index];
                    if (oldRow.title !== row.title) {
                        // Title changed and it's a duplicate. We could revert the title or auto-increment it.
                        // For now, let's just not update the title if it's a duplicate.
                        // Or better: call a function that makes it unique.
                        let uniqueTitle = row.title;
                        let counter = 1;
                        while (config.rows.some((r, i) => i !== index && r.title === uniqueTitle)) {
                            uniqueTitle = `${row.title} ${counter}`;
                            counter++;
                        }
                        row = {...row, title: uniqueTitle};
                    }
                }
                setConfig({...config, rows: config.rows.map((r, i) => i === index ? row : r)});
            }
        }
    }

    const cols = (config?.rows.reduce((m, r) => Math.max(m, r.entries.length), 0) ?? 0) + 3;

    return (
        <div className={"grid grid-cols-1 gap-4 p-4"}>
            {config &&
                <div
                    className={"grid gap-4 p-4 items-center"}
                    style={{ gridTemplateColumns: `max-content repeat(${cols - 2}, auto) max-content` }}
                >
                    {Array.from({length: cols}, (_, i) => {
                        if (i === 0) return <div key={`header_${i}`}>Title</div>;
                        if (i === cols - 1) return <div key={`header_${i}`}></div>;
                        return <div key={`header_${i}`}>Selection {i}</div>;
                    })}

                    {config.rows.map((row, i) => (
                        <BVControlRowComponent key={i} index={i} row={row} onChange={onChange} maxCols={cols}/>
                    ))}
                </div>
            }
            <div className={"grid grid-cols-3 gap-4 p-4"}>
                <button onClick={addRow}>Add Row</button>
                <button onClick={saveConfig}>Save Config</button>
                <button onClick={clearConfig}>Clear Config</button>
            </div>
        </div>
    );
};

export default BVControlComponent;
