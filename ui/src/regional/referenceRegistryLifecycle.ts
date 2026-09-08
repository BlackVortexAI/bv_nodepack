/** Native Autogrow identity seam; presentation is owned by nodePresentation.
 * See the design note reference-registry.md (private bv_nodepack_agents workspace) and the registered lifecycle exception.
 */
import {resolveNativeInputSource} from "./regionalNativeSource";
export type ReferenceEntry = {id:string;slot:string;media_type?:"IMAGE"|"AUDIO"|"VIDEO"};
export type ReferenceConfig = {schema:"bv.reference_registry_config";version:1;collector_id:string;entries:ReferenceEntry[];places?:ReferenceEntry[]};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const mediaSlot=(slot:any)=>/^media\.media([0-9]|[1-9][0-9])$/.test(String(slot?.name??""));
const slotKey=(slot:any)=>String(slot.name).slice("media.".length);
const widget=(node:any)=>node.widgets?.find((item:any)=>item.name==="config_json");
export function parseReferenceConfig(raw:unknown):ReferenceConfig {
    const value=typeof raw==="string"?JSON.parse(raw):raw as any;
    const config=value as ReferenceConfig;
    if ([...(config?.entries??[]),...(config?.places??[])].some(entry=>entry?.media_type!==undefined&&!['IMAGE','AUDIO','VIDEO'].includes(entry.media_type)))throw new Error("Invalid reference media type");
    if(!config||config.schema!=="bv.reference_registry_config"||config.version!==1||!uuid.test(config.collector_id)||!Array.isArray(config.entries)||config.entries.length>100||config.entries.some(entry=>!entry||!uuid.test(entry.id)||!/^media([0-9]|[1-9][0-9])$/.test(entry.slot))||new Set(config.entries.map(entry=>entry.id)).size!==config.entries.length||new Set(config.entries.map(entry=>entry.slot)).size!==config.entries.length)throw new Error("Invalid Reference Registry configuration");
    if(config.places!==undefined){
        const places=config.places;
        if(!Array.isArray(places)||places.length>100||places.some(entry=>!entry||!uuid.test(entry.id)||!/^media([0-9]|[1-9][0-9])$/.test(entry.slot))||new Set(places.map(entry=>entry.id)).size!==places.length||new Set(places.map(entry=>entry.slot)).size!==places.length||config.entries.some(entry=>!places.some(place=>place.id===entry.id&&place.slot===entry.slot)))throw new Error("Invalid reference places");
    }
    return config;
}
const fresh=():ReferenceConfig=>({schema:"bv.reference_registry_config",version:1,collector_id:crypto.randomUUID(),entries:[]});
type State={links:Map<unknown,string>;restoring:boolean;restoredConfig?:string;scheduled:boolean;finish?:(reconcile:boolean)=>void};
const states=new WeakMap<object,State>();
const state=(node:any)=>{let value=states.get(node);if(!value){value={links:new Map(),restoring:false,scheduled:false};states.set(node,value)}return value};

/** Links are transient migration keys, never resource identity or persisted configuration. */
export function reconcileReferenceRegistry(node:any,restore=false) {
    const target=widget(node);if(!target)return;
    const tracking=state(node);
    const raw=restore?(tracking.restoredConfig??target.value):target.value;
    const current=raw?parseReferenceConfig(raw):fresh();
    if(tracking.restoring&&!restore)return;
    const places=[...(current.places??current.entries)];
    const saved=new Map(places.map(entry=>[entry.slot,entry.id]));
    const links=new Map<unknown,string>();
    const entries:ReferenceEntry[]=[];
    for(const input of node.inputs??[]){
        if(!mediaSlot(input)||input.link==null)continue;
        const id=saved.get(slotKey(input))??crypto.randomUUID();
        if(!saved.has(slotKey(input)))places.push({id,slot:slotKey(input)});
        const place=places.find(entry=>entry.id===id)!;
        const upstream=resolveNativeInputSource(node,node.inputs.indexOf(input));
        const kind=upstream?.node?.outputs?.[upstream.outputIndex]?.type;
        if(['IMAGE','AUDIO','VIDEO'].includes(kind))place.media_type=kind;
        if(links.has(input.link)||entries.some(entry=>entry.id===id))throw new Error("Ambiguous Reference Registry input identity");
        links.set(input.link,id);entries.push({...place});
    }
    tracking.links=links;tracking.restoredConfig=undefined;
    target.value=JSON.stringify({...current,entries,places});
    return parseReferenceConfig(target.value);
}

