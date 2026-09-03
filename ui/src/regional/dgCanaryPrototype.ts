// Throwaway test UI and storage adapter; DG mechanics live in dgRouting.
import { compactProjectedPortLayout, suppressInitialProjectedProviderDefinitions } from "./portProjection";
import {
    registerDgAdapter, dgSenderChoices as dgCanarySenderChoices,
    connectDgSender as connectDgCanarySender, disconnectDgSender as disconnectDgCanarySender,
    reconcileDgTopology as reconcileDgCanaryTopology, installDgAnchorInteractionGuard,
    installConversionGuards, providerIndex, prepareProvider, queueDgUpgrade,
    isDgReceiverActive, activateDgReceiver, deactivateDgReceiver, type DgSenderChoice,
} from "./dgRouting";
export { prepareDgClipboard, installDgAnchorInteractionGuard } from "./dgRouting";
export { dgCanarySenderChoices, connectDgCanarySender, disconnectDgCanarySender, reconcileDgCanaryTopology };

const SENDER="BV Titlebar Port Canary Sender (THROW AWAY)";
const RECEIVER="BV Titlebar Port Canary Receiver (THROW AWAY)";
const PROVIDER="BV_RUNTIME_RESOURCE_PROVIDER";
const NONE="No DG sender";
const receiverWatchers=new WeakMap<object,{timer:number}>();

registerDgAdapter({
    id:"throwaway-canary",
    isSender:node=>node?.type===SENDER,
    isReceiver:node=>node?.type===RECEIVER,
    readSelection:node=>stateWidget(node)?.value??node?.__bvDgSelectedSenderId??"",
    writeSelection(node,id){const state=stateWidget(node);if(state)state.value=id},
    readSerializedSelection(node){
        const values=node.widgets_values;
        return String(node.widgets_values_named?.sender_id??(Array.isArray(values)?values[0]:values?.sender_id)??node.properties?.bvDgSelectedSenderStableId??"");
    },
    writeSerializedSelection(node,id){
        const values=node.widgets_values;
        if(Array.isArray(values))values[0]=id;else node.widgets_values={...values,sender_id:id};
        if(node.widgets_values_named)node.widgets_values_named.sender_id=id;
    },
});

const stateWidget=(node:any)=>node?.widgets?.find((item:any)=>item?.name==="sender_id");
function hideStateWidget(item:any){if(!item)return;item.type="converted-widget";item.hidden=true;item.computeSize=()=>[0,0];item.serializeValue=()=>item.value;if(item.element)item.element.style.display="none"}
function ensureReceiverProvider(node:any){let index=providerIndex(node?.inputs);if(index<0){node.addInput?.("resource_provider",PROVIDER);index=providerIndex(node?.inputs)}if(index>=0)prepareProvider(node.inputs[index]);return index}
function selectorLabel(node:any,id:string){return dgCanarySenderChoices(node).find((choice:DgSenderChoice)=>choice.id===String(id))?.label??NONE}
const selectorWidget=(node:any)=>node?.widgets?.find((item:any)=>item?.name==="dg_sender_selector");
function refreshReceiverSelector(node:any){
    // Widgets are replaced by configure/proxy lifecycles. Never retain their
    // object identity in a timer, and never treat their absence as deselection.
    const state=stateWidget(node),selector=selectorWidget(node);if(!state||!selector)return;
    const choices=dgCanarySenderChoices(node),values=[NONE,...choices.map(choice=>choice.label)];
    const id=String(state.value??""),choice=choices.find(choice=>choice.id===id);
    selector.options??={};const previous=selector.options.values;
    let changed=false;
    if(!Array.isArray(previous)||previous.length!==values.length||values.some((value,index)=>value!==previous[index])){selector.options.values=values;changed=true}
    // A temporarily unavailable graph/sender is not an explicit 'No sender'.
    const label=choice?.label??(id?selector.value:NONE);
    if(selector.value!==label){selector.value=label;changed=true}
    if(changed)node.setDirtyCanvas?.(true,true);
}
function stopReceiverWatcher(node:any){
    const watcher=receiverWatchers.get(node);receiverWatchers.delete(node);
    if(watcher&&typeof window!=="undefined")window.clearTimeout(watcher.timer);
}
function installReceiverSelector(node:any){
    if(!isDgReceiverActive(node))return;
    const state=stateWidget(node);if(!state)return;hideStateWidget(state);ensureReceiverProvider(node);installDgAnchorInteractionGuard(node);compactProjectedPortLayout(node);
    let selector=node.widgets?.find((item:any)=>item?.name==="dg_sender_selector");
    const values=()=>[NONE,...dgCanarySenderChoices(node).map((choice:DgSenderChoice)=>choice.label)];
    const select=(label:string)=>{const current=stateWidget(node);if(!current||!isDgReceiverActive(node))return;const choice=dgCanarySenderChoices(node).find((item:DgSenderChoice)=>item.label===label);if(!choice&&label!==NONE)return;current.value=choice?.id??"";node.__bvDgSelectedSenderId=current.value;if(choice)connectDgCanarySender(node,choice.id);else disconnectDgCanarySender(node);refreshReceiverSelector(node)};
    if(!selector){selector=node.addWidget?.("combo","dg_sender_selector",selectorLabel(node,String(state.value??"")),select,{values:values()});if(selector){selector.label="DG Sender";selector.serialize=false}}
    else{selector.callback=select}
    reconcileDgCanaryTopology(node);
    refreshReceiverSelector(node);
    if(typeof window!=="undefined"&&!receiverWatchers.has(node)){
        const watcher={timer:0};receiverWatchers.set(node,watcher);
        const poll=()=>{
            if(receiverWatchers.get(node)!==watcher||!isDgReceiverActive(node))return;
            if(stateWidget(node)&&selectorWidget(node)){reconcileDgCanaryTopology(node);refreshReceiverSelector(node)}
            if(receiverWatchers.get(node)===watcher)watcher.timer=window.setTimeout(poll,250);
        };
        watcher.timer=window.setTimeout(poll,250);
    }
}
function chain(nodeType:any,upgrade:(node:any)=>void){
    const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure,added=nodeType.prototype.onAdded;
    nodeType.prototype.onAdded=function(){const result=added?.apply(this,arguments);installConversionGuards(this);return result};
    nodeType.prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);queueDgUpgrade(this,upgrade);return result};
    nodeType.prototype.onConfigure=function(){const result=configured?.apply(this,arguments);queueDgUpgrade(this,upgrade);return result};
}

export function installDgCanaryPrototype(nodeType:any,nodeData:any){
    if(nodeData?.name===SENDER){
        chain(nodeType,node=>{const index=providerIndex(node.outputs);if(index>=0)prepareProvider(node.outputs[index]);installDgAnchorInteractionGuard(node);compactProjectedPortLayout(node)});return true;
    }
    if(nodeData?.name===RECEIVER){
        suppressInitialProjectedProviderDefinitions(nodeData);chain(nodeType,installReceiverSelector);
        const removed=nodeType.prototype.onRemoved,added=nodeType.prototype.onAdded;
        nodeType.prototype.onRemoved=function(){deactivateDgReceiver(this);stopReceiverWatcher(this);return removed?.apply(this,arguments)};
        nodeType.prototype.onAdded=function(){activateDgReceiver(this);const result=added?.apply(this,arguments);queueDgUpgrade(this,installReceiverSelector);return result};
        return true;
    }
    return false;
}
