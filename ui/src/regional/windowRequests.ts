export type RegionalWindowRequest="regional"|"quick"|"lora";
type Listener=(node:any|null)=>void;
const listeners=new Map<RegionalWindowRequest,Set<Listener>>();

const eventNames:Record<RegionalWindowRequest,string>={regional:"bv-open-regional-editor",quick:"bv-open-regional-quick-edit",lora:"bv-open-regional-lora-editor"};
export function canRequestRegionalWindow(kind:RegionalWindowRequest){return Boolean(listeners.get(kind)?.size);}
export function requestRegionalWindow(kind:RegionalWindowRequest,node:any|null=null){const bucket=listeners.get(kind),delivered=Boolean(bucket?.size);for(const listener of bucket??[])listener(node);if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(eventNames[kind],{detail:{node}}));return delivered;}
export function subscribeRegionalWindow(kind:RegionalWindowRequest,listener:Listener){let bucket=listeners.get(kind);if(!bucket){bucket=new Set();listeners.set(kind,bucket);}bucket.add(listener);return()=>{bucket?.delete(listener);if(!bucket?.size)listeners.delete(kind);};}
