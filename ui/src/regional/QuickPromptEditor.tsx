import React, { useEffect, useMemo, useRef, useState } from "react";
import { clone, parseDocument, PromptPair, RegionalDocument } from "./model";
import { clampQuickPromptPosition, loadEditorState, saveEditorState } from "./editorState";
import PromptTextarea from "../completion/PromptTextarea";

export type RegionalNodeRef = {
    id: number | string;
    title?: string;
    widgets?: Array<{ name: string; value: unknown; callback?: (value: unknown) => void }>;
    graph?: { setDirtyCanvas?: (foreground: boolean, background: boolean) => void };
};

type Props = {
    open: boolean;
    nodes: RegionalNodeRef[];
    initialNode: RegionalNodeRef | null;
    onClose: () => void;
    onOpenEditor: (node: RegionalNodeRef) => void;
};

const widgetFor = (node: RegionalNodeRef | null) => node?.widgets?.find(widget => widget.name === "regional_json");
const targetExists = (document: RegionalDocument, target: string) => target === "global" || target === "background" || document.regions.some(region => region.id === target);
const promptsFor = (document: RegionalDocument, target: string): PromptPair => target === "global"
    ? document.prompts.global
    : target === "background"
        ? document.prompts.background
        : document.regions.find(region => region.id === target)?.prompts ?? document.prompts.global;

export default function QuickPromptEditor({ open, nodes, initialNode, onClose, onOpenEditor }: Props) {
    const [node, setNode] = useState<RegionalNodeRef | null>(initialNode);
    const [documentValue, setDocumentValue] = useState<RegionalDocument | null>(null);
    const [target, setTarget] = useState("global");
    const [position, setPosition] = useState({ x: Math.max(16, window.innerWidth - 544), y: 84 });
    const [error, setError] = useState("");
    const shell = useRef<HTMLDivElement>(null);
    const drag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null);

    useEffect(() => {
        if (initialNode) setNode(initialNode);
        else if (!node && nodes[0]) setNode(nodes[0]);
    }, [initialNode, node, nodes]);

    useEffect(() => {
        if (!node) return;
        try {
            const next = parseDocument(widgetFor(node)?.value);
            const stored = loadEditorState(next.document_id);
            const nextTarget = targetExists(next, stored.quickPromptTarget) ? stored.quickPromptTarget : "global";
            setDocumentValue(next);
            setTarget(nextTarget);
            setPosition(clampQuickPromptPosition(stored.quickPromptWindow, { width: window.innerWidth, height: window.innerHeight }));
            setError("");
        } catch (reason) {
            setDocumentValue(null);
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    }, [node, open]);

    useEffect(() => {
        if (!open) return;
        const recover = () => setPosition(current => clampQuickPromptPosition(current, { width: window.innerWidth, height: window.innerHeight }, { width: shell.current?.offsetWidth ?? 520, height: shell.current?.offsetHeight ?? 560 }));
        window.addEventListener("resize", recover);
        return () => window.removeEventListener("resize", recover);
    }, [open]);

    const prompts = useMemo(() => documentValue ? promptsFor(documentValue, target) : null, [documentValue, target]);
    const selectTarget = (nextTarget: string) => {
        setTarget(nextTarget);
        if (!documentValue) return;
        const state = loadEditorState(documentValue.document_id);
        saveEditorState(documentValue.document_id, { ...state, quickPromptTarget: nextTarget });
    };
    const persistPosition = (nextPosition: { x: number; y: number }) => {
        if (!documentValue) return;
        const state = loadEditorState(documentValue.document_id);
        saveEditorState(documentValue.document_id, { ...state, quickPromptWindow: nextPosition });
    };
    const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
        if ((event.target as Element).closest("button")) return;
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ...position };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
    };
    const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
        const active = drag.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const rect = shell.current?.getBoundingClientRect();
        setPosition(clampQuickPromptPosition({ x: active.x + event.clientX - active.startX, y: active.y + event.clientY - active.startY }, { width: window.innerWidth, height: window.innerHeight }, { width: rect?.width ?? 520, height: rect?.height ?? 560 }));
    };
    const endDrag = (event: React.PointerEvent<HTMLElement>) => {
        const active = drag.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const rect = shell.current?.getBoundingClientRect();
        const finalPosition = clampQuickPromptPosition({ x: active.x + event.clientX - active.startX, y: active.y + event.clientY - active.startY }, { width: window.innerWidth, height: window.innerHeight }, { width: rect?.width ?? 520, height: rect?.height ?? 560 });
        drag.current = null;
        setPosition(finalPosition);
        persistPosition(finalPosition);
    };
    const updatePrompts = (nextPrompts: PromptPair) => {
        if (!documentValue || !node) return;
        const next = clone(documentValue);
        if (target === "global") next.prompts.global = nextPrompts;
        else if (target === "background") next.prompts.background = nextPrompts;
        else {
            const region = next.regions.find(item => item.id === target);
            if (!region) return;
            region.prompts = nextPrompts;
        }
        setDocumentValue(next);
        const widget = widgetFor(node);
        if (widget) {
            widget.value = JSON.stringify(next);
            widget.callback?.(widget.value);
        }
        node.graph?.setDirtyCanvas?.(true, true);
    };

    if (!open) return null;
    return <div ref={shell} className="bv-quick-prompt-shell" role="dialog" aria-modal="false" aria-label="BV Regional Quick Edit" style={{ left: position.x, top: position.y }} onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); onClose(); }
    }}>
        <header onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><span aria-hidden="true">⠿</span><strong>Regional Quick Edit</strong><button title="Close" onClick={onClose}>×</button></header>
        <label>Regional Prompt Node<select value={node?.id ?? ""} onChange={event => setNode(nodes.find(item => String(item.id) === event.target.value) ?? null)}>{nodes.map(item => <option key={item.id} value={String(item.id)}>{`${item.title || "BV Regional Prompt"} · #${item.id}`}</option>)}</select></label>
        {error ? <div className="bv-regional-error">{error}</div> : documentValue && prompts && <>
            <label>Prompt Target<select value={target} onChange={event => selectTarget(event.target.value)}>
                <option value="global">Global</option>
                <option value="background">Background</option>
                {documentValue.regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
            </select></label>
            <label>Positive<PromptTextarea autoFocus value={prompts.positive_source} onValue={positive_source => updatePrompts({ ...prompts, positive_source })} completionContext={{ scope: target === "global" || target === "background" ? target : "region", polarity: "positive" }}/></label>
            <label>Negative<PromptTextarea value={prompts.negative_source} onValue={negative_source => updatePrompts({ ...prompts, negative_source })} completionContext={{ scope: target === "global" || target === "background" ? target : "region", polarity: "negative" }}/></label>
            <footer><span>Autosaved</span><button onClick={() => node && onOpenEditor(node)}>Open Full Editor</button></footer>
        </>}
    </div>;
}
