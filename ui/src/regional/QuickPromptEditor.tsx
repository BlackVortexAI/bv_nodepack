import React, { useEffect, useMemo, useRef, useState } from "react";
import { clone, parseDocument, PromptPair, RegionalDocument } from "./model";
import { clampQuickPromptGeometry, loadEditorState, saveEditorState, type WindowGeometry } from "./editorState";
import PromptTextarea from "../completion/PromptTextarea";
import { emptyLoraBindings, NamedLoraStack, parseLoraBindings, reconcileLoraBindings, RegionalLoraBindings } from "./loraBindings";
import { Badge, Button, BvManagedWindow, BvMinimizedWindow, BvWindowNavigator, Callout, FieldFrame, getWindowSwitchMode, rememberBvWindowInstance, SelectField } from "../ui";

export type RegionalNodeRef = {
    id: number | string;
    title?: string;
    widgets?: Array<{ name: string; value: unknown; callback?: (value: unknown) => void }>;
    graph?: { setDirtyCanvas?: (foreground: boolean, background: boolean) => void };
};

type Props = {
    open: boolean;
    activationToken?:number;
    nodes: RegionalNodeRef[];
    initialNode: RegionalNodeRef | null;
    loraStacks: NamedLoraStack[];
    onClose: () => void;
    onOpenEditor: (node: RegionalNodeRef) => void;
};

const widgetFor = (node: RegionalNodeRef | null) => node?.widgets?.find(widget => widget.name === "regional_json");
const bindingsWidgetFor = (node: RegionalNodeRef | null) => node?.widgets?.find(widget => widget.name === "lora_bindings_json");
const targetExists = (document: RegionalDocument, target: string) => target === "global" || target === "background" || document.regions.some(region => region.id === target);
const promptsFor = (document: RegionalDocument, target: string): PromptPair => target === "global"
    ? document.prompts.global
    : target === "background"
        ? document.prompts.background
        : document.regions.find(region => region.id === target)?.prompts ?? document.prompts.global;

export default function QuickPromptEditor({ open, activationToken=0, nodes, initialNode, loraStacks, onClose, onOpenEditor }: Props) {
    const [node, setNode] = useState<RegionalNodeRef | null>(initialNode);
    const [documentValue, setDocumentValue] = useState<RegionalDocument | null>(null);
    const [loraBindings, setLoraBindings] = useState<RegionalLoraBindings>(() => emptyLoraBindings(""));
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
        const requested=initialNode??nodes[0]??null,currentId=String(node?.id??""),requestedId=String(requested?.id??"");
        if(wasOpen&&currentId&&requestedId!==currentId&&getWindowSwitchMode()==="keep")setKeptNodeIds(ids=>[...new Set([...ids,currentId])].filter(id=>id!==requestedId));
        else if(requestedId)setKeptNodeIds(ids=>ids.filter(id=>id!==requestedId));
        transferredGeometry.current=wasOpen?geometry:null;
        setNode(requested);
    }, [activationToken,initialNode,nodes,open]);

    useEffect(() => {
        if (!node) return;
        try {
            const next = parseDocument(widgetFor(node)?.value);
            const parsedBindings = parseLoraBindings(bindingsWidgetFor(node)?.value, next.document_id);
            const nextBindings = reconcileLoraBindings(parsedBindings, new Set(next.regions.map(region => region.id)));
            const bindingsWidget = bindingsWidgetFor(node);
            if (bindingsWidget && JSON.stringify(parsedBindings) !== JSON.stringify(nextBindings)) {
                bindingsWidget.value = JSON.stringify(nextBindings);
                bindingsWidget.callback?.(bindingsWidget.value);
                node.graph?.setDirtyCanvas?.(true, true);
            }
            const stored = loadEditorState(next.document_id);
            const nextTarget = targetExists(next, stored.quickPromptTarget) ? stored.quickPromptTarget : "global";
            setDocumentValue(next);
            setLoraBindings(nextBindings);
            setTarget(nextTarget);
            setGeometry(transferredGeometry.current??stored.quickPromptWindow);transferredGeometry.current=null;
            setError("");
        } catch (reason) {
            setDocumentValue(null);
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    }, [node, open]);

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
    const navigateNode=(nextId:string,replaceCurrent:boolean,transferWindow=true)=>{const currentId=String(node?.id??"");rememberBvWindowInstance("quick",nextId);if(nextId===currentId)return;setKeptNodeIds(ids=>replaceCurrent?ids.filter(id=>id!==nextId):[...new Set([...ids,currentId])].filter(id=>id&&id!==nextId));transferredGeometry.current=transferWindow?geometry:null;setNode(nodes.find(item=>String(item.id)===nextId)??null)};

    return <>{keptNodeIds.map(id=>{const kept=nodes.find(item=>String(item.id)===id);return kept?<BvMinimizedWindow key={id} title={`Quick Edit · ${kept.title||"BV Regional Prompt"} · #${id}`} onRestore={()=>navigateNode(id,false,false)} onClose={()=>setKeptNodeIds(ids=>ids.filter(value=>value!==id))}/>:null})}<BvManagedWindow open={open} activationToken={activationToken} title="Regional Quick Edit" context={<BvWindowNavigator label="Regional Prompt Node" value={String(node?.id??"")} options={nodes.map(item=>({value:String(item.id),label:`${item.title||"BV Regional Prompt"} · #${item.id}`}))} onNavigate={navigateNode}/>} allowWorkspace={false} initialGeometry={geometry} minSize={{width:360,height:320}} className="bv-quick-prompt-window bv-density-compact" onClose={onClose} onGeometry={nextGeometry=>{const next=clampQuickPromptGeometry(nextGeometry,{width:window.innerWidth,height:window.innerHeight});setGeometry(next);persistGeometry(next)}} status={<Badge tone="success" dot>Autosaved</Badge>} actions={<Button intent="primary" disabled={!node||!documentValue} onClick={() => node && onOpenEditor(node)}>Open Full Editor</Button>}>
        <div className="bv-quick-prompt-body">
            {error ? <Callout tone="danger" title="Prompt document unavailable">{error}</Callout> : documentValue && prompts && <>
                <SelectField label="Prompt Target" value={target} onValue={selectTarget} options={[{value:"global",label:"Global"},{value:"background",label:"Background"},...documentValue.regions.map(region=>({value:region.id,label:region.name}))]}/>
                <SelectField label={target === "global" || target === "background" ? "Global LoRA Stack" : "Additional LoRA Stack"} help={target === "global" || target === "background" ? "Applied globally and inherited by every region." : "Added to the global stack for this region."} value={selectedStack} onValue={value=>updateLoraStack(value||null)} options={[{value:"",label:"None"},...loraStacks.map(stack=>({value:stack.id,label:stack.name}))]}/>
                <div className="bv-prompt-editor-fields">
                    <FieldFrame label="Positive"><PromptTextarea autoFocus value={prompts.positive_source} onValue={positive_source => updatePrompts({ ...prompts, positive_source })} completionContext={{ scope: target === "global" || target === "background" ? target : "region", polarity: "positive" }}/></FieldFrame>
                    <FieldFrame label="Negative"><PromptTextarea value={prompts.negative_source} onValue={negative_source => updatePrompts({ ...prompts, negative_source })} completionContext={{ scope: target === "global" || target === "background" ? target : "region", polarity: "negative" }}/></FieldFrame>
                </div>
            </>}
        </div>
    </BvManagedWindow></>;
}
