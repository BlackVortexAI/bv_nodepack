import React,{createContext,useContext,useEffect,useRef,useState} from "react";
import {Button,CheckboxField,Popover,SelectField,TextField,TextareaField} from "../ui/components";
import {getApi} from "../appHelper";
import {configureWritingProvider} from "../remoteLLM";
import {ASSIST_PRESETS,assistPreset,chooseAssistPreset,type AssistPresetId} from "./promptAssistPresets";
import {ASSIST_EVENT,DEFAULT_ASSIST_SYSTEM,NATIVE_TEXT_TARGET,captureAssistField,maskAssistReferences,readAssistConfig,replaceAssistField,restoreAssistReferences,writeAssistConfig,type AssistConfig,type AssistNode,type AssistSnapshot,type Polarity} from "./promptAssistState";

export const PromptAssistContext=createContext<{node:AssistNode|null;active:boolean;documentId?:string}>({node:null,active:false});
export function usePromptAssist(node:AssistNode|null){
    const [config,setConfig]=useState(()=>readAssistConfig(node));
    useEffect(()=>{setConfig(readAssistConfig(node));const refresh=(event:Event)=>{if((event as CustomEvent).detail.node===node)setConfig(readAssistConfig(node));};window.addEventListener(ASSIST_EVENT,refresh);return()=>window.removeEventListener(ASSIST_EVENT,refresh);},[node]);
    return {config,onConfig:(next:AssistConfig)=>{if(node)setConfig(writeAssistConfig(node,next));}};
}
type Profile={id:string;label:string;default_model:string;configured:boolean;effective_endpoint:string|null};
export function PromptAssistPanel({config,onConfig}:{config:AssistConfig;onConfig:(value:AssistConfig)=>void}){
    const {node,active,documentId}=useContext(PromptAssistContext);
    const [profiles,setProfiles]=useState<Profile[]>([]),[error,setError]=useState(""),[settingsOpen,setSettingsOpen]=useState(false),[refresh,setRefresh]=useState(0);
    useEffect(()=>setSettingsOpen(false),[node,active,documentId]);
    useEffect(()=>{
        if(!settingsOpen)return;
        let live=true;
        getApi().fetchApi("/bv_nodepack/remote_llm/providers").then(async response=>{if(!response.ok)throw new Error("Provider catalog unavailable.");return response.json();}).then(value=>{if(live){setProfiles(value.profiles);setError("");}}).catch(reason=>{if(live)setError(String(reason.message??reason));});
        return()=>{live=false;};
    },[settingsOpen,refresh]);
    const update=(patch:Partial<AssistConfig>)=>onConfig({...config,...patch}),profile=profiles.find(item=>item.id===config.profile_id);
    return <div className="bv-writing-compact">
        <div className="bv-writing-options">
            <CheckboxField label="Translate" checked={config.translate} onValue={translate=>update({translate})}/>
            <CheckboxField label="Improve" checked={config.improve} onValue={improve=>update({improve})}/>
        </div>
        <div className="bv-writing-controls">
            {config.translate&&<TextField label="Language" value={config.language} maxLength={80} placeholder="English" onValue={language=>update({language})}/>}
            <Popover open={settingsOpen&&active} onOpen={setSettingsOpen} trigger={({open,toggle})=><Button density="compact" intent="ghost" aria-haspopup="dialog" aria-expanded={open} title={config.model?`${config.profile_id} · ${config.model}`:"Configure writing assistance"} onClick={toggle}>⚙ {config.profile_id&&config.model?"Settings":"Configure"}</Button>}>
                <div className="bv-writing-settings bv-ui-stack" role="dialog" aria-label="Writing settings">
                    <header className="bv-writing-settings-header"><strong>Writing settings</strong><Button density="compact" intent="ghost" iconOnly aria-label="Close writing settings" onClick={()=>setSettingsOpen(false)}>×</Button></header>
                    <SelectField label="Provider" value={config.profile_id} onValue={profile_id=>update({profile_id,model:profiles.find(item=>item.id===profile_id)?.default_model??""})} options={[{value:"",label:"Choose provider"},...profiles.map(item=>({value:item.id,label:item.label}))]}/>
                    <TextField label="Model" value={config.model} maxLength={200} onValue={model=>update({model})}/>
                    {<Button density="compact" disabled={!config.profile_id} onClick={()=>{setError("");configureWritingProvider(getApi(),config.profile_id,()=>setRefresh(value=>value+1)).catch(reason=>setError(String(reason.message??reason)));}}>Configure provider credentials</Button>}
                    {profile&&<small>{profile.configured?"✓ Provider configured":"Use Configure provider credentials to set up this provider."}{profile.effective_endpoint?` · ${new URL(profile.effective_endpoint).host}`:""}</small>}
                    <SelectField label="Target image model / prompt profile" value={config.prompt_preset??"general"} options={[...ASSIST_PRESETS.map(item=>({value:item.id,label:item.label})),{value:"custom",label:"Custom"}]} onValue={id=>onConfig(chooseAssistPreset(config,id as AssistPresetId))}/>
                    <small>Selecting a curated profile replaces the system prompt below. Your provider and LLM model stay the same.</small>
                    {assistPreset(config.prompt_preset??"general")&&config.system_prompt!==assistPreset(config.prompt_preset??"general")!.system&&<small>Customized — saved text is used until you reset the profile.</small>}
                    <TextareaField label="System prompt" rows={5} maxLength={8192} value={config.system_prompt} onValue={system_prompt=>update({system_prompt})}/>
                    <div className="bv-writing-options"><Button density="compact" intent="ghost" disabled={config.prompt_preset==="custom"} onClick={()=>onConfig(chooseAssistPreset(config,config.prompt_preset??"general"))}>Reset profile</Button><Button density="compact" intent="ghost" onClick={()=>setRefresh(value=>value+1)}>Refresh providers</Button></div>
                    {error&&<small role="alert">{error}</small>}
                    <small>Autosaved for this node. Apply using the writing button.</small>
                </div>
            </Popover>
        </div>
    </div>;
}
export function PromptAssistAction({target,polarity,text,alwaysEnabled=false}:{target:string;polarity:Polarity;text?:string;alwaysEnabled?:boolean}){
    const {node,active,documentId}=useContext(PromptAssistContext),{config}=usePromptAssist(node);
    const [busy,setBusy]=useState(false),[error,setError]=useState(""),[undo,setUndo]=useState<{before:AssistSnapshot;after:AssistSnapshot}|null>(null);
    const generation=useRef(0),controller=useRef<AbortController|null>(null);
    const current=useRef({node,target,polarity,documentId,active,enabled:config.enabled});
    current.current={node,target,polarity,documentId,active,enabled:config.enabled||alwaysEnabled};
    useEffect(()=>{generation.current++;controller.current?.abort();setBusy(false);setError("");setUndo(null);return()=>{generation.current++;controller.current?.abort();};},[node,target,polarity,documentId,active,config.enabled]);
    if(!node||!active||(!config.enabled&&!alwaysEnabled))return null;
    const run=async()=>{
        if(busy)return;
        const runId=++generation.current,abort=new AbortController();controller.current=abort;setBusy(true);setError("");
        try{
            const before=captureAssistField(node,target,polarity),masked=target===NATIVE_TEXT_TARGET?{text:before.text,mentions:[]}:maskAssistReferences(before.text,before.mentions);
            if(!before.text.trim())throw new Error("Enter a prompt first.");
            const response=await getApi().fetchApi("/bv_nodepack/remote_llm/assist",{method:"POST",headers:{"Content-Type":"application/json"},signal:abort.signal,body:JSON.stringify({text:masked.text,profile_id:config.profile_id,model:config.model,translate:config.translate,improve:config.improve,language:config.language,system_prompt:config.system_prompt})});
            const value=await response.json();
            if(!response.ok)throw new Error(value.error??"Writing assistance failed.");
            if(runId!==generation.current||current.current.node!==node||current.current.target!==target||current.current.polarity!==polarity||current.current.documentId!==documentId||!current.current.active||!current.current.enabled)return;
            if(typeof value.text!=="string"||value.text.length>32768)throw new Error("Invalid writing assistance response.");
            const restored=target===NATIVE_TEXT_TARGET?{text:value.text,mentions:[]}:restoreAssistReferences(value.text,masked.mentions),after=replaceAssistField(node,before,restored.text,restored.mentions);
            setUndo({before,after});
        }catch(reason){if(runId===generation.current)setError(reason instanceof Error?reason.message:String(reason));}
        finally{if(runId===generation.current)setBusy(false);}
    };
    const rollback=()=>{if(!undo)return;try{replaceAssistField(node,undo.after,undo.before.text,undo.before.mentions);setUndo(null);setError("");}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}};
    const label=config.translate?(config.improve?"Translate & improve":"Translate"):"Improve wording";
    return <div className="bv-ui-stack"><div><Button density="compact" disabled={busy||(text!==undefined&&!text.trim())||!config.profile_id||!config.model.trim()||(!config.translate&&!config.improve)||(config.translate&&!config.language.trim())} onClick={run}>{busy?"Working…":`✦ ${label}${config.translate?` · ${config.language}`:""}`}</Button>{undo&&<Button density="compact" intent="ghost" disabled={busy} onClick={rollback}>Undo</Button>}</div>{error&&<small role="alert">{error}</small>}</div>;
}
