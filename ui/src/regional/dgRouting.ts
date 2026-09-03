// Shared program-owned DG routing. No node-family or widget knowledge belongs here.
import { compactProjectedPortLayout, installProjectedPortLayout, markProjectedProvider, setProjectedSlotLabel } from "./portProjection";
import { installProjectedPortConversion, installProjectedPortInteraction } from "./projectedPortInteraction";
import { installNodes2NodePresentation, removeNodes2NodePresentation } from "./nodes2NodePresentation";
import { withNativeGraphOwnership } from "./runtimeResourceGraph";

export type DgReceiverChannel=Readonly<{id:string;inputName:string}>;
/** Adapter-owned UI/storage; shared DG identity and transport remain core-owned. */
export interface DgNodeAdapter {
    readonly id: string;
    isSender(node:any):boolean;
    isReceiver(node:any):boolean;
    receiverChannels?(node:any):readonly DgReceiverChannel[];
    canSelectSender?(receiver:any,sender:any,channelId:string):boolean;
    readSelection(node:any,channelId?:string):string;
    writeSelection(node:any,id:string,channelId?:string):void;
    readSerializedSelection(node:any,channelId?:string):string;
    writeSerializedSelection(node:any,id:string,channelId?:string):void;
    prepareClipboard?(copiedNodes:any[]):void;
}
const adapters=new Map<string,DgNodeAdapter>();
/**
 * Application-lifetime registration. Different owners cannot overwrite it.
 * The disposer is for isolated tests, NOT hot-unloading adapters of live graphs:
 * live receivers must remain registered for shared-route protection.
 * Re-registering the same object is harmless. HMR requires a full page reload.
 */
export function registerDgAdapter(adapter:DgNodeAdapter){
    const previous=adapters.get(adapter.id);
    if(previous&&previous!==adapter)throw new Error(`DG adapter already registered: ${adapter.id}`);
    adapters.set(adapter.id,adapter);
    return ()=>{if(adapters.get(adapter.id)===adapter)adapters.delete(adapter.id)};
}
function adapterFor(node:any,kind:"isSender"|"isReceiver"){
    const matches=[...adapters.values()].filter(adapter=>adapter[kind](node));
    if(matches.length>1)throw new Error("DG node matches multiple adapters");
    return matches[0];
}
const isSender=(node:any)=>!!adapterFor(node,"isSender");
const isReceiver=(node:any)=>!!adapterFor(node,"isReceiver");

