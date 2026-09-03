import { activateDgReceiver, deactivateDgReceiver, invalidateDgReceiverWork, queueDgUpgrade } from "./dgRouting";
import { activateNewRegistryDgConsumer, restoreRegistryDgActivation } from "./loraRegistryDgAdapter";

export function resetRegistryScheduledWork(node:any){
    invalidateDgReceiverWork(node);
    node.__bvLutV3Scheduled=false;node.__bvDetailerV3Scheduled=false;node.__bvDetailerPromptV3Scheduled=false;
}
/** Shared lifecycle for registry-backed plan consumers. Presentation remains delegated. */
export function installRegistryDgLifecycle(nodeType:any,prepare:(node:any)=>void,configuredPrepare=prepare){
    const prototype=nodeType.prototype;
    const created=prototype.onNodeCreated,configured=prototype.onConfigure,added=prototype.onAdded,removed=prototype.onRemoved,changed=prototype.onConnectionsChange;
    prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);activateNewRegistryDgConsumer(this);queueDgUpgrade(this,()=>prepare(this));return result};
    prototype.onConfigure=function(data:any){resetRegistryScheduledWork(this);restoreRegistryDgActivation(this,data);const result=configured?.apply(this,arguments);queueDgUpgrade(this,()=>configuredPrepare(this));return result};
    prototype.onAdded=function(){activateDgReceiver(this);const result=added?.apply(this,arguments);queueDgUpgrade(this,()=>prepare(this));return result};
    prototype.onRemoved=function(){deactivateDgReceiver(this);resetRegistryScheduledWork(this);return removed?.apply(this,arguments)};
    prototype.onConnectionsChange=function(){const result=changed?.apply(this,arguments);queueDgUpgrade(this,()=>prepare(this));return result};
}
