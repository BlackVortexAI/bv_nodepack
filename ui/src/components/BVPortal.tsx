import { FC, useEffect, useMemo, useState } from "react";
import BVControl from "./control/BVControlComponent";
import { BvDockLayout, BvManagedWindow, Callout, ResetLayoutButton, ToggleField } from "../ui";
import { BVControlConfig, CONFIG_CHANGED_EVENT, readConfig, writeConfig } from "../util/control/configHandler";

interface IBVPortalProps { open:boolean; onClose:()=>void; hasControlNodes?:boolean }

function ControlCenterLiveView(){
    const [config,setConfig]=useState<BVControlConfig>(readConfig);
    useEffect(()=>{const update=(event:Event)=>setConfig((event as CustomEvent<BVControlConfig>).detail);window.addEventListener(CONFIG_CHANGED_EVENT,update);return()=>window.removeEventListener(CONFIG_CHANGED_EVENT,update)},[]);
    const toggle=(id:string,enabled:boolean)=>writeConfig({...config,controls:config.controls.map(control=>control.id===id?{...control,enabled}:control)});
    if(!config.controls.length)return <Callout tone="info" title="No controls configured">Create a control in Configuration before using live workflow states.</Callout>;
    return <div className="bv-control-live-list">{config.controls.map(control=><div className="bv-control-live-row" key={control.id}>
        <div className="bv-control-live-copy"><strong>{control.name}</strong><span>{control.assignments.length} assignment{control.assignments.length===1?"":"s"}</span></div>
        <ToggleField className="bv-control-live-toggle-field" label={`${control.name} state`} value={control.enabled} trueLabel="Active" falseLabel="Inactive" onValue={value=>toggle(control.id,value)}/>
    </div>)}</div>;
}

const BvPortal: FC<IBVPortalProps> = ({open,onClose,hasControlNodes=true}) => {
    const [layoutReset,setLayoutReset]=useState(0);
    const hasControls=readConfig().controls.length>0,defaultModel=useMemo(()=>({global:{tabEnableClose:false,tabEnableDrag:false,tabEnablePopout:false,tabEnablePopoutIcon:false,tabEnableFloat:false},borders:[],layout:{type:"row" as const,children:[{type:"tabset" as const,selected:hasControls?0:1,children:[{type:"tab" as const,id:"control-center-controls",name:"Controls",component:"controls",enableClose:false,enableDrag:false},{type:"tab" as const,id:"control-center-configuration",name:"Configuration",component:"configuration",enableClose:false,enableDrag:false}]}]}}),[hasControls]);
    return <BvManagedWindow open={open} title="BV Control Center" shortTitle="Control Center" initialGeometry={{width:860,height:640}} minSize={{width:420,height:360}} onClose={onClose} status="Workflow-wide controls and layout are saved automatically." actions={<ResetLayoutButton onClick={()=>setLayoutReset(value=>value+1)}/>}>
        {!hasControlNodes&&<Callout tone="warning" title="No Control Center nodes in workflow">The workflow configuration is still available. Closing this window makes it unavailable until a Control Center node is added.</Callout>}
        <BvDockLayout storageId="control-center" resetSignal={layoutReset+(hasControls?0:1)} defaultModel={defaultModel as any} panels={[{id:"controls",title:"Controls",weight:1,content:<ControlCenterLiveView/>},{id:"configuration",title:"Configuration",weight:1,content:<BVControl/>}]}/>
    </BvManagedWindow>;
};

export default BvPortal;
