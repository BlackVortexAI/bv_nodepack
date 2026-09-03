import{legacyDebugVisible}from"./legacyPorts.js";
import{markM0NodeElement}from"./m0VisualProjection.js";
import{configurePresentationSizeLifecycle,installPresentationSizeLifecycle,isPresentationUserResizing,presentationSize,setAutomaticPresentationSize}from"./presentationSize.js";
import{PROVIDER_TITLEBAR_MIDLINE_Y,providerRenderedWidth}from"./providerProjectionGeometry.js";

const PROVIDERS=new Set(["BV_RUNTIME_RESOURCE_PROVIDER","BV_RUNTIME_RESOURCE_PROVIDER_M0"]);
const LAYOUT_VERSION=1;
const internal=(slot:any)=>PROVIDERS.has(String(slot?.type??""))||slot?.__bvM0ResourceSlot===true||slot?.__bvResourceSlot===true;
const visibleLegacy=(slot:any)=>slot?.__bvLegacyPort===true&&!slot.hidden;
const measurementView=(node:any,overrides:Record<PropertyKey,unknown>)=>{const local=new Map<PropertyKey,unknown>(Reflect.ownKeys(overrides).map(key=>[key,overrides[key]]));return new Proxy(node,{get(target,key){return local.has(key)?local.get(key):Reflect.get(target,key,target)},set(_target,key,value){local.set(key,value);return true}})};
type PositionOrigin={kind:"own";descriptor:PropertyDescriptor}|{kind:"inherited"}|{kind:"absent"};
type AnchorBinding={resize:any;wrapper:any;enabled:boolean};
const positionOrigins=new WeakMap<object,PositionOrigin>();
const projectedByNode=new WeakMap<object,Set<object>>();
const anchorBindings=new WeakMap<object,AnchorBinding>();
const layoutScheduleTokens=new WeakMap<object,object>();
const widgetBacked=(slot:any)=>Boolean(slot?.widget&&typeof slot.widget==="object");
const providerAnchor=(slot:any)=>slot?.__bvPresentationRole===undefined?internal(slot):slot.__bvPresentationRole==="provider";
const classicSurface=(node:any)=>(globalThis as any).LiteGraph?.vueNodesMode!==true&&node?.__bvNodes2PresentationActive!==true;
const dirty=(node:any)=>{node?.setDirtyCanvas?.(true,true);node?.graph?.setDirtyCanvas?.(true,true)};
const anchorEntries=(node:any)=>[
    ...(node?.inputs??[]).map((slot:any,index:number)=>({slot,index,direction:"input" as const})),
    ...(node?.outputs??[]).map((slot:any,index:number)=>({slot,index,direction:"output" as const})),
].filter(({slot,direction})=>providerAnchor(slot)&&(direction==="output"||!widgetBacked(slot)));
const capturePosition=(slot:any):PositionOrigin=>{const descriptor=Object.getOwnPropertyDescriptor(slot,"pos");if(descriptor)return{kind:"own",descriptor};return"pos"in slot?{kind:"inherited"}:{kind:"absent"}};
const restorePosition=(slot:any)=>{const origin=positionOrigins.get(slot);if(!origin)return;if(origin.kind==="own")Object.defineProperty(slot,"pos",origin.descriptor);else delete slot.pos;positionOrigins.delete(slot)};

export function refreshProjectedProviderAnchors(node:any,enabled=legacyDebugVisible()){
    const binding=anchorBindings.get(node);if(binding)binding.enabled=Boolean(enabled);
    const previous=projectedByNode.get(node)??new Set<object>();
    if(!enabled||!classicSurface(node)){for(const slot of previous)restorePosition(slot);projectedByNode.delete(node);dirty(node);return{enabled:false,projected:0,blocked:0}}
    const entries=anchorEntries(node),current=new Set<object>(entries.map(({slot})=>slot));
    for(const slot of previous)if(!current.has(slot))restorePosition(slot);
    let projected=0,blocked=0;
    for(const{slot,direction}of entries){
        if(!positionOrigins.has(slot))positionOrigins.set(slot,capturePosition(slot));
        const origin=positionOrigins.get(slot)!;
        if(origin.kind==="own"&&origin.descriptor.configurable===false){blocked++;continue}
        // Collapse does not necessarily emit onResize. Read presentation geometry
        // at use time; native layout writes must not relocate the DG-only anchor.
        try{Object.defineProperty(slot,"pos",{get:()=>[direction==="input"?0:providerRenderedWidth(node),PROVIDER_TITLEBAR_MIDLINE_Y],set:()=>{},configurable:true,enumerable:false});projected++}catch{blocked++;restorePosition(slot)}
    }
    if(current.size)projectedByNode.set(node,current);else projectedByNode.delete(node);
    dirty(node);
    return{enabled:true,projected,blocked};
}

