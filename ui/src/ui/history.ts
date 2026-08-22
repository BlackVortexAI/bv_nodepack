import { useCallback, useEffect, useRef, useState } from "react";

export const BV_HISTORY_LIMIT = 100;

export function useBvHistory<T>(initial: T, clone: (value:T) => T = value => structuredClone(value)) {
    const [value,setValue]=useState<T>(()=>clone(initial)),[past,setPast]=useState<T[]>([]),[future,setFuture]=useState<T[]>([]);
    const valueRef=useRef(value);valueRef.current=value;
    const commit=useCallback((next:T|((current:T)=>T))=>{setValue(current=>{const resolved=typeof next==="function"?(next as (value:T)=>T)(clone(current)):next;setPast(items=>[...items.slice(-(BV_HISTORY_LIMIT-1)),clone(current)]);setFuture([]);return clone(resolved)});},[clone]);
    const replace=useCallback((next:T,clear=false)=>{setValue(clone(next));if(clear){setPast([]);setFuture([])}},[clone]);
    const undo=useCallback(()=>{setPast(items=>{if(!items.length)return items;const previous=items[items.length-1];setFuture(next=>[clone(valueRef.current),...next].slice(0,BV_HISTORY_LIMIT));setValue(clone(previous));return items.slice(0,-1)})},[clone]);
    const redo=useCallback(()=>{setFuture(items=>{if(!items.length)return items;const next=items[0];setPast(previous=>[...previous.slice(-(BV_HISTORY_LIMIT-1)),clone(valueRef.current)]);setValue(clone(next));return items.slice(1)})},[clone]);
    const clear=useCallback(()=>{setPast([]);setFuture([])},[]);
    return {value,commit,replace,undo,redo,clear,canUndo:past.length>0,canRedo:future.length>0};
}

export const isTextEditingTarget = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);

export function useBvHistoryShortcuts(history:{undo:()=>void;redo:()=>void;canUndo:boolean;canRedo:boolean},active=true){
    useEffect(()=>{if(!active)return;const action=(event:KeyboardEvent)=>{if(isTextEditingTarget(event.target)||!event.ctrlKey||event.altKey)return null;const key=event.key.toLowerCase();return key==="y"||key==="z"&&event.shiftKey?"redo":key==="z"?"undo":null},consume=(event:KeyboardEvent)=>{event.preventDefault();event.stopImmediatePropagation()},keydown=(event:KeyboardEvent)=>{const next=action(event);if(!next)return;consume(event);if(next==="undo"&&history.canUndo)history.undo();else if(next==="redo"&&history.canRedo)history.redo()},keyup=(event:KeyboardEvent)=>{if(action(event))consume(event)};window.addEventListener("keydown",keydown,{capture:true});window.addEventListener("keyup",keyup,{capture:true});return()=>{window.removeEventListener("keydown",keydown,{capture:true});window.removeEventListener("keyup",keyup,{capture:true})}},[active,history.canRedo,history.canUndo,history.redo,history.undo]);
}