const PROVIDER="BV_RUNTIME_RESOURCE_PROVIDER";
// Empty channel is the legacy single-provider contract; named channels never
// fall back to it. Names resolve native slot indices afresh after every reorder.
const channelStates=new WeakMap<object,Map<string,any>>();
function channels(node:any):readonly DgReceiverChannel[]{
    const adapter=adapterFor(node,"isReceiver"),list=adapter?.receiverChannels?.(node);
    if(!list)return [{id:"",inputName:""}];
    const ids=new Set<string>(),names=new Set<string>();
    for(const item of list){
        if(!item.id||!item.inputName||ids.has(item.id)||names.has(item.inputName))throw new Error("DG channels require unique nonempty identities and input names");
        ids.add(item.id);names.add(item.inputName);
    }
    return list;
}
function channelInput(node:any,id:string){
    const channel=channels(node).find(item=>item.id===id);if(!channel)return -1;
    if(!id)return providerIndex(node?.inputs);
    const matches=(node?.inputs??[]).map((slot:any,index:number)=>({slot,index})).filter((item:any)=>item.slot.name===channel.inputName);
    return matches.length===1&&matches[0].slot.type===PROVIDER?matches[0].index:-1;
}
const channelSuffix=(id:string)=>id?"__channel_"+Array.from(id).map(c=>c.codePointAt(0)!.toString(16)).join("_"):"";
function channelState(node:any,id:string){
    if(!id)return node;
    let states=channelStates.get(node);if(!states){states=new Map();channelStates.set(node,states)}
    let state=states.get(id);if(!state){state={};states.set(id,state)}return state;
}
function selectionMetadata(node:any,id:string){
    node.properties??={};if(!id)return node.properties;
    node.properties.bvDgChannels??={};
    return node.properties.bvDgChannels[channelSuffix(id)]??={};
}
function otherProviderRecords(receiver:any,id:string){
    return allNodes(rootGraph(receiver)).filter(isReceiver).flatMap(node=>channels(node)
        .filter(channel=>node!==receiver||channel.id!==id)
        .flatMap(channel=>connectedProviderRecords(node,channel.id)));
}
export function prepareDgClipboard(data:any){
    const copy=structuredClone(data);
    const nodes=[...(copy?.nodes??[]),...(copy?.subgraphs??[]).flatMap((graph:any)=>graph.nodes??[])];
    for(const adapter of adapters.values())adapter.prepareClipboard?.(nodes);
    const remap=new Map<string,string>();
    for(const node of nodes){
        if(!isSender(node))continue;
        const previous=String(node.properties?.bvDgSenderId??"");
        if(previous&&remap.has(previous))throw new Error("DG clipboard: ambiguous sender identities in copied selection");
        node.properties={...node.properties};delete node.properties.bvDgSenderId;
        const next=stableSenderId(node);if(previous)remap.set(previous,next);
    }
    for(const node of nodes){
        const adapter=adapterFor(node,"isReceiver");if(!adapter)continue;
        for(const channel of channels(node)){
            const previous=adapter.readSerializedSelection(node,channel.id);
            const next=remap.get(previous);if(!next)continue;
            adapter.writeSerializedSelection(node,next,channel.id);
            const metadata=selectionMetadata(node,channel.id);metadata.bvDgSelectedSenderStableId=next;
            delete metadata.bvDgSelectedSenderNodeId;delete metadata.bvDgSelectedSenderTitle;
        }
    }
    return copy;
}
const SENDER_KEY="bvDgSenderId";
const removedReceivers=new WeakSet<object>();
const receiverEpoch=new WeakMap<object,number>();
export type DgSenderChoice={id:string;label:string};
type DgSenderEntry=DgSenderChoice&{node:any};
const boundaryName=(receiver:any)=>`__bv_dg_receiver_${String(receiver?.id??"")}`;
const outputBoundaryName=(sender:any)=>`__bv_dg_sender_${String(sender?.id??"")}`;
export const providerIndex=(slots:any[]|undefined)=>slots?.findIndex(slot=>String(slot?.type??"")===PROVIDER)??-1;
const providerSlot=(slot:any)=>String((slot?.slot??slot)?.type??"")===PROVIDER||(slot?.slot??slot)?.__bvDgAnchor===true;
const ownerGraph=(node:any)=>node?.__bvConcreteGraph??node?.graph;
const rootGraph=(node:any)=>ownerGraph(node)?.rootGraph??ownerGraph(node);
const childSubgraph=(node:any)=>{try{return node?.subgraph??node?.getSubgraph?.()}catch{return node?.subgraph}};
const graphNodes=(graph:any):any[]=>[...(graph?._nodes??[]),...(graph?.nodes??[])].filter((node:any,index:number,all:any[])=>all.indexOf(node)===index);
const allGraphs=(root:any)=>{const result:any[]=[],seen=new Set<any>();const visit=(graph:any)=>{if(!graph||seen.has(graph))return;seen.add(graph);result.push(graph);for(const node of graphNodes(graph))visit(childSubgraph(node))};visit(root);return result};
const allNodes=(root:any)=>allGraphs(root).flatMap(graph=>graphNodes(graph));
const subgraphHostFor=(subgraph:any,root:any)=>allNodes(root).find((node:any)=>childSubgraph(node)===subgraph);
function graphLabel(graph:any,root:any,parents:Map<any,{parent:any;host:any}>){
    const parts:string[]=[],seen=new Set<any>();
    for(let current=graph;current&&current!==root&&!seen.has(current);){seen.add(current);const parent=parents.get(current);parts.unshift(String(parent?.host?.title||current?.name||current?.id||"Subgraph"));current=parent?.parent}
    return ["Root",...parts].join(" / ");
}
let fallbackSenderSequence=0;
function stableSenderId(node:any){
    node.properties??={};
    if(!node.properties[SENDER_KEY])node.properties[SENDER_KEY]=globalThis.crypto?.randomUUID?.()??`dg-sender-${Date.now().toString(36)}-${(++fallbackSenderSequence).toString(36)}`;
    return String(node.properties[SENDER_KEY]);
}
export function dgSenderIdentity(node:any){return isSender(node)?stableSenderId(node):""}
function senderEntries(receiver:any,channelId=""):DgSenderEntry[]{
    const root=rootGraph(receiver),parents=graphParentMap(root),senders=allNodes(root).filter((node:any)=>isSender(node)&&providerIndex(node.outputs)>=0&&(adapterFor(receiver,"isReceiver")?.canSelectSender?.(receiver,node,channelId)??true));
    const entries=senders.map((node:any)=>({id:stableSenderId(node),label:`${String(node.title||`DG Sender #${node.id}`)} — ${graphLabel(ownerGraph(node)??root,root,parents)}`,node}));
    const counts=new Map<string,number>();for(const entry of entries)counts.set(entry.label,(counts.get(entry.label)??0)+1);
    // Native combo callbacks carry display text; collision labels must map to
    // exactly one persistent sender ID, including equal paths in sibling graphs.
    for(const entry of entries)if((counts.get(entry.label)??0)>1)entry.label+=` [${entry.id}]`;
    return entries;
}
let programmaticDepth=0;
const programmatic=<T>(action:()=>T)=>{programmaticDepth++;try{return action()}finally{programmaticDepth--}};
export function installConversionGuards(node:any){for(const graph of allGraphs(rootGraph(node)))installProjectedPortConversion(graph,programmatic)}

export function dgSenderChoices(receiver:any,channelId=""):DgSenderChoice[]{
    return senderEntries(receiver,channelId).map(({id,label})=>({id,label}));
}

function linkValues(graph:any){const links=graph?._links??graph?.links;if(links instanceof Map)return[...links.values()];return Object.values(links??{}) as any[]}
function movedIndex(index:number,from:number,to:number){if(index===from)return to;if(from<to&&index>from&&index<=to)return index-1;if(to<from&&index>=to&&index<from)return index+1;return index}
function moveArraySlot(items:any,from:number,to:number){if(!Array.isArray(items)||from<0||from>=items.length||from===to)return;const[item]=items.splice(from,1);items.splice(to,0,item)}
function moveInputBoundaryToEnd(subgraph:any,host:any,boundary:any){
    const from=(subgraph?.inputs??[]).indexOf(boundary),to=(subgraph?.inputs?.length??0)-1;if(from<0||from===to)return;
    // Only compact past public ports. Rotating already trailing DG channels on
    // each reload would rewrite every other channel's native link indices.
    if(subgraph.inputs.slice(from+1).every(providerSlot))return;
    moveArraySlot(subgraph.inputs,from,to);if(subgraph.inputNode?.slots!==subgraph.inputs)moveArraySlot(subgraph.inputNode?.slots,from,to);moveArraySlot(host?.inputs,from,to);
    for(const link of linkValues(subgraph))if(String(link?.origin_id)===String(subgraph.inputNode?.id))link.origin_slot=movedIndex(Number(link.origin_slot),from,to);
    for(const link of linkValues(host?.graph))if(String(link?.target_id)===String(host?.id))link.target_slot=movedIndex(Number(link.target_slot),from,to);
}
function graphParentMap(root:any){const parents=new Map<any,{parent:any;host:any}>();for(const graph of allGraphs(root))for(const host of graphNodes(graph)){const child=childSubgraph(host);if(child)parents.set(child,{parent:graph,host})}return parents}
function ancestry(graph:any,parents:Map<any,{parent:any;host:any}>){const result:any[]=[];for(let current=graph;current;current=parents.get(current)?.parent)result.push(current);return result}
function routeBoundaryName(kind:"in"|"out",routeKey:string){return`__bv_dg_${kind}_${routeKey.replace(/[^a-zA-Z0-9_-]/g,"_")}`}
function linkedBoundary(subgraph:any,direction:"in"|"out",node:any,channelId=""){
    const slots=direction==="in"?(subgraph?.inputs??[]):(subgraph?.outputs??[]),boundaryNode=direction==="in"?subgraph?.inputNode:subgraph?.outputNode;
    for(const link of linkValues(subgraph)){const index=direction==="in"?Number(link?.origin_slot):Number(link?.target_slot),boundaryId=direction==="in"?link?.origin_id:link?.target_id,nodeId=direction==="in"?link?.target_id:link?.origin_id;if(String(boundaryId)===String(boundaryNode?.id)&&String(nodeId)===String(node?.id)&&(direction!=="in"||Number(link.target_slot)===channelInput(node,channelId))&&providerSlot(slots[index]))return slots[index]}
}
function connectedOutputBoundary(graph:any,source:any,output:number){
    // On outer levels the source is the child host, not the original sender.
    // Match its exact provider slot and both backlinks before reusing a boundary.
    for(const link of linkValues(graph)){
        const slot=graph.outputs?.[Number(link.target_slot)];
        if(link.type===PROVIDER&&String(link.origin_id)===String(source?.id)&&Number(link.origin_slot)===output
            &&String(link.target_id)===String(graph.outputNode?.id)&&providerSlot(slot)
            &&source?.outputs?.[output]?.links?.includes(link.id)&&slot?.linkIds?.includes(link.id))return slot;
    }
}
function ensureRouteOutput(subgraph:any,host:any,routeKey:string,sender:any,source:any,output:number){
    const senderKey=stableSenderId(sender),name=routeBoundaryName("out",routeKey);
    let boundary=(subgraph.outputs??[]).find((slot:any)=>slot?.__bvDgRouteKey===routeKey&&slot?.__bvDgRouteDirection==="out")
        ??connectedOutputBoundary(subgraph,source,output)
        ??(subgraph.outputs??[]).find((slot:any)=>providerSlot(slot)&&(slot?.__bvDgSenderStableId===senderKey||slot?.__bvDgSenderId===String(sender.id)||slot?.name===outputBoundaryName(sender)||slot?.name===name));
    if(!boundary)boundary=subgraph.addOutput?.(name,PROVIDER);
    if(boundary){boundary.__bvDgRouteKey=routeKey;boundary.__bvDgRouteDirection="out";boundary.__bvDgSenderStableId=senderKey}
    // Older prototype reloads could leave disconnected duplicates. Only the
    // native graph API may remove these exact, unused technical boundaries.
    if(typeof subgraph.removeOutput==="function")for(const slot of [...(subgraph.outputs??[])]){
        const index=subgraph.outputs.indexOf(slot);
        const hostSlot=host?.outputs?.[index],innerEmpty=Array.isArray(slot.linkIds)&&slot.linkIds.length===0,outerEmpty=hostSlot&&(hostSlot.links===null||(Array.isArray(hostSlot.links)&&hostSlot.links.length===0));
        if(slot!==boundary&&providerSlot(slot)&&slot.name===name&&innerEmpty&&outerEmpty)subgraph.removeOutput(slot);
    }
    const index=(subgraph.outputs??[]).indexOf(boundary);return{boundary,index,hostSlot:host?.outputs?.[index]};
}
function prepareInputBoundaryProjection(subgraph:any,host:any,boundary:any,index:number){const virtualSlot=subgraph?.inputNode?.slots?.[index]??subgraph?.inputNode?.outputs?.[index];prepareProvider(boundary);prepareProvider(virtualSlot);prepareProvider(host?.inputs?.[index]);const measurement=virtualSlot?.measurement??virtualSlot?.slot?.measurement;if(measurement){measurement.minHeight=0;measurement.maxHeight=0;measurement.desiredHeight=0;subgraph.inputNode?.arrange?.()}}
// Reclaim only an unused, trailing technical boundary. Never delete or reorder
// ports here, and inspect every host of a shared definition (not graphParentMap).
function unusedRouteInput(subgraph:any,host:any,root:any,slot:any){
    const index=subgraph.inputs?.indexOf(slot)??-1;
    const empty=(value:any)=>value==null||(Array.isArray(value)?value.length===0:(value instanceof Set||value instanceof Map)?value.size===0:false);
    const floating=(value:any)=>!empty(value?._floatingLinks)||!empty(value?.floatingLinks);
    const receiverId=slot?.__bvDgReceiverId;
    // Transit boundaries name the terminal receiver, possibly several levels
    // below. Any matching live node anywhere is ambiguous and protects ownership.
    const orphan=receiverId!=null&&String(receiverId)!==""&&!allNodes(root).some(node=>String(node.id)===String(receiverId));
    if(index<0||slot?.type!==PROVIDER||!String(slot.name??"").startsWith("__bv_dg_in_")
        ||slot.__bvDgRouteKey||((receiverId!=null||slot.__bvDgReceiverChannel!=null)&&!orphan)
        ||!Array.isArray(slot.linkIds)||slot.linkIds.length||!empty(slot.links)||floating(slot)
        ||subgraph.inputs.slice(index+1).some((item:any)=>!providerSlot(item)))return false;
    if(!subgraph.inputNode||floating(subgraph)||floating(subgraph.inputNode)
        ||linkValues(subgraph).some(link=>String(link.origin_id)===String(subgraph.inputNode.id)&&Number(link.origin_slot)===index))return false;
    const hosts=allGraphs(root).flatMap(graph=>graphNodes(graph).filter(node=>childSubgraph(node)===subgraph).map(node=>({graph,node})));
    if(!hosts.some(item=>item.node===host))return false;
    return hosts.every(({graph,node})=>{
        const input=node.inputs?.[index];
        return input?.type===PROVIDER&&input.link===null&&!input.__bvDgRouteKey&&!floating(input)&&!floating(graph)
            &&!linkValues(graph).some(link=>String(link.target_id)===String(node.id)&&Number(link.target_slot)===index);
    });
}
function ensureRouteInput(subgraph:any,host:any,routeKey:string,receiver:any,previousBoundary:any,upstream:Connector,channelId:string,reclaimable:Set<any>){
    const slots=subgraph.inputs??[],name=routeBoundaryName("in",routeKey);
    const shared=new Set(otherProviderRecords(receiver,channelId).filter(record=>record.graph===subgraph&&record.source===subgraph.inputNode)
        .map(record=>slots[record.output]));
    const eligible=slots.filter((slot:any)=>{
        if(!providerSlot(slot))return false;
        if(!shared.has(slot))return true;
        const index=slots.indexOf(slot),incoming=host.inputs?.[index]?.link;
        return upstream.graph===host.graph&&linkValues(host.graph).some((link:any)=>link.id===incoming&&link.type===PROVIDER
            &&String(link.origin_id)===String(upstream.node.id)&&Number(link.origin_slot)===upstream.slot
            &&String(link.target_id)===String(host.id)&&Number(link.target_slot)===index);
    });
    const named=eligible.filter((slot:any)=>slot.name===name);
    const active=named.find((slot:any)=>{const index=slots.indexOf(slot),incoming=host?.inputs?.[index]?.link;return incoming!=null&&linkValues(host.graph).some((link:any)=>link.id===incoming&&String(link.target_id)===String(host.id)&&Number(link.target_slot)===index)});
    const linked=linkedBoundary(subgraph,"in",receiver,channelId);
    let boundary=(eligible.includes(previousBoundary)?previousBoundary:undefined)??eligible.find((slot:any)=>slot.__bvDgRouteKey===routeKey&&slot.__bvDgRouteDirection==="in")??active??named[0]
        ??eligible.find((slot:any)=>(slot.__bvDgReceiverId===String(receiver.id)&&String(slot.__bvDgReceiverChannel??"")===channelId)||(!channelId&&slot.name===boundaryName(receiver)))??(eligible.includes(linked)?linked:undefined);
    if(!boundary)boundary=eligible.find((slot:any)=>reclaimable.has(slot)&&unusedRouteInput(subgraph,host,rootGraph(receiver),slot));
    if(!boundary)boundary=subgraph.addInput?.(name,PROVIDER);
    if(boundary){boundary.__bvDgRouteKey=routeKey;boundary.__bvDgRouteDirection="in";boundary.__bvDgReceiverId=String(receiver.id);if(channelId)boundary.__bvDgReceiverChannel=channelId;else delete boundary.__bvDgReceiverChannel;moveInputBoundaryToEnd(subgraph,host,boundary)}
    const index=slots.indexOf(boundary);prepareInputBoundaryProjection(subgraph,host,boundary,index);return{boundary,index,hostSlot:host?.inputs?.[index]};
}
type Connector={graph:any;node:any;slot:number;connect:(target:any,input:number)=>unknown};
const nodeConnector=(graph:any,node:any,slot:number):Connector=>({graph,node,slot,connect:(target,input)=>withNativeGraphOwnership(graph,[node,target],()=>node.connect?.(slot,target,input))});
const boundaryConnector=(graph:any,boundary:any,index:number):Connector=>({graph,node:graph?.inputNode,slot:index,connect:(target,input)=>withNativeGraphOwnership(graph,[target],()=>boundary.connect?.(target.inputs?.[input],target))});

export function prepareProvider(slot:any){if(slot){markProjectedProvider(slot);setProjectedSlotLabel(slot,"DG");slot.__bvDgAnchor=true}return slot}

function refreshReceiverInputBoundaries(receiver:any,root:any,channelId:string){for(const graph of allGraphs(root)){const host=subgraphHostFor(graph,root);if(!host)continue;for(const boundary of graph?.inputs??[]){if(boundary?.__bvDgReceiverId!==String(receiver.id)||String(boundary.__bvDgReceiverChannel??"")!==channelId)continue;const index=graph.inputs.indexOf(boundary);prepareInputBoundaryProjection(graph,host,boundary,index)}}}

function legacySenderMatch(entry:DgSenderEntry,id:string,root:any){
    const graph=ownerGraph(entry.node)??root,hostId=graph===root?"root":String(subgraphHostFor(graph,root)?.id??graph?.id??"subgraph");
    return id===String(entry.node.id)||id===`${hostId}:${String(entry.node.id)}`;
}
function routeSignature(sender:any,receiver:any,root:any,parents:Map<any,{parent:any;host:any}>,channelId:string){
    const path=(graph:any)=>ancestry(graph,parents).reverse().map(item=>item===root?"root":String(parents.get(item)?.host?.id??item?.id??"sub"));
    return `${stableSenderId(sender)}:${path(ownerGraph(sender)).join("/")}->${path(ownerGraph(receiver)).join("/")}:${String(receiver.id)}${channelSuffix(channelId)}`;
}
function removeBoundary(graph:any,host:any,boundary:any,direction:"in"|"out"){
    const collection=direction==="in"?graph?.inputs:graph?.outputs,index=collection?.indexOf(boundary)??-1;if(index<0)return;
    if(direction==="in")host?.disconnectInput?.(index);else host?.disconnectOutput?.(index);
    const method=direction==="in"?graph?.removeInput:graph?.removeOutput;
    if(typeof method==="function"){try{method.call(graph,boundary)}catch{try{method.call(graph,index)}catch{}}}
    if(collection?.includes(boundary))collection.splice(collection.indexOf(boundary),1);
    const boundaryNode=direction==="in"?graph?.inputNode:graph?.outputNode;
    for(const field of["slots",direction==="in"?"outputs":"inputs"]){const slots=boundaryNode?.[field];if(Array.isArray(slots)){const found=slots.indexOf(boundary);if(found>=0)slots.splice(found,1)}}
    const hostSlots=direction==="in"?host?.inputs:host?.outputs;if(Array.isArray(hostSlots)&&index<hostSlots.length&&providerSlot(hostSlots[index]))hostSlots.splice(index,1);
}
function connectedProviderRecords(receiver:any,channelId=""){
    const root=rootGraph(receiver),parents=graphParentMap(root),records:any[]=[],seen=new Map<any,Set<any>>();
    const visit=(graph:any,id:any)=>{
        if(id==null)return;let ids=seen.get(graph);if(!ids){ids=new Set();seen.set(graph,ids)}if(ids.has(id))return;ids.add(id);
        const link=linkValues(graph).find((item:any)=>item.id===id&&item.type===PROVIDER);if(!link)return;
        const source=String(link.origin_id)===String(graph.inputNode?.id)?graph.inputNode:graphNodes(graph).find((node:any)=>String(node.id)===String(link.origin_id));
        const target=String(link.target_id)===String(graph.outputNode?.id)?graph.outputNode:graphNodes(graph).find((node:any)=>String(node.id)===String(link.target_id));
        records.push({graph,id,source,target,output:Number(link.origin_slot),input:Number(link.target_slot)});
        if(source===graph.inputNode){const parent=parents.get(graph);if(parent)visit(parent.parent,parent.host.inputs?.[Number(link.origin_slot)]?.link)}
        else{const child=childSubgraph(source);if(child)for(const inner of child.outputs?.[Number(link.origin_slot)]?.linkIds??[])visit(child,inner)}
    };
    visit(ownerGraph(receiver),receiver.inputs?.[channelInput(receiver,channelId)]?.link);return records;
}
/** Read actual transport, never infer a provider from its selection or host. */
export function connectedDgSender(receiver:any,channelId=""){
    const parents=graphParentMap(rootGraph(receiver)),seen=new Map<any,Set<any>>();
    const trace=(graph:any,target:any,input:number,id:any):any=>{
        if(!graph||id==null||input<0)return null;
        let ids=seen.get(graph);if(!ids){ids=new Set();seen.set(graph,ids)}if(ids.has(id))return null;ids.add(id);
        const link=linkValues(graph).find(item=>item.id===id&&item.type===PROVIDER);
        if(!link||String(link.target_id)!==String(target?.id)||Number(link.target_slot)!==input)return null;
        const targetSlot=target===graph.outputNode?graph.outputs?.[input]:target.inputs?.[input];
        if(target===graph.outputNode?!targetSlot?.linkIds?.includes(id):targetSlot?.link!==id)return null;
        const source=String(link.origin_id)===String(graph.inputNode?.id)?graph.inputNode:graphNodes(graph).find(node=>String(node.id)===String(link.origin_id)),output=Number(link.origin_slot);
        const sourceSlot=source===graph.inputNode?graph.inputs?.[output]:source?.outputs?.[output];
        if(!(sourceSlot?.links??sourceSlot?.linkIds??[]).includes(id))return null;
        if(source===graph.inputNode){const parent=parents.get(graph);return parent?trace(parent.parent,parent.host,output,parent.host.inputs?.[output]?.link):null}
        const child=childSubgraph(source);
        if(child){const inner=child.outputs?.[output]?.linkIds??[];if(!inner.length)return null;
            const senders=inner.map((linkId:any)=>trace(child,child.outputNode,output,linkId));
            return senders.every((sender:any)=>sender&&sender===senders[0])?senders[0]:null;
        }
        return isSender(source)&&(adapterFor(receiver,"isReceiver")?.canSelectSender?.(receiver,source,channelId)??true)?source:null;
    };
    const input=channelInput(receiver,channelId);return trace(ownerGraph(receiver),receiver,input,receiver.inputs?.[input]?.link);
}
function cleanupRoute(receiver:any,routeKey:string|undefined,channelId:string){
    const state=channelState(receiver,channelId);
    const root=rootGraph(receiver),records=connectedProviderRecords(receiver,channelId),protectedRecords=otherProviderRecords(receiver,channelId);
    for(const record of state?.__bvDgRouteLinks??[])if(!records.some(item=>item.graph===record.graph&&item.id===record.id))records.push(record);
    const resolved=channelInput(receiver,channelId),receiverInput=resolved>=0?resolved:(receiver.inputs??[]).indexOf(state.inputSlot);
    if(receiverInput>=0&&receiver.inputs[receiverInput].link!=null){
        const graph=ownerGraph(receiver),direct=records.find(record=>record.graph===graph&&record.target===receiver&&record.input===receiverInput);
        const source=direct?.source===graph?.inputNode?null:direct?.source;
        withNativeGraphOwnership(graph,[source,receiver],()=>receiver.disconnectInput?.(receiverInput));
    }
    for(const record of records){
        if(protectedRecords.some(item=>item.graph===record.graph&&item.id===record.id))continue;
        record.graph.removeLink?.(record.id);
        const links=record.graph?._links??record.graph?.links;if(links instanceof Map)links.delete(record.id);else if(links)delete links[record.id];
        const source=record.source===record.graph.inputNode?record.graph.inputs?.[record.output]:record.source?.outputs?.[record.output];
        for(const field of ["links","linkIds"])if(Array.isArray(source?.[field]))source[field]=source[field].filter((id:any)=>id!==record.id);
        const target=record.target===record.graph.outputNode?record.graph.outputs?.[record.input]:record.target?.inputs?.[record.input];
        if(target?.link===record.id)target.link=null;if(Array.isArray(target?.linkIds))target.linkIds=target.linkIds.filter((id:any)=>id!==record.id);
    }
    state.__bvDgRouteLinks=[];
    if(!root||!routeKey)return;
    for(const graph of allGraphs(root))for(const boundary of[...(graph?.inputs??[]),...(graph?.outputs??[])])if(boundary?.__bvDgRouteKey===routeKey)delete boundary.__bvDgRouteKey;
}

function connectedInputBoundaries(receiver:any,sender:any,channelId:string){
    const result=new Map<any,any>();
    const records=connectedProviderRecords(receiver,channelId);
    // A sender switch must not reuse a shared upstream input and thereby
    // redirect other receivers still consuming its original provider.
    if(!records.some(record=>record.source===sender&&record.graph===ownerGraph(sender))){
        // Native paste preserves the inner chain but omits its external edge.
        // Accept only an intact chain ending at an explicitly unconnected host
        // input, never a missing link object or a route to a different sender.
        const parents=graphParentMap(rootGraph(receiver)),seen=new Set<any>();
        let graph=ownerGraph(receiver),target=receiver,input=channelInput(receiver,channelId);
        while(graph&&!seen.has(graph)){
            seen.add(graph);
            const targetSlot=target.inputs?.[input],id=targetSlot?.link;
            const link=linkValues(graph).find(item=>item.id===id&&item.type===PROVIDER
                &&String(item.target_id)===String(target.id)&&Number(item.target_slot)===input
                &&String(item.origin_id)===String(graph.inputNode?.id));
            const boundary=link&&graph.inputs?.[Number(link.origin_slot)];
            if(!link||!providerSlot(targetSlot)||!providerSlot(boundary)||!boundary.linkIds?.includes(id))return new Map<any,any>();
            result.set(graph,boundary);
            const parent=parents.get(graph),slot=Number(link.origin_slot),hostInput=parent?.host.inputs?.[slot];
            if(!parent||!providerSlot(hostInput))return new Map<any,any>();
            if(hostInput.link==null)return result;
            graph=parent.parent;target=parent.host;input=slot;
        }
        return new Map<any,any>();
    }
    // Capture canonical ownership before cleanup removes the links. On an
    // intermediate level the downstream node is a child host, not the receiver.
    for(const record of records){
        if(record.source!==record.graph.inputNode)continue;
        const boundary=record.graph.inputs?.[record.output],input=record.target?.inputs?.[record.input];
        if(providerSlot(boundary)&&providerSlot(input)&&boundary.linkIds?.includes(record.id)&&input.link===record.id)result.set(record.graph,boundary);
    }
    return result;
}

export function installDgAnchorInteractionGuard(node:any){
    installConversionGuards(node);
    if(!node)return node;
    if(node.__bvDgInteractionGuard){if(node.subgraph&&!node.__bvApplyNodes2Presentation)installNodes2NodePresentation(node,String(node.type??""));return node}
    node.__bvDgInteractionGuard=true;
    const namedReceiver=!!adapterFor(node,"isReceiver")?.receiverChannels;
    const owned=(slot:any)=>{
        const value=slot?.slot??slot;
        if(namedReceiver)return channels(node).some(channel=>channel.inputName===value?.name)&&providerSlot(value);
        return providerSlot(value);
    };
    installProjectedPortInteraction(node,owned);
    if(node?.subgraph)installNodes2NodePresentation(node,String(node.type??""));
    if(node.subgraph){const removed=node.onRemoved;node.onRemoved=function(){try{return removed?.apply(this,arguments)}finally{removeNodes2NodePresentation(this)}}}
    for(const [hook,field]of[["onConnectInput","inputs"],["onConnectOutput","outputs"]] as const){
        const original=node[hook];node[hook]=function(slotIndex:number){const slot=this?.[field]?.[Number(slotIndex)];if(!programmaticDepth&&owned(slot))return false;return original?.apply(this,arguments)??true};
    }
    return node;
}

/** Topology primitive. Persist adapter selection first, then reconcile for durable UI changes. */
export function connectDgSender(receiver:any,senderId:string,channelId=""){
    const state=channelState(receiver,channelId);
    const root=rootGraph(receiver),entries=senderEntries(receiver,channelId),entry=entries.find(entry=>entry.id===String(senderId))??(!channelId?entries.find(entry=>legacySenderMatch(entry,String(senderId),root)):undefined),sender=entry?.node;
    const receiverInput=channelInput(receiver,channelId),senderOutput=providerIndex(sender?.outputs);
    if(!root||!sender||receiverInput<0||senderOutput<0)return false;
    const metadata=selectionMetadata(receiver,channelId);metadata.bvDgSelectedSenderNodeId=String(sender.id);metadata.bvDgSelectedSenderTitle=String(sender.title??"");metadata.bvDgSelectedSenderStableId=stableSenderId(sender);
    prepareProvider(receiver.inputs[receiverInput]);prepareProvider(sender.outputs[senderOutput]);
    const parents=graphParentMap(root),senderAncestors=ancestry(ownerGraph(sender),parents),receiverAncestors=ancestry(ownerGraph(receiver),parents),lca=senderAncestors.find(graph=>receiverAncestors.includes(graph));if(!lca)return false;
    const signature=routeSignature(sender,receiver,root,parents,channelId);refreshReceiverInputBoundaries(receiver,root,channelId);if(state.__bvDgRouteSignature===signature&&receiver.inputs[receiverInput].link!=null)return true;
    const previousInputs=connectedInputBoundaries(receiver,sender,channelId);
    // A broken chain must not become reclaimable merely because cleanup below
    // removes its remaining evidence. Require emptiness before AND after cleanup.
    const reclaimable=new Set<any>();
    for(const graph of receiverAncestors){const host=parents.get(graph)?.host;if(host)for(const slot of graph.inputs??[])if(unusedRouteInput(graph,host,root,slot))reclaimable.add(slot)}
    if(state.__bvDgActiveRouteKey||(receiver.inputs[receiverInput].link!=null&&!connectedProviderRecords(receiver,channelId).some(record=>record.source===sender)))cleanupRoute(receiver,state.__bvDgActiveRouteKey,channelId);
    if(channelId)state.inputSlot=receiver.inputs[receiverInput];
    const routeKey=`${stableSenderId(sender)}__to__${receiverAncestors.map(graph=>graph===root?"root":String(parents.get(graph)?.host?.id??"sub")).reverse().join("_")}_${String(receiver.id)}${channelSuffix(channelId)}`;
    let current=nodeConnector(ownerGraph(sender),sender,senderOutput),routeFailed=false;const touched=new Set<any>([sender,receiver]),routeLinks:any[]=[];
    const routeConnect=(connector:Connector,target:any,input:number)=>{const graph=connector.graph,sourceRefs=connector.node===graph?.inputNode?graph.inputs?.[connector.slot]?.linkIds:connector.node.outputs?.[connector.slot]?.links,existing=linkValues(graph).find((link:any)=>String(link.origin_id)===String(connector.node.id)&&Number(link.origin_slot)===connector.slot&&String(link.target_id)===String(target.id)&&Number(link.target_slot)===input&&link.type===PROVIDER&&sourceRefs?.includes(link.id)&&(target===graph?.outputNode?graph.outputs?.[input]?.linkIds?.includes(link.id):target.inputs?.[input]?.link===link.id)),result:any=existing??(target===graph?.outputNode
        ?withNativeGraphOwnership(graph,[connector.node],()=>graph.outputs?.[input]?.connect?.(connector.node.outputs?.[connector.slot],connector.node))
        :connector.connect(target,input));const id=result?.id??result;if(result!==false&&id!=null)routeLinks.push({graph,id,source:connector.node,output:connector.slot,target,input});else{routeFailed=true;state.__bvDgFailure=`${String(connector.node?.outputs?.[connector.slot]?.type)}[${connector.slot}] -> ${String(target?.inputs?.[input]?.type)}[${input}]`}return result};
    programmatic(()=>{
        // Native addInput/addOutput expands immediately. Install the shared
        // measurement projection before creating any technical boundary.
        for(const graph of [...senderAncestors.slice(0,senderAncestors.indexOf(lca)),...receiverAncestors.slice(0,receiverAncestors.indexOf(lca))]){
            const host=parents.get(graph)?.host;if(host){
                for(const slot of [...(host.inputs??[]),...(host.outputs??[]),...(graph.inputs??[]),...(graph.outputs??[])]){
                    if(providerSlot(slot)&&String(slot.name??"").startsWith("__bv_dg_"))setProjectedSlotLabel(slot,"DG");
                }
                installProjectedPortLayout(host);
            }
        }
        for(let graph=ownerGraph(sender);graph!==lca;){const parent=parents.get(graph);if(!parent)return;const route=ensureRouteOutput(graph,parent.host,routeKey,sender,current.node,current.slot);if(route.index<0||!route.boundary||!route.hostSlot)return;prepareProvider(route.boundary);prepareProvider(route.hostSlot);routeConnect(current,graph.outputNode,route.index);current=nodeConnector(parent.parent,parent.host,route.index);touched.add(parent.host);touched.add(graph.outputNode);graph=parent.parent}
        const descent=receiverAncestors.slice(0,receiverAncestors.indexOf(lca)).reverse();
        for(const child of descent){const parent=parents.get(child);if(!parent)return;const route=ensureRouteInput(child,parent.host,routeKey,receiver,previousInputs.get(child),current,channelId,reclaimable);if(route.index<0||!route.boundary||!route.hostSlot)return;prepareProvider(route.boundary);prepareProvider(route.hostSlot);routeConnect(current,parent.host,route.index);current=boundaryConnector(child,route.boundary,route.index);touched.add(parent.host);touched.add(child.inputNode)}
        routeConnect(current,receiver,receiverInput);
    });
    for(const node of touched){installDgAnchorInteractionGuard(node);compactProjectedPortLayout(node)}
    const connected=!routeFailed&&receiver.inputs[receiverInput].link!=null;if(connected){delete state.__bvDgFailure;state.__bvDgActiveRouteKey=routeKey;state.__bvDgRouteSignature=signature;state.__bvDgRouteLinks=routeLinks}else if(typeof window!=="undefined"){const epoch=receiverEpoch.get(receiver);window.setTimeout(()=>{if(!removedReceivers.has(receiver)&&receiverEpoch.get(receiver)===epoch)reconcileDgTopology(receiver,channelId)},50)}return connected;
}

export function reconcileDgTopology(receiver:any,channelId?:string):boolean{
    installConversionGuards(receiver);
    const adapter=adapterFor(receiver,"isReceiver");if(!adapter)return false;
    if(channelId===undefined){
        const declared=channels(receiver);
        for(const [id,state] of channelStates.get(receiver)??[])if(!declared.some(channel=>channel.id===id)||channelInput(receiver,id)<0){
            cleanupRoute(receiver,state.__bvDgActiveRouteKey,id);channelStates.get(receiver)?.delete(id);
        }
        return declared.map(channel=>reconcileDgTopology(receiver,channel.id)).every(Boolean);
    }
    if(channelInput(receiver,channelId)<0)return false;
    const state=channelState(receiver,channelId),metadata=selectionMetadata(receiver,channelId);
    const id=String(adapter.readSelection(receiver,channelId)??state.__bvDgSelectedSenderId??"");if(!id)return disconnectDgSender(receiver,channelId);
    const entries=senderEntries(receiver,channelId),selectedNodeId=String(metadata.bvDgSelectedSenderNodeId??""),selectedTitle=String(metadata.bvDgSelectedSenderTitle??"");
    const entry=entries.find(item=>item.id===id)||(!channelId&&(entries.find(item=>legacySenderMatch(item,id,rootGraph(receiver)))||entries.find(item=>selectedNodeId&&String(item.node.id)===selectedNodeId&&String(item.node.title??"")===selectedTitle)));if(!entry)return false;
    adapter.writeSelection(receiver,entry.id,channelId);state.__bvDgSelectedSenderId=entry.id;return connectDgSender(receiver,entry.id,channelId);
}

/** Topology primitive; clear adapter selection before a durable disconnect. */
export function disconnectDgSender(receiver:any,channelId=""){
    if(channelInput(receiver,channelId)<0)return false;
    const state=channelState(receiver,channelId);
    cleanupRoute(receiver,state.__bvDgActiveRouteKey,channelId);delete state.__bvDgActiveRouteKey;delete state.__bvDgRouteSignature;
    compactProjectedPortLayout(receiver);return true;
}

/** Adapter releases a named endpoint before relinquishing its ownership. */
export function releaseDgReceiverChannel(receiver:any,channelId:string){
    if(!channelId)return false;
    const index=channelInput(receiver,channelId);if(index<0)return false;
    disconnectDgSender(receiver,channelId);channelStates.get(receiver)?.delete(channelId);
    if(receiver.properties?.bvDgChannels)delete receiver.properties.bvDgChannels[channelSuffix(channelId)];
    delete receiver.inputs[index].__bvDgAnchor;setProjectedSlotLabel(receiver.inputs[index],"");
    return true;
}

export function isDgReceiverActive(node:any){return !removedReceivers.has(node)}
export function activateDgReceiver(node:any){removedReceivers.delete(node)}
/** Invalidate deferred work without disconnecting native links during configure. */
export function invalidateDgReceiverWork(node:any){receiverEpoch.set(node,(receiverEpoch.get(node)??0)+1)}
export function deactivateDgReceiver(node:any){
    removedReceivers.add(node);invalidateDgReceiverWork(node);
    if(!programmaticDepth&&adapterFor(node,"isReceiver")&&!adapterFor(node,"isReceiver")?.receiverChannels)cleanupRoute(node,node.__bvDgActiveRouteKey,"");
    for(const [id,state] of channelStates.get(node)??[])cleanupRoute(node,state.__bvDgActiveRouteKey,id);
    channelStates.delete(node);
}
export function queueDgUpgrade(node:any,upgrade:(node:any)=>void){const epoch=receiverEpoch.get(node);queueMicrotask(()=>{if(!removedReceivers.has(node)&&receiverEpoch.get(node)===epoch)upgrade(node)})}
export function scheduleDgUpgrade(node:any,upgrade:(node:any)=>void){const epoch=receiverEpoch.get(node);return setTimeout(()=>{if(!removedReceivers.has(node)&&receiverEpoch.get(node)===epoch)upgrade(node)},0)}