export function installProjectedProviderAnchors(node:any,enabled=legacyDebugVisible()){
    if(!node)return{enabled:Boolean(enabled),projected:0,blocked:0};
    if(!anchorBindings.has(node)){
        const resize=node.onResize,binding:AnchorBinding={resize,wrapper:undefined,enabled:Boolean(enabled)},wrapper=function(this:any){const result=resize?.apply(this,arguments);refreshProjectedProviderAnchors(this,binding.enabled);return result};binding.wrapper=wrapper;
        anchorBindings.set(node,binding);node.onResize=wrapper;node.__bvRefreshProviderAnchors=()=>refreshProjectedProviderAnchors(node);
    }else anchorBindings.get(node)!.enabled=Boolean(enabled);
    return refreshProjectedProviderAnchors(node,enabled);
}

export function removeProjectedProviderAnchors(node:any){
    if(!node)return false;
    const projected=projectedByNode.get(node);if(projected)for(const slot of projected)restorePosition(slot);projectedByNode.delete(node);
    const binding=anchorBindings.get(node);if(binding&&node.onResize===binding.wrapper)node.onResize=binding.resize;anchorBindings.delete(node);delete node.__bvRefreshProviderAnchors;
    dirty(node);return Boolean(projected||binding);
}

// Presentation refresh and topology reconciliation must agree on serialized
// labels; alternating between an empty label and an explicit label creates a
// spurious native Undo entry. Intent belongs to the slot, never its index/name.
const projectedSlotLabels=new WeakMap<object,string>();
export function applyProjectedSlotLabel(slot:any){if(!slot)return;const label=projectedSlotLabels.get(slot)??"";slot.label=label;slot.localized_name=label;}
export function setProjectedSlotLabel(slot:any,label:string){if(!slot)return;projectedSlotLabels.set(slot,label);applyProjectedSlotLabel(slot);}

export function configureProjectedPortLayout(options:{isUserResizing?:(node:any)=>boolean}){configurePresentationSizeLifecycle(options)}

export function markProjectedProvider(slot:any){if(!slot)return;slot.hidden=true;applyProjectedSlotLabel(slot);slot.__bvResourceSlot=true;slot.__bvM0ResourceSlot=true;slot.__bvM0PortHidden=true;}

/** Installs the shared projected-provider lifecycle on a static provider-only test node. */
export function suppressInitialProjectedProviderDefinitions(nodeData:any,deferredPublicNames:string[]=[]){
    const optional=nodeData?.input?.optional;if(!optional)return[];
    const deferred=new Set(deferredPublicNames),removed:string[]=[],publicInputs:any[]=[];
    for(const[name,spec]of Object.entries(optional)){
        if(PROVIDERS.has(String((spec as any)?.[0]??""))){delete optional[name];removed.push(name);continue}
        if(deferred.has(name)){delete optional[name];publicInputs.push({name,type:String((spec as any)?.[0]??"*"),options:{...((spec as any)?.[1]??{})}});removed.push(name)}
    }
    if(publicInputs.length)nodeData.__bvDeferredPublicInputs=publicInputs;
    return removed;
}

export function reconcileDeferredPublicInputs(node:any,nodeData:any){
    const definitions:any[]=nodeData?.__bvDeferredPublicInputs??[],resolved:any[]=[];
    for(const definition of definitions){
        let slot=(node?.inputs??[]).find((candidate:any)=>candidate?.name===definition.name);
        if(!slot){slot=node?.addInput?.(definition.name,definition.type,definition.options);if(!slot)slot=(node?.inputs??[]).find((candidate:any)=>candidate?.name===definition.name)}
        if(slot){slot.hidden=false;slot.__bvDeferredPublicInput=true;resolved.push(slot)}
    }
    return resolved;
}

// Registered presentation exception: regional-prompt-bootstrap-measurement.
// See PRESENTATION_EXCEPTIONS in nodePresentation.ts for rationale and exit path.
export function installRegionalPromptCreationLayout(nodeType:any){const prototype=nodeType?.prototype,original=prototype?.computeSize;if(!prototype||typeof original!=="function"||prototype.__bvRegionalPromptCreationLayout)return;prototype.__bvRegionalPromptCreationLayout=true;prototype.computeSize=function(){if(this.__bvRegionalPromptUiReady)return original.apply(this,arguments);const view=measurementView(this,{inputs:(this.inputs??[]).filter((slot:any)=>!internal(slot)),outputs:(this.outputs??[]).filter((slot:any)=>slot?.name!=="lora_bindings"),widgets:[{type:"button",name:"open_regional_editor",computeSize:()=>[0,20]},{type:"button",name:"quick_edit_regional_prompts",computeSize:()=>[0,20]}]});return original.apply(view,arguments)}}

