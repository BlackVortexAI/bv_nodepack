import {workflowRegistries} from "./registryDgFamilies";
import {strictLoraRegistryConfig,type LoraRegistryConfig} from "./loraRegistryConfig";

export function workflowGlobalLoraSelection(node:any){
    const active=workflowRegistries(node,"lora").flatMap(source=>{
        const config=strictLoraRegistryConfig(source.widgets?.find((widget:any)=>widget.name==="config_json")?.value);
        return config?.stacks.some(stack=>stack.role==="global"&&stack.enabled)?[{node:source,config}]:[];
    });
    return{active,conflict:active.length>1};
}

/** Only an explicit rising switch edge selects a winner; configure never calls this. */
export function exclusiveGlobalLoraChanges(node:any,previous:LoraRegistryConfig,next:LoraRegistryConfig){
    const was=previous.stacks.find(stack=>stack.role==="global")?.enabled===true;
    const now=next.stacks.find(stack=>stack.role==="global")?.enabled===true;
    if(was||!now)return[];
    return workflowGlobalLoraSelection(node).active.filter(item=>item.node!==node).map(item=>({node:item.node,config:{...item.config,stacks:item.config.stacks.map(stack=>stack.role==="global"?{...stack,enabled:false}:stack)}}));
}
