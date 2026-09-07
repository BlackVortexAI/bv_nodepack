import type {RegionalDocument,Region} from "./model";
import {sameLoraTarget,type LoraV3Config} from "./LoraV3ResourcePickerPanel";
import type {RegionalLoraBindings} from "./loraBindings";
import type {LutEasyConfig} from "./lutEasyMode";
export function regionalActiveTools(document:RegionalDocument,region:Region|null,lora:LoraV3Config,bindings:RegionalLoraBindings,lut:LutEasyConfig):string[]{
 const flags=region?region.tool_settings:document.tool_settings;
 const target=region?{scope:"region" as const,document_id:document.document_id,region_id:region.id}:{scope:"global" as const};
 const hasLora=lora.entries.some(entry=>entry.targets.some(candidate=>sameLoraTarget(candidate,target)))||Boolean(region?bindings.regions[region.id]:bindings.global_stack_id);
 const hasLut=lut.jobs.some(job=>region?job.scope!=="global"&&job.region_ids.includes(region.id):job.scope==="global");
 return [...((flags?.lora??hasLora)?["lora"]:[]),...((flags?.lut??hasLut)?["lut"]:[]),...(!region&&(flags?.references??Boolean(document.reference_images?.length))?["references"]:[])];
}
