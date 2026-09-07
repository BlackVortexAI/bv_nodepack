import { registrySourceKind } from "./registryDgFamilies";
const nodeClass=(node:any)=>String(node.comfyClass??node.type??"");
const read=(node:any,name:string,index:number)=>node.widgets_values_named?.[name]??(Array.isArray(node.widgets_values)?node.widgets_values[index]:node.widgets_values?.[name]);
function write(node:any,name:string,index:number,value:any){
    const serialized=JSON.stringify(value);
    if(Array.isArray(node.widgets_values))node.widgets_values[index]=serialized;
    else node.widgets_values={...node.widgets_values,[name]:serialized};
    if(node.widgets_values_named)node.widgets_values_named[name]=serialized;
}
const parse=(raw:any)=>typeof raw==="string"?JSON.parse(raw):structuredClone(raw);
/** LUT/Detector resource names are registry-scoped. Only their registry identity changes. */
export function prepareCompositeRegistryClipboard(nodes:any[]){
    const remap=new Map<string,string>();
    const references=new Set(nodes.flatMap(node=>Object.values(node.properties?.bvRegistryDgSelections??{})));
    for(const node of nodes){
        const family=registrySourceKind(node);
        if(!family||family==="lora"||(family!=="reference"&&!node.properties?.bvRegistryDgSource&&!references.has(node.properties?.bvDgSenderId)))continue;
        const value=parse(read(node,"config_json",0));
        const field=family==="reference"?"entries":family==="lut"?"luts":"detectors";
        const schema=family==="reference"?"bv.reference_registry_config":family==="lut"?"bv.lut_registry_config":"bv.detector_registry_config";
        if(!value||value.schema!==schema||!String(value.collector_id??"").trim()||!Array.isArray(value[field])||value[field].some((entry:any)=>!entry||typeof entry.id!=="string"||!entry.id.trim())||new Set(value[field].map((entry:any)=>entry.id)).size!==value[field].length)throw new Error("DG Registry clipboard: invalid copied Registry config");
        const key=`${family}:${value.collector_id}`;
        const duplicates=nodes.filter(other=>registrySourceKind(other)===family).filter(other=>parse(read(other,"config_json",0))?.collector_id===value.collector_id);
        if(remap.has(key)||duplicates.length!==1)throw new Error("DG Registry clipboard: ambiguous copied domain identity");
        const next=crypto.randomUUID();remap.set(key,next);write(node,"config_json",0,{...value,collector_id:next});
    }
    for(const node of nodes){
        const type=nodeClass(node);
        if(type==="BV Regional Prompt"&&[...remap.keys()].some(key=>key.startsWith("reference:"))){
            const documentRaw=read(node,"regional_json",0);
            if(typeof documentRaw==="string"&&documentRaw.trim().startsWith("{")){const document=parse(documentRaw), core=document.core??document;let changed=false;
                for(const image of core.reference_images??[]){const next=remap.get(`reference:${image.collector_id}`);if(next){image.collector_id=next;changed=true;}}
                for(const pair of [core.prompts?.global,core.prompts?.background,...(core.regions??[]).map((region:any)=>region.prompts)])for(const mentions of Object.values(pair?.references??{}) as any[][])for(const mention of mentions){const next=remap.get(`reference:${mention.collector_id}`);if(next){mention.collector_id=next;changed=true;}}
                if(changed)write(node,"regional_json",0,document);
            }
            const raw=read(node,"reference_v3_config_json",5);
            if(raw){const value=parse(raw);if(!Array.isArray(value.collector_ids))throw Error("DG Registry clipboard: invalid reference selection");
                const ids=value.collector_ids.map((id:string)=>remap.get(`reference:${id}`)??id);
                if(ids.some((id:string,index:number)=>id!==value.collector_ids[index]))write(node,"reference_v3_config_json",5,{...value,collector_ids:ids});
            }
        }
        const configs:{family:"lut"|"detector";name:string;index:number}[]=type==="BV Regional Prompt"?[{family:"lut",name:"lut_v3_config_json",index:4},{family:"detector",name:"detailer_v3_config_json",index:3}]:type==="BV Regional LUT Plan"?[{family:"lut",name:"config_json",index:0}]:type==="BV Regional Detailer Plan"?[{family:"detector",name:"config_json",index:0}]:[];
        for(const spec of configs){
            if(![...remap.keys()].some(key=>key.startsWith(`${spec.family}:`)||(spec.family==="lut"&&key.startsWith("detector:"))))continue;
            const raw=read(node,spec.name,spec.index);if(raw==null||raw==="")continue;
            const value=parse(raw);if(!Array.isArray(value?.jobs))throw new Error("DG Registry clipboard: invalid copied consumer config");
            let changed=false;
            const rewrite=(source:any,family:string)=>{if(!source)return;const next=remap.get(`${family}:${source.collector_id}`);if(next){source.collector_id=next;changed=true}};
            for(const job of value.jobs){
                if(spec.family==="lut"){rewrite(job.lut_source,"lut");rewrite(job.detector_source,"detector")}
                else for(const assignment of job.detector_assignments??[])rewrite(assignment.source,"detector");
            }
            if(changed)write(node,spec.name,spec.index,value);
        }
        // Loop Start owns no config. Its native plan source remains authoritative;
        // reconciliation after paste derives providers again, never edits that source.
        if(type==="BV LUT Loop Start"&&Object.keys(node.properties?.bvRegistryDgSelections??{}).length){
            delete node.properties.bvRegistryDgSelections;
            delete node.properties.bvRegistryDgSourceKinds;
        }
    }
}
