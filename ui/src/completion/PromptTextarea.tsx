import React, { useEffect, useRef, useState } from "react";
import { collectSuggestions, completionRequest, CompletionContext, CompletionSuggestion, insertSuggestion } from "./engine";
import { exTagCompleteProvider } from "./exTagProvider";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; onValue: (value: string) => void; completionContext: CompletionContext };

export default function PromptTextarea({ value, onValue, completionContext, onKeyDown, onBlur, ...props }: Props) {
    const textarea = useRef<HTMLTextAreaElement>(null);
    const [suggestions, setSuggestions] = useState<CompletionSuggestion[]>([]);
    const [selected, setSelected] = useState(0);
    const [popup, setPopup] = useState<{ left: number; top: number; width: number } | null>(null);
    const requestRef = useRef<ReturnType<typeof completionRequest>>(null);
    const abortRef = useRef<AbortController | null>(null);
    const timerRef = useRef<number | null>(null);

    const close = () => { abortRef.current?.abort(); setSuggestions([]); setPopup(null); };
    const search = (text: string, caret: number) => {
        if (timerRef.current != null) window.clearTimeout(timerRef.current);
        abortRef.current?.abort();
        const request = completionRequest(text, caret, completionContext);
        requestRef.current = request;
        if (!request) return close();
        const controller = new AbortController(); abortRef.current = controller;
        timerRef.current = window.setTimeout(async () => {
            const items = await collectSuggestions(request, [exTagCompleteProvider], controller.signal);
            if (controller.signal.aborted) return;
            const rect = textarea.current?.getBoundingClientRect();
            setSuggestions(items); setSelected(0);
            setPopup(items.length && rect ? { left: rect.left, top: Math.min(window.innerHeight - 220, rect.bottom + 4), width: rect.width } : null);
        }, 120);
    };
    const accept = (index = selected) => {
        const request = requestRef.current, suggestion = suggestions[index];
        if (!request || !suggestion) return;
        const next = insertSuggestion(value, request, suggestion);
        onValue(next.text); close();
        requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(next.caret, next.caret); });
    };

    useEffect(() => () => { abortRef.current?.abort(); if (timerRef.current != null) window.clearTimeout(timerRef.current); }, []);
    return <>
        <textarea {...props} ref={textarea} value={value} onChange={event => { onValue(event.target.value); search(event.target.value, event.target.selectionStart); }} onKeyDown={event => {
            if (suggestions.length) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); setSelected(current => (current + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); return; }
                if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); accept(); return; }
                if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
            }
            onKeyDown?.(event);
        }} onBlur={event => { window.setTimeout(close, 120); onBlur?.(event); }}/>
        {popup && <div className="bv-completion-popup" style={{ left: popup.left, top: popup.top, width: popup.width }} role="listbox">
            {suggestions.map((item, index) => <button type="button" key={item.id} className={index === selected ? "active" : ""} onMouseDown={event => { event.preventDefault(); accept(index); }}><span>{item.label}</span><small>{[item.category, item.detail, item.source].filter(Boolean).join(" · ")}</small></button>)}
        </div>}
    </>;
}
