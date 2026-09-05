import React,{useRef,type KeyboardEventHandler,type PointerEventHandler}from"react";
import{resizePaneFromPointer}from"./resizeSeparatorModel";
export{clampPaneWidth,resizePaneFromPointer}from"./resizeSeparatorModel";

export function ResizeSeparator({label,value,min,max,step=20,onValue}:{label:string;value:number;min:number;max:number;step?:number;onValue:(value:number)=>void}){
  const drag=useRef<{pointerId:number;startX:number;startValue:number}>();
  const begin:PointerEventHandler<HTMLDivElement>=event=>{if(event.button!==0)return;drag.current={pointerId:event.pointerId,startX:event.clientX,startValue:value};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault()};
  const move:PointerEventHandler<HTMLDivElement>=event=>{const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;onValue(resizePaneFromPointer(active.startValue,active.startX,event.clientX,min,max))};
  const end:PointerEventHandler<HTMLDivElement>=event=>{if(drag.current?.pointerId===event.pointerId)drag.current=undefined};
  const key:KeyboardEventHandler<HTMLDivElement>=event=>{const next=event.key==="ArrowLeft"?Math.min(max,value+step):event.key==="ArrowRight"?Math.max(min,value-step):event.key==="Home"?min:event.key==="End"?max:null;if(next===null)return;event.preventDefault();onValue(next)};
  return <div className="bv-resize-separator" role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} tabIndex={0} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={key}><span/></div>;
}