const owners=new WeakMap<object,Map<string,any>>();
/** Existing concrete ownership wins over traversal order when a copy is inserted. */
export function freshenDuplicateReferenceRegistry(node:any){
    const target=widget(node);if(!target?.value)return;
    const config=parseReferenceConfig(target.value),owner=node.__bvConcreteGraph??node.graph,root=owner?.rootGraph??owner;
    if(!root)return;
    let registry=owners.get(root);if(!registry){registry=new Map();owners.set(root,registry)}
    const visited=new Set<any>();const found:any[]=[];
    const visit=(graph:any)=>{if(!graph||visited.has(graph))return;visited.add(graph);for(const candidate of new Set<any>([...(graph._nodes??[]),...(graph.nodes??[])])){
        if(String(candidate.comfyClass??candidate.type)==="BV Reference Registry"&&widget(candidate)?.value&&parseReferenceConfig(widget(candidate).value).collector_id===config.collector_id)found.push(candidate);
        visit(candidate.subgraph??candidate.getSubgraph?.());
    }};visit(root);
    const previous=registry.get(config.collector_id);
    if(previous&&found.includes(previous)&&previous!==node){
        const next=crypto.randomUUID();target.value=JSON.stringify({...config,collector_id:next});registry.set(next,node);
    }else if(found.length>1&&!previous){
        throw new Error("Ambiguous Reference Registry collector identity; original ownership is unknown");
    }else registry.set(config.collector_id,node);
}

export function installReferenceRegistryLifecycle(nodeType:any,publish:(node:any)=>void=()=>{}){
    const prototype=nodeType.prototype;
    const schedule=(node:any)=>{const tracking=state(node);if(tracking.scheduled)return;tracking.scheduled=true;queueMicrotask(()=>{
        tracking.scheduled=false;if(tracking.finish)return;reconcileReferenceRegistry(node,tracking.restoring);tracking.restoring=false;freshenDuplicateReferenceRegistry(node);publish(node);
    })};
    for(const name of ["onNodeCreated","onAdded"]){
        const original=prototype[name];prototype[name]=function(){const result=original?.apply(this,arguments);schedule(this);return result};
    }
    const connected=prototype.onConnectionsChange;
    prototype.onConnectionsChange=function(type:number,index:number){
        const tracking=state(this),graph=this.__bvConcreteGraph??this.graph;
        const stablePlace=this.inputs?.[index]?.__bvPresentationRole==="fanIn";
        if(type===1&&!stablePlace&&mediaSlot(this.inputs?.[index])&&!tracking.restoring&&!tracking.finish&&graph?.beforeChange&&graph?.afterChange&&typeof requestAnimationFrame==="function"){
            let frame:number|undefined,active=true;
            graph.beforeChange();
            const finish=(reconcile:boolean)=>{
                if(!active)return;active=false;
                if(frame!==undefined)cancelAnimationFrame(frame);
                try{if(reconcile){reconcileReferenceRegistry(this);freshenDuplicateReferenceRegistry(this);publish(this)}}
                finally{tracking.finish=undefined;graph.afterChange()}
            };
            tracking.finish=finish;
            // Native Autogrow appends its instance callback AFTER this hook.
            // Register our frame after that callback has queued compaction.
            queueMicrotask(()=>{if(active)frame=requestAnimationFrame(()=>finish(true))});
        }
        try{const result=connected?.apply(this,arguments);if(type===1&&stablePlace&&!tracking.restoring)reconcileReferenceRegistry(this);schedule(this);return result}
        catch(error){tracking.finish?.(false);throw error}
    };
    const configured=prototype.onConfigure;
    prototype.onConfigure=function(){const tracking=state(this);tracking.finish?.(false);tracking.links.clear();tracking.restoring=true;tracking.restoredConfig=arguments[0]?.widgets_values_named?.config_json??arguments[0]?.widgets_values?.[0]??widget(this)?.value;const result=configured?.apply(this,arguments);schedule(this);return result};
    // Native configure emits connection callbacks before onConfigure. Mark the
    // whole restore operation so those callbacks cannot commit transient IDs.
    const configure=prototype.configure;
    if(configure)prototype.configure=function(){const tracking=state(this);tracking.finish?.(false);tracking.links.clear();tracking.restoring=true;try{return configure.apply(this,arguments)}finally{schedule(this)}};
    const removed=prototype.onRemoved;
    prototype.onRemoved=function(){state(this).finish?.(false);const result=removed?.apply(this,arguments);publish(this);return result};
    const serialized=prototype.onSerialize;
    prototype.onSerialize=function(data:any){
        const result=serialized?.apply(this,arguments),target=widget(this),index=this.widgets?.indexOf(target);
        if(target&&Array.isArray(data.widgets_values)&&index>=0)data.widgets_values[index]=target.value;
        if(target&&data.widgets_values_named)data.widgets_values_named.config_json=target.value;
        return result;
    };
    const created=prototype.onNodeCreated;
    prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);const target=widget(this);if(target){
        // Native history serializes during connection transactions. Reading a
        // snapshot must not commit a partially disconnected Autogrow state.
        target.serializeValue=()=>target.value;
    }return result};
}
