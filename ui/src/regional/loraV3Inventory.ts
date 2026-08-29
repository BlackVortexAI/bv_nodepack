export const LORA_V3_INVENTORY_CHANGED_EVENT="bv-regional-lora-inventory-changed";

export function notifyLoraV3InventoryChanged(node?:any){
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(LORA_V3_INVENTORY_CHANGED_EVENT,{detail:{node}}));
}

export function storeLoraRegistryInventory(node:any,widget:any,value:string,refresh:()=>void){
    widget.value=value;
    widget.callback?.(value);
    refresh();
    node.graph?.setDirtyCanvas?.(true,true);
    notifyLoraV3InventoryChanged(node);
}

const INVENTORY_WIDGETS=new Set(["name","stack_id"]);

function bindInventoryWidget(node:any,widget:any){
    if(!INVENTORY_WIDGETS.has(String(widget?.name??""))||widget?.callback?.__bvLoraInventorySource)return;
    const original=widget.callback;
    const callback=function(this:any,...args:any[]){const result=original?.apply(this,args);notifyLoraV3InventoryChanged(node);return result;};
    callback.__bvLoraInventorySource=true;
    widget.callback=callback;
}

export function installNamedLoraInventorySource(nodeType:any,prepare:(node:any)=>void){
    const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure,changed=nodeType.prototype.onConnectionsChange,removed=nodeType.prototype.onRemoved;
    const upgrade=(node:any)=>{prepare(node);for(const widget of node.widgets??[])bindInventoryWidget(node,widget);notifyLoraV3InventoryChanged(node);};
    nodeType.prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);queueMicrotask(()=>upgrade(this));return result;};
    nodeType.prototype.onConfigure=function(){const result=configured?.apply(this,arguments);queueMicrotask(()=>upgrade(this));return result;};
    nodeType.prototype.onConnectionsChange=function(){const result=changed?.apply(this,arguments);queueMicrotask(()=>notifyLoraV3InventoryChanged(this));return result;};
    nodeType.prototype.onRemoved=function(){const result=removed?.apply(this,arguments);queueMicrotask(()=>notifyLoraV3InventoryChanged(this));return result;};
}

export function installLoraRegistryInventorySource(nodeType:any,prepare:(node:any)=>void=()=>{}){
    const prototype=nodeType?.prototype;if(!prototype||prototype.__bvLoraRegistryInventorySource)return;
    prototype.__bvLoraRegistryInventorySource=true;
    const created=prototype.onNodeCreated,configured=prototype.onConfigure,removed=prototype.onRemoved;
    prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);queueMicrotask(()=>{prepare(this);notifyLoraV3InventoryChanged(this)});return result;};
    prototype.onConfigure=function(){const result=configured?.apply(this,arguments);queueMicrotask(()=>{prepare(this);notifyLoraV3InventoryChanged(this)});return result;};
    prototype.onRemoved=function(){const result=removed?.apply(this,arguments);queueMicrotask(()=>notifyLoraV3InventoryChanged(this));return result;};
}
