import { useMemo, useState } from "react";
import { Button, BvFooterActions, BvManagedWindow, BvWindowNavigator, Callout, EmptyState, FieldGrid, NumberField, ResourcePicker, SelectField, SortableItem, SortableList, ToggleField, UiDensity, UnsavedChangesDialog, useBvHistory, useBvHistoryShortcuts } from "../ui";
import { LutPlanConfig, LutPlanRegion, parseLutPlanConfig, serializeLutPlanConfig } from "./lutPlanConfig";
import { ResourcePickerCollector } from "../ui/components/ResourcePicker";
import { setWindowMenuVisible, useWindowMenuVisibility } from "../ui/windowRegistry";

export function LutPlanDialogView({regions,lutCollectors,detectorCollectors,stored,save,close,nodeId="",nodes=[],onNavigate=()=>{},currentNode}:{regions:LutPlanRegion[];lutCollectors:ResourcePickerCollector[];detectorCollectors:ResourcePickerCollector[];stored:unknown;save:(value:string)=>void;close:()=>void;nodeId?:string;nodes?:Array<{id:string;label:string}>;onNavigate?:(id:string,replace:boolean)=>void;currentNode?:any}) {
    const initial=useMemo(()=>parseLutPlanConfig(stored,regions),[stored,regions]);
    const history=useBvHistory(initial),config=history.value;
    const [baseline,setBaseline]=useState(()=>serializeLutPlanConfig(initial));
    const [pending,setPending]=useState<null|(()=>void)>(null);
    useBvHistoryShortcuts(history);
    const dirty=serializeLutPlanConfig(config)!==baseline;
    const available=regions.filter(item=>item.enabled!==false);
    const menuVisible=useWindowMenuVisibility(currentNode);
    const update=(fn:(draft:LutPlanConfig)=>void)=>history.commit(current=>{const draft=structuredClone(current);fn(draft);return draft});
    const saveCurrent=()=>{const value=serializeLutPlanConfig(config);save(value);setBaseline(value);history.clear()};
    const request=(action:()=>void)=>dirty?setPending(()=>action):action();
    const add=()=>{const collector=lutCollectors[0],resource=collector?.resources[0];if(!collector||!resource)return;update(draft=>draft.jobs.push({id:crypto.randomUUID(),scope:"global",region_ids:[],mask_composition:"union",lut_source:{collector_id:collector.id,resource_id:resource.id},strength:1,mask_invert:false,detector_source:null}))};
    const items:SortableItem[]=config.jobs.map((job,index)=>({
        id:job.id,
        title:`Job ${index+1}`,
        description:job.scope==="global"?"Entire image":job.region_ids.map(id=>available.find(region=>region.id===id)?.name??id).join(" + ")||"No region",
        summary:<div className="bv-editor-item-compact-summary"><span>{job.scope}</span><span>{job.lut_source.resource_id}</span><span>{Math.round(job.strength*100)}%</span></div>,
        content:<div className="bv-detector-details"><FieldGrid>
            <SelectField label="Scope" value={job.scope} options={[{value:"global",label:"Global · entire image"},{value:"regional",label:"Regional"}]} onValue={value=>update(draft=>{const target=draft.jobs[index];target.scope=value as typeof target.scope;target.region_ids=value==="global"?[]:(target.region_ids.length?target.region_ids:available[0]?[available[0].id]:[])})}/>
            {job.scope==="regional"&&<SelectField label="Region" value={job.region_ids[0]??""} options={available.map(item=>({value:item.id,label:item.name}))} onValue={value=>update(draft=>{draft.jobs[index].region_ids=[value]})}/>}
            <ResourcePicker label="LUT" collectors={lutCollectors} collectorId={job.lut_source.collector_id} resourceId={job.lut_source.resource_id} onSelection={(collector_id,resource_id)=>update(draft=>{draft.jobs[index].lut_source={collector_id,resource_id}})}/>
            <ResourcePicker label="Detector mask" emptyLabel="No detector" collectors={detectorCollectors} collectorId={job.detector_source?.collector_id??""} resourceId={job.detector_source?.resource_id??""} onSelection={(collector_id,resource_id)=>update(draft=>{draft.jobs[index].detector_source=collector_id&&resource_id?{collector_id,resource_id}:null})}/>
            <NumberField label="Strength" value={job.strength} min={0} max={1} step={.05} onValue={value=>update(draft=>{draft.jobs[index].strength=value})}/>
            <ToggleField label="Mask" value={job.mask_invert} trueLabel="Inverted · grade outside" falseLabel="Normal · grade inside" onValue={value=>update(draft=>{draft.jobs[index].mask_invert=value})}/>
        </FieldGrid></div>,
    }));
    return <>
        <BvManagedWindow open title="Regional LUT Plan" shortTitle="LUT Plan" menuVisible={menuVisible} onMenuVisible={visible=>setWindowMenuVisible(currentNode,visible)} context={<BvWindowNavigator label="LUT Plan Node" value={nodeId} options={nodes.map(item=>({value:item.id,label:item.label}))} onNavigate={(id,replace)=>replace?request(()=>onNavigate(id,true)):onNavigate(id,false)}/>} initialGeometry={{width:1040,height:720}} minSize={{width:420,height:360}} onClose={()=>request(close)} status={dirty?"Unsaved plan changes":"Plan saved"} actions={<BvFooterActions primary={<Button intent="primary" onClick={saveCurrent}>Save plan</Button>} secondary={<Button disabled={!lutCollectors.some(item=>item.resources.length)} onClick={add}>Add job</Button>} overflow={[{id:"undo",label:"Undo",disabled:!history.canUndo,onSelect:history.undo},{id:"redo",label:"Redo",disabled:!history.canRedo,onSelect:history.redo},{id:"discard",label:"Discard changes",disabled:!dirty,onSelect:()=>history.replace(parseLutPlanConfig(baseline,regions),true)}]}/>}>
            <UiDensity density="compact" className="bv-editor-dialog">
                {!lutCollectors.length&&<Callout tone="warning" title="No LUT Registry">Add a BV LUT Registry to this graph before creating LUT jobs.</Callout>}
                {!config.jobs.length?<EmptyState title="No LUT jobs" description="Add a global or regional LUT job."/>:<SortableList items={items} onReorder={next=>update(draft=>{const byId=new Map(draft.jobs.map(job=>[job.id,job]));draft.jobs=next.map(item=>byId.get(item.id)!).filter(Boolean)})} onRemove={id=>update(draft=>{draft.jobs=draft.jobs.filter(job=>job.id!==id)})}/>}
            </UiDensity>
        </BvManagedWindow>
        <UnsavedChangesDialog open={Boolean(pending)} editorName="LUT Plan" onKeep={()=>setPending(null)} onDiscard={()=>{const action=pending;setPending(null);action?.()}} onSave={()=>{saveCurrent();const action=pending;setPending(null);action?.()}}/>
    </>;
}
