import React, { useEffect, useMemo, useRef, useState } from "react";
import { clone, parseDocument, PromptPair, RegionalDocument } from "./model";
import { clampQuickPromptGeometry, loadEditorState, saveEditorState, type WindowGeometry } from "./editorState";
import PromptTextarea from "../completion/PromptTextarea";
import { emptyLoraBindings, NamedLoraStack, parseLoraBindings, reconcileLoraBindings, RegionalLoraBindings } from "./loraBindings";
import { Badge, Button, bvWindowActivity, BvManagedWindow, BvMinimizedWindow, BvWindowNavigator, Callout, FieldFrame, getWindowSwitchMode, SelectField } from "../ui";
import { scopedNodeKey, setWindowMenuVisible, useWindowMenuVisibility, windowMenuVisible } from "../ui/windowRegistry";
import { getApp } from "../appHelper";
import { OptionalLoraV3ScopePicker, type LoraV3Config } from "./LoraV3ResourcePickerPanel";
import { readNodeLoraV3Config } from "./loraV3Ui";
import { hasRegionalLoraV3, quickLoraV3Target, regionalLoraScopeViewProps } from "./regionalLoraScopeActions";
import { LORA_V3_INVENTORY_CHANGED_EVENT } from "./loraV3Inventory";

export type RegionalNodeRef = {
    id: number | string;
    title?: string;
    widgets?: Array<{ name: string; value: unknown; callback?: (value: unknown) => void }>;
    graph?: { setDirtyCanvas?: (foreground: boolean, background: boolean) => void };
};
const keyFor=(node:RegionalNodeRef|null|undefined)=>scopedNodeKey((getApp() as any).rootGraph??(getApp() as any).graph,node);

type Props = {
    open: boolean;
    activationToken?:number;
    activityScope:object;
    nodes: RegionalNodeRef[];
    initialNode: RegionalNodeRef | null;
    loraStacks: NamedLoraStack[];
    onClose: () => void;
    onOpenEditor: (node: RegionalNodeRef) => void;
};

const widgetFor = (node: RegionalNodeRef | null) => node?.widgets?.find(widget => widget.name === "regional_json");
const bindingsWidgetFor = (node: RegionalNodeRef | null) => node?.widgets?.find(widget => widget.name === "lora_bindings_json");
export function loadQuickLoraState(node:RegionalNodeRef,document:Pick<RegionalDocument,"document_id"|"regions">){
    const usesV3=hasRegionalLoraV3(node);
    if(usesV3)return{usesV3,bindings:emptyLoraBindings(document.document_id)};
    const parsedBindings=parseLoraBindings(bindingsWidgetFor(node)?.value,document.document_id),bindings=reconcileLoraBindings(parsedBindings,new Set(document.regions.map(region=>region.id))),bindingsWidget=bindingsWidgetFor(node);
    if(bindingsWidget&&JSON.stringify(parsedBindings)!==JSON.stringify(bindings)){
        bindingsWidget.value=JSON.stringify(bindings);
        bindingsWidget.callback?.(bindingsWidget.value);
        node.graph?.setDirtyCanvas?.(true,true);
    }
    return{usesV3,bindings};
}
const targetExists = (document: RegionalDocument, target: string) => target === "global" || target === "background" || document.regions.some(region => region.id === target);
const promptsFor = (document: RegionalDocument, target: string): PromptPair => target === "global"
    ? document.prompts.global
    : target === "background"
        ? document.prompts.background
        : document.regions.find(region => region.id === target)?.prompts ?? document.prompts.global;

