import type { CSSProperties } from "react";
import type { CompletionSuggestion } from "./engine";
import { Button } from "../ui";

export function CompletionPopup({ suggestions, selected, position, onAccept }: { suggestions: CompletionSuggestion[]; selected: number; position: { left: number; top: number; width: number }; onAccept: (index: number) => void }) {
    return <div className="bv-completion-popup bv-global-completion-popup" style={position as CSSProperties} role="listbox">
        {suggestions.map((item, index) => <Button intent="ghost" key={item.id} className={index === selected ? "active" : ""} onPointerDown={event => { event.preventDefault(); onAccept(index); }}><span>{item.label}</span><small>{[item.category, item.detail, item.source].filter(Boolean).join(" · ")}</small></Button>)}
    </div>;
}