export function retainNeededProjectedInputs(node:any,wantedNames:string[],matches:(slot:any)=>boolean){const wanted=new Set(wantedNames);for(const {slot,index} of (node.inputs??[]).map((slot:any,index:number)=>({slot,index})).filter(({slot}:any)=>matches(slot)&&!wanted.has(String(slot.name))&&slot.link==null).sort((a:any,b:any)=>b.index-a.index))node.removeInput?.(index);for(const name of wantedNames){const slot=node.inputs?.find((item:any)=>item.name===name);if(slot)markProjectedProvider(slot);}}

function projected(slots:any[]|undefined,_debug:boolean){const result:any[]=[];for(const slot of slots??[]){if(internal(slot))continue;if(slot?.__bvLegacyPort){if(visibleLegacy(slot))result.push(slot);continue}if(!slot?.hidden)result.push(slot)}return result}

export function installProjectedPortLayout(node:any){if(!node)return;const anchor=anchorBindings.get(node),anchorEnabled=anchor?.enabled??legacyDebugVisible();if(anchor)removeProjectedProviderAnchors(node);installPresentationSizeLifecycle(node);if(node.__bvProjectedPortOriginalComputeSize||typeof node.computeSize!=="function"){installProjectedProviderAnchors(node,anchorEnabled);return}const original=node.computeSize;node.__bvProjectedPortOriginalComputeSize=original;node.computeSize=function(){const inputs=this.inputs??[],outputs=this.outputs??[],nextInputs=projected(inputs,legacyDebugVisible()),nextOutputs=projected(outputs,legacyDebugVisible()),measure=(measuredInputs:any[],measuredOutputs:any[])=>original.apply(measurementView(this,{size:[Number(this.size?.[0]??0),60],inputs:measuredInputs,outputs:measuredOutputs}),arguments);const full=measure(inputs,outputs),compact=measure(nextInputs,nextOutputs),removedRows=Math.max(inputs.length,outputs.length)-Math.max(nextInputs.length,nextOutputs.length),structuralHeight=Math.max(60,Number(full?.[1]??0)-Math.max(0,removedRows)*20);return[Number(compact?.[0]??0),Math.min(Number(compact?.[1]??structuralHeight),structuralHeight)]};node.__bvRefreshPortProjection=()=>scheduleProjectedPortLayout(node);installProjectedProviderAnchors(node,anchorEnabled)}

export function compactProjectedPortLayout(node:any,minWidth=220,minHeight=60){installProjectedPortLayout(node);if(!node?.setSize)return;const width=Math.max(Number(node.size?.[0]??0),minWidth),computed=node.computeSize?.()??node.size??[minWidth,minHeight],arrangementPadding=Math.max(0,Number(node.__bvProjectedArrangementPadding??0)),measuredHeight=Math.max(minHeight,Number(computed[1]??minHeight)+arrangementPadding),next=presentationSize(node,[Math.max(width,Number(computed[0]??0),minWidth),measuredHeight]);if(Number(node.size?.[0]??0)!==next[0]||Number(node.size?.[1]??0)!==next[1])setAutomaticPresentationSize(node,next);node.__bvM0ResourceConsumer=(node.inputs??[]).some(internal);const first=(node.inputs??[]).findIndex(internal);node.__bvM0FanInAnchorSlot=first>=0?first:undefined;if(typeof document!=="undefined")markM0NodeElement(node,"consumer",legacyDebugVisible());node.setDirtyCanvas?.(true,true);node.graph?.setDirtyCanvas?.(true,true)}

export function cancelScheduledProjectedPortLayout(node:any){if(!node)return false;const scheduled=layoutScheduleTokens.has(node)||Boolean(node.__bvProjectedPortLayoutScheduled);layoutScheduleTokens.delete(node);delete node.__bvProjectedPortLayoutScheduled;return scheduled}

export function scheduleProjectedPortLayout(node:any){
    if(!node||node.__bvProjectedPortLayoutScheduled)return;
    const token={};layoutScheduleTokens.set(node,token);node.__bvProjectedPortLayoutScheduled=true;
    let deferred=false;
    for(const delay of[0,50,150])setTimeout(()=>{
        if(layoutScheduleTokens.get(node)!==token)return;
        if(isPresentationUserResizing(node))deferred=true;
        else{deferred=false;compactProjectedPortLayout(node)}
        if(delay===150&&layoutScheduleTokens.get(node)===token){
            layoutScheduleTokens.delete(node);delete node.__bvProjectedPortLayoutScheduled;
            if(deferred)scheduleProjectedPortLayout(node);
        }
    },delay);
}
