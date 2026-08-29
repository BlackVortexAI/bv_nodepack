import {bvWindowActivity,type BvWindowType} from "./windowActivity";

export type BvWindowCandidate={
    scope:object;
    type:BvWindowType;
    id:string;
    node:any;
    canOpen:()=>boolean;
    open:()=>boolean|void;
};

type ScopedOpenOptions=BvWindowCandidate&{
    currentScope:()=>object|null|undefined;
    inventory:(scope:object)=>readonly any[];
};

/** Revalidates workflow ownership at the actual callback boundary. */
export function createScopedBvWindowOpen(options:ScopedOpenOptions){
    return ()=>{
        if(options.currentScope()!==options.scope)return false;
        if(!options.inventory(options.scope).some(node=>node===options.node))return false;
        if(!options.canOpen())return false;
        try{
            if(options.open()===false)return false;
            bvWindowActivity(options.scope).remember(options.type,options.id);
            return true;
        }catch{return false;}
    };
}

type OpenLastOptions={
    currentScope:()=>object|null|undefined;
    candidates:(scope:object)=>BvWindowCandidate[];
    inventory:(scope:object)=>readonly any[];
    warn:(message:string)=>void;
    schedule?:(callback:()=>void)=>void;
};

export function createOpenLastBvEditorAction(options:OpenLastOptions){
    const attempt=()=>{
        const scope=options.currentScope();
        if(!scope)return false;
        const activity=bvWindowActivity(scope),lastType=activity.lastFullType(),lastId=lastType&&activity.lastInstance(lastType);
        const candidates=options.candidates(scope);
        const open=(candidate:BvWindowCandidate)=>createScopedBvWindowOpen({...candidate,currentScope:options.currentScope,inventory:options.inventory})();
        const last=lastType&&lastId?candidates.find(candidate=>candidate.type===lastType&&candidate.id===lastId):undefined;
        if(last&&open(last))return true;
        for(const candidate of candidates)if(open(candidate)){
            if(lastType)options.warn("Previous editor unavailable");
            return true;
        }
        return false;
    };
    const onClick=()=>{const opened=attempt();if(!opened)(options.schedule??(callback=>globalThis.setTimeout(callback,180)))(()=>attempt());return opened;};
    return {icon:"icon-[lucide--scan-search]",class:"bv-regional-action bv-regional-action-editor",tooltip:"Open last BV editor",onClick};
}
