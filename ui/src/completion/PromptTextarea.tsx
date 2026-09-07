import React, { useEffect, useRef, useState } from "react";
import { collectSuggestions, completionRequest, CompletionContext, CompletionSuggestion, insertSuggestion } from "./engine";
import { localCompletionProvider } from "./localProvider";
import { embeddingCompletionProvider } from "./embeddingRuntimeProvider";
import { useCompletionEnabled, useCompletionPlacement } from "./settings";
import { completionPopupPosition } from "./position";
import { TextareaControl, Portal, Button } from "../ui/components";
import { CompletionPopup } from "./CompletionPopup";

import { referenceRequest, insertReference, updateMentions, type ReferenceChoice, type ReferenceMention } from "./referenceMentions";

type ReferenceEditing = {enabled:boolean;choices:ReferenceChoice[];mentions:ReferenceMention[];onChange:(text:string,mentions:ReferenceMention[])=>void};
type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; onValue: (value: string) => void; completionContext: CompletionContext; references?:ReferenceEditing };

export default function PromptTextarea({ value, onValue, completionContext, references, onKeyDown, onBlur, onSelect, ...props }: Props) {
    const composing = useRef(false);
    const [referenceQuery,setReferenceQuery] = useState<ReturnType<typeof referenceRequest>>(null);
    const referenceLimit = (references?.mentions.length??0)>=100;
    const matches = referenceQuery && !referenceLimit ? (references?.choices??[]).filter(choice=>choice.available!==false&&`${choice.label} ${choice.origin}`.toLowerCase().includes(referenceQuery.term)).slice(0,30) : [];
    const inventoryKey = JSON.stringify((references?.choices??[]).map(choice=>[choice.collector_id,choice.resource_id,choice.available,choice.label,choice.origin]));
    const change = (text:string) => references ? references.onChange(text,updateMentions(value,text,references.mentions)) : onValue(text);
    const enabled = useCompletionEnabled();
    const placement = useCompletionPlacement();
    const textarea = useRef<HTMLTextAreaElement>(null);
    const [suggestions, setSuggestions] = useState<CompletionSuggestion[]>([]);
    const [selected, setSelected] = useState(0);
    const [popup, setPopup] = useState<{ left: number; top: number; width: number } | null>(null);
    const requestRef = useRef<ReturnType<typeof completionRequest>>(null);
    const abortRef = useRef<AbortController | null>(null);
    const timerRef = useRef<number | null>(null);
    const popupHeightRef = useRef(210);
    const searchRef = useRef<(text: string, caret: number, selectionEnd?: number) => void>(() => {});

    const close = () => { if(timerRef.current!=null)window.clearTimeout(timerRef.current);setReferenceQuery(null);abortRef.current?.abort(); setSuggestions([]); setPopup(null); };
    const position = () => { const element = textarea.current; if (element) setPopup(completionPopupPosition(element, placement, popupHeightRef.current)); };
    const search = (text: string, caret: number, selectionEnd = caret) => {
        if(composing.current)return close();
        if(references?.enabled&&caret===selectionEnd){
            const query=referenceRequest(text,caret);
            if(query&&!references.mentions.some(mention=>caret>mention.start&&caret<=mention.end)){
                if(timerRef.current!=null)window.clearTimeout(timerRef.current);abortRef.current?.abort();setSuggestions([]);setReferenceQuery(query);setSelected(0);position();return;
            }
        }
        setReferenceQuery(null);
        if (!enabled) return close();
        if (caret !== selectionEnd) return close();
        if (timerRef.current != null) window.clearTimeout(timerRef.current);
        abortRef.current?.abort();
        const request = completionRequest(text, caret, completionContext);
        requestRef.current = request;
        if (!request) return close();
        const controller = new AbortController(); abortRef.current = controller;
        timerRef.current = window.setTimeout(async () => {
            const items = await collectSuggestions(request, [embeddingCompletionProvider, localCompletionProvider], controller.signal);
            if (controller.signal.aborted) return;
            const element = textarea.current;
            setSuggestions(items); setSelected(0);
            setPopup(items.length && element ? completionPopupPosition(element, placement) : null);
        }, 120);
    };
    searchRef.current = search;
    const accept = (index = selected) => {
        if(referenceQuery&&references){const choice=matches[index];if(!choice)return;const next=insertReference(value,referenceQuery,choice,references.mentions);references.onChange(next.text,next.mentions);close();requestAnimationFrame(()=>{textarea.current?.focus();textarea.current?.setSelectionRange(next.caret,next.caret)});return;}
        const request = requestRef.current, suggestion = suggestions[index];
        if (!request || !suggestion) return;
        const next = insertSuggestion(value, request, suggestion);
        change(next.text); close();
        requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(next.caret, next.caret); });
    };

    useEffect(() => { close(); }, [enabled, references?.enabled, inventoryKey, completionContext.scope, completionContext.polarity]);
    useEffect(() => {
        const selectionChanged = () => { const element = textarea.current; if (element && document.activeElement === element) searchRef.current(element.value, element.selectionStart, element.selectionEnd); };
        document.addEventListener("selectionchange", selectionChanged);
        return () => document.removeEventListener("selectionchange", selectionChanged);
    }, []);
    useEffect(() => { if (popup) position(); }, [placement]);
    useEffect(() => {
        if (!popup) return;
        window.addEventListener("scroll", position, true);
        window.addEventListener("resize", position);
        return () => { window.removeEventListener("scroll", position, true); window.removeEventListener("resize", position); };
    }, [Boolean(popup), placement]);
    useEffect(() => () => { abortRef.current?.abort(); if (timerRef.current != null) window.clearTimeout(timerRef.current); }, []);
    return <>
        <span className="bv-textarea-shell resize-vertical"><TextareaControl {...props} ref={textarea} value={value} onChange={event => { change(event.target.value); search(event.target.value, event.target.selectionStart, event.target.selectionEnd); }} onSelect={event => { search(event.currentTarget.value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd); onSelect?.(event); }} onCompositionStart={()=>{composing.current=true;close();}} onCompositionEnd={event=>{composing.current=false;search(event.currentTarget.value,event.currentTarget.selectionStart,event.currentTarget.selectionEnd)}} onKeyDown={event => {
            if(event.nativeEvent.isComposing||composing.current)return;
            const length=referenceQuery?matches.length:suggestions.length;
            if (event.key === "Escape" && (referenceQuery || length)) { event.preventDefault(); event.stopPropagation(); close(); return; }
            if (length) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); setSelected(current => (current + (event.key === "ArrowDown" ? 1 : -1) + length) % length); return; }
                if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); accept(); return; }
            }
            onKeyDown?.(event);
        }} onBlur={event => { window.setTimeout(close, 120); onBlur?.(event); }}/></span>
        {references&&references.mentions.length>0&&<div className="bv-reference-marks">{references.mentions.map((mention,index)=>{const choice=references.choices.find(item=>item.collector_id===mention.collector_id&&item.resource_id===mention.resource_id);return <span tabIndex={0} key={index} className={`bv-reference-mark ${!choice||choice.available===false?"missing":""}`} title={choice?`${choice.origin} · ${choice.available===false?"Unconnected reference place":"Stored reference"}`:"Reference registry or place unavailable"}>{mention.label}{choice?.preview&&<img src={choice.preview} alt={choice.label}/>}</span>})}</div>}
        {referenceQuery&&popup&&<Portal><div className="bv-completion-popup bv-global-completion-popup bv-reference-popup" style={popup} role="listbox" aria-label="References">{matches.map((choice,index)=><Button key={`${choice.collector_id}:${choice.resource_id}`} role="option" aria-selected={selected===index} intent="ghost" className={selected===index?"active":""} onPointerDown={event=>{event.preventDefault();accept(index)}}>{choice.preview?<img src={choice.preview} alt=""/>:<span className="bv-reference-placeholder" aria-hidden="true">▧</span>}<span>{choice.label}<small>{choice.origin}</small></span></Button>)}{!matches.length&&<p>{referenceLimit?"Maximum 100 references per prompt.":"No available references."}</p>}</div></Portal>}
        {enabled && !referenceQuery && popup && <CompletionPopup
            suggestions={suggestions}
            selected={selected}
            position={popup}
            onAccept={accept}
            onHeight={height => { if (Math.abs(height - popupHeightRef.current) < 1) return; popupHeightRef.current = height; position(); }}
        />}
    </>;
}
