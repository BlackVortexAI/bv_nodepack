import React, { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Button } from "./actions";
import { AnchoredPopover } from "./floating";
import { Tabs } from "./navigation";
import { toggleSegment, visibleSegmentCount } from "./segmentedModel";


export type ToggleSegment = { id: string; label: string; disabled?: boolean };
export function SegmentedToggleGroup({ items, value, onValue, label, required = false }: {
    items: ToggleSegment[]; value: string[]; onValue: (value: string[]) => void; label: string; required?: boolean;
}) {
    const host = useRef<HTMLDivElement>(null), measure = useRef<HTMLDivElement>(null), overflow = useRef<HTMLDivElement>(null);
    const [count, setCount] = useState(items.length), [open, setOpen] = useState(false);
    const signature = items.map(item => item.label).join("\0");
    useLayoutEffect(() => {
        const update = () => {
            const widths = Array.from(measure.current?.children ?? []).map(child => child.getBoundingClientRect().width);
            setCount(visibleSegmentCount(widths, host.current?.getBoundingClientRect().width ?? 0, 64));
        };
        update(); const observer = new ResizeObserver(update);
        if (host.current) observer.observe(host.current);
        if (measure.current) observer.observe(measure.current);
        return () => observer.disconnect();
    }, [signature]);
    const hidden = items.slice(count), hiddenActive = hidden.filter(item => value.includes(item.id)).length;
    const toggle = (id: string) => onValue(toggleSegment(value, id, required));
    return <div className="bv-segmented-host" ref={host}>
        <div className="bv-segmented-measure" ref={measure} aria-hidden="true">{items.map(item => <span key={item.id}>{item.label}</span>)}</div>
        <div className="bv-segmented-group" role="group" aria-label={label}>
            {items.slice(0, count).map(item => <Button key={item.id} type="button" aria-label={item.label} aria-pressed={value.includes(item.id)} disabled={item.disabled} onClick={() => toggle(item.id)}>{item.label}</Button>)}
            {hidden.length > 0 && <div ref={overflow} className="bv-segmented-overflow">
                <Button type="button" aria-label={`${label}: more options${hiddenActive ? `, ${hiddenActive} active` : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>…{hiddenActive > 0 && <small>{hiddenActive}</small>}</Button>
                <AnchoredPopover open={open} anchor={overflow} onClose={() => setOpen(false)} className="bv-menu">
                    <div role="menu" aria-label={label} className="bv-menu-content" onKeyDown={event => {
                        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                        event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
                        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                        buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
                    }}>{hidden.map((item, index) => <button autoFocus={index === 0} type="button" role="menuitemcheckbox" aria-checked={value.includes(item.id)} disabled={item.disabled} key={item.id} onClick={() => toggle(item.id)}><span aria-hidden="true">{value.includes(item.id) ? "✓" : "○"}</span><span>{item.label}</span></button>)}</div>
                </AnchoredPopover>
            </div>}
        </div>
    </div>;
}

export function ToolTabs({ items, value, onValue, label = "Tools" }: {
    items: (ToggleSegment & { content: ReactNode })[]; value: string[]; onValue: (value: string[]) => void; label?: string;
}) {
    const [selected, setSelected] = useState(value[0] ?? "");
    const active = items.filter(item => value.includes(item.id));
    const current = active.some(item => item.id === selected) ? selected : active[0]?.id ?? "";
    return <div className="bv-tool-tabs"><SegmentedToggleGroup items={items} value={value} label={label} onValue={next => {
        const added = next.find(id => !value.includes(id)); if (added) setSelected(added); onValue(next);
    }}/>{active.length === 1 ? <div className="bv-tool-content">{active[0].content}</div> : active.length > 1 ? <Tabs variant="compact" label={`${label} settings`} items={active} value={current} onValue={setSelected}/> : null}</div>;
}
