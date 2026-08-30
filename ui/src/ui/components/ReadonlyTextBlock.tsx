import React,{useEffect,useRef,useState}from"react";
import{Button}from"./actions";

export function ReadonlyTextBlock({text,typeName,truncated=false,placeholder}:{text:string;typeName?:string;truncated?:boolean;placeholder:string}){
    const[copied,setCopied]=useState(false),[copyFailed,setCopyFailed]=useState(false);
    const resetTimer=useRef<ReturnType<typeof setTimeout>>();
    useEffect(()=>()=>{if(resetTimer.current)clearTimeout(resetTimer.current)},[]);
    const copy=async()=>{
        try{
            if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
            await navigator.clipboard.writeText(text);setCopyFailed(false);setCopied(true);if(resetTimer.current)clearTimeout(resetTimer.current);resetTimer.current=setTimeout(()=>setCopied(false),1200);
        }catch{setCopied(false);setCopyFailed(true)}
    };
    return <div className="bv-readonly-text-block">
        <header><span>{typeName||"Waiting for execution"}{truncated?" · truncated":""}</span><Button intent="ghost" onClick={copy} disabled={!text}>{copyFailed?"Copy failed":copied?"Copied":"Copy"}</Button></header>
        <pre aria-label="BV Inspect Any value">{text||placeholder}</pre>
    </div>;
}