export default function QuickPromptEditor({ open, activationToken=0, activityScope, nodes, initialNode, loraStacks, onClose, onOpenEditor }: Props) {
    const [node, setNode] = useState<RegionalNodeRef | null>(initialNode);
    const [documentValue, setDocumentValue] = useState<RegionalDocument | null>(null);
    const [loraBindings, setLoraBindings] = useState<RegionalLoraBindings>(() => emptyLoraBindings(""));
    const [loraV3Config,setLoraV3Config]=useState<LoraV3Config>(()=>readNodeLoraV3Config(initialNode));
    const [target, setTarget] = useState("global");
    const [geometry, setGeometry] = useState<WindowGeometry>(()=>clampQuickPromptGeometry({x:window.innerWidth-544,y:84,width:520,height:640},{width:window.innerWidth,height:window.innerHeight}));
    const [error, setError] = useState("");
    const [keptNodeIds, setKeptNodeIds] = useState<string[]>([]);
    const transferredGeometry=useRef<WindowGeometry|null>(null);
    const previousOpen=useRef(false),previousActivation=useRef(activationToken);

    useEffect(() => {
        const wasOpen=previousOpen.current,activated=previousActivation.current!==activationToken;
        previousOpen.current=open;previousActivation.current=activationToken;
        if(!open||!activated)return;
        const requested=initialNode??nodes[0]??null,currentId=keyFor(node),requestedId=keyFor(requested);
        if(wasOpen&&currentId&&requestedId!==currentId&&getWindowSwitchMode()==="keep")setKeptNodeIds(ids=>[...new Set([...ids,currentId])].filter(id=>id!==requestedId));
        else if(requestedId)setKeptNodeIds(ids=>ids.filter(id=>id!==requestedId));
        transferredGeometry.current=wasOpen?geometry:null;
        setNode(requested);
    }, [activationToken,initialNode,nodes,open]);

    useEffect(()=>{
        if(!open||!node||!hasRegionalLoraV3(node))return;
        const refresh=()=>setLoraV3Config(readNodeLoraV3Config(node));
        refresh();
        window.addEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,refresh);
        return()=>window.removeEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,refresh);
    },[node,open,activationToken]);

    useEffect(() => {
        if (!node) return;
        try {
            const next = parseDocument(widgetFor(node)?.value);
            const loraState=loadQuickLoraState(node,next);
            const stored = loadEditorState(next.document_id);
            const nextTarget = targetExists(next, stored.quickPromptTarget) ? stored.quickPromptTarget : "global";
            setDocumentValue(next);
            setLoraBindings(loraState.bindings);
            if(loraState.usesV3)setLoraV3Config(readNodeLoraV3Config(node));
            setTarget(nextTarget);
            setGeometry(transferredGeometry.current??stored.quickPromptWindow);transferredGeometry.current=null;
            setError("");
        } catch (reason) {
            setDocumentValue(null);
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    }, [node, open, activationToken]);

    const prompts = useMemo(() => documentValue ? promptsFor(documentValue, target) : null, [documentValue, target]);
    const selectTarget = (nextTarget: string) => {
        setTarget(nextTarget);
        if (!documentValue) return;
        const state = loadEditorState(documentValue.document_id);
        saveEditorState(documentValue.document_id, { ...state, quickPromptTarget: nextTarget });
    };
    const persistGeometry = (nextGeometry: WindowGeometry) => {
        if (!documentValue) return;
        const state = loadEditorState(documentValue.document_id);
        saveEditorState(documentValue.document_id, { ...state, quickPromptWindow: nextGeometry });
    };
    const updatePrompts = (nextPrompts: PromptPair) => {
        if (!documentValue || !node) return;
        const next = clone(documentValue);
        if (target === "global") next.prompts.global = nextPrompts;
        else if (target === "background") next.prompts.background = nextPrompts;
        else {
            const region = next.regions.find(item => item.id === target);
            if (!region) return;
            region.prompts = nextPrompts;
        }
        setDocumentValue(next);
        const widget = widgetFor(node);
        if (widget) {
            widget.value = JSON.stringify(next);
            widget.callback?.(widget.value);
        }
        node.graph?.setDirtyCanvas?.(true, true);
    };
    const updateLoraStack = (stackId: string | null) => {
        if (!documentValue || !node) return;
        let next: RegionalLoraBindings;
        if (target === "global" || target === "background") next = { ...loraBindings, global_stack_id: stackId };
        else {
            const regions = { ...loraBindings.regions };
            if (stackId) regions[target] = stackId; else delete regions[target];
            next = { ...loraBindings, regions };
        }
        setLoraBindings(next);
        const widget = bindingsWidgetFor(node);
        if (widget) { widget.value = JSON.stringify(next); widget.callback?.(widget.value); }
        node.graph?.setDirtyCanvas?.(true, true);
    };
    const selectedStack = target === "global" || target === "background" ? loraBindings.global_stack_id ?? "" : loraBindings.regions[target] ?? "";
    const usesLoraV3=hasRegionalLoraV3(node),loraV3Target=documentValue?quickLoraV3Target(documentValue.document_id,target):null;
    const loraV3ScopeProps=regionalLoraScopeViewProps(node,loraV3Config,setLoraV3Config);
    const navigateNode=(nextId:string,replaceCurrent:boolean,transferWindow=true)=>{const currentId=keyFor(node);bvWindowActivity(activityScope).remember("quick",nextId);if(nextId===currentId)return;setKeptNodeIds(ids=>replaceCurrent?ids.filter(id=>id!==nextId):[...new Set([...ids,currentId])].filter(id=>id&&id!==nextId));transferredGeometry.current=transferWindow?geometry:null;setNode(nodes.find(item=>keyFor(item)===nextId)??null)};

    const menuVisible=useWindowMenuVisibility(node);
    return <>{keptNodeIds.map(id=>{const kept=nodes.find(item=>keyFor(item)===id);return kept?<BvMinimizedWindow key={id} title={`Quick Edit · ${kept.title||"BV Regional Prompt"} · #${kept.id}`} onRestore={()=>navigateNode(id,false,false)} onClose={()=>setKeptNodeIds(ids=>ids.filter(value=>value!==id))}/>:null})}<BvManagedWindow open={open} activationToken={activationToken} title="Regional Quick Edit" menuVisible={menuVisible} onMenuVisible={visible=>setWindowMenuVisible(node,visible)} context={<BvWindowNavigator label="Regional Prompt Node" value={keyFor(node)} options={nodes.filter(item=>windowMenuVisible(item)).map(item=>({value:keyFor(item),label:`${item.title||"BV Regional Prompt"} · #${item.id}`}))} onNavigate={navigateNode}/>} allowWorkspace={false} initialGeometry={geometry} minSize={{width:360,height:320}} className="bv-quick-prompt-window bv-density-compact" onClose={onClose} onGeometry={nextGeometry=>{const next=clampQuickPromptGeometry(nextGeometry,{width:window.innerWidth,height:window.innerHeight});setGeometry(next);persistGeometry(next)}} status={<Badge tone="success" dot>Autosaved</Badge>} actions={<Button intent="primary" disabled={!node||!documentValue} onClick={() => node && onOpenEditor(node)}>Open Full Editor</Button>}>
        <div className="bv-quick-prompt-body">
            {error ? <Callout tone="danger" title="Prompt document unavailable">{error}</Callout> : documentValue && prompts && <>
                <SelectField label="Prompt Target" value={target} onValue={selectTarget} options={[{value:"global",label:"Global"},{value:"background",label:"Background (Outside Regions)"},...documentValue.regions.map(region=>({value:region.id,label:region.name}))]}/>
                {usesLoraV3&&loraV3Target?<OptionalLoraV3ScopePicker {...loraV3ScopeProps} target={loraV3Target}/>:<SelectField label={target === "global" || target === "background" ? "Global LoRA Stack" : "Additional LoRA Stack"} help={target === "global" || target === "background" ? "Applied globally and inherited by every region." : "Added to the global stack for this region."} value={selectedStack} onValue={value=>updateLoraStack(value||null)} options={[{value:"",label:"None"},...loraStacks.map(stack=>({value:stack.id,label:stack.name}))]}/>}
                <div className="bv-prompt-editor-fields">
                    <FieldFrame label="Positive"><PromptTextarea autoFocus value={prompts.positive_source} onValue={positive_source => updatePrompts({ ...prompts, positive_source })} completionContext={{ scope: target === "global" || target === "background" ? target : "region", polarity: "positive" }}/></FieldFrame>
                    <FieldFrame label="Negative"><PromptTextarea value={prompts.negative_source} onValue={negative_source => updatePrompts({ ...prompts, negative_source })} completionContext={{ scope: target === "global" || target === "background" ? target : "region", polarity: "negative" }}/></FieldFrame>
                </div>
            </>}
        </div>
    </BvManagedWindow></>;
}
