export type BvWindowType = "regional" | "quick" | "lora" | "detailer" | "detector" | "pipe" | "merge";

type BvWindowActivityState={lastActive:Map<BvWindowType,string>;lastFull?:BvWindowType};
const states=new WeakMap<object,BvWindowActivityState>();

const stateFor=(scope:object)=>{
    let state=states.get(scope);
    if(!state){state={lastActive:new Map()};states.set(scope,state);}
    return state;
};

/** Workflow-owned editor activity. The concrete root graph object is the scope. */
export function bvWindowActivity(scope:object){
    const state=stateFor(scope);
    return {
        remember(type:BvWindowType,nodeId:string|number){
            const id=String(nodeId);
            if(!id)return;
            state.lastActive.set(type,id);
            if(type!=="quick")state.lastFull=type;
        },
        lastFullType(){return state.lastFull;},
        lastInstance(type:BvWindowType){return state.lastActive.get(type);},
    };
}
