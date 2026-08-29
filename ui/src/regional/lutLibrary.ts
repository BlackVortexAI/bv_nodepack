export const LUT_DOWNLOAD_SENTINEL="Download more LUTs…";

export const canonicalLutPath=(value:string):string=>value.trim().replaceAll("\\","/").replace(/\/{2,}/g,"/");
export const isDiskLutChoice=(value:string)=>!value.startsWith("Built-in: ")&&value!==LUT_DOWNLOAD_SENTINEL&&/\.cube$/i.test(value);
export const canonicalLutChoice=(value:string):string=>isDiskLutChoice(value)?canonicalLutPath(value):value;

export function mergeLutChoices(current:readonly string[],installed:readonly string[]):string[]{
    const result:string[]=[],seen=new Set<string>();
    const add=(raw:string)=>{const value=canonicalLutChoice(raw);if(!seen.has(value)){seen.add(value);result.push(value)}};
    const sentinel=current.includes(LUT_DOWNLOAD_SENTINEL);
    current.filter(value=>value!==LUT_DOWNLOAD_SENTINEL).forEach(add);
    installed.filter(isDiskLutChoice).forEach(add);
    if(sentinel)add(LUT_DOWNLOAD_SENTINEL);
    return result;
}

export function createLutLibrary(){
    let snapshot:readonly string[]=Object.freeze([]),listeners=new Set<()=>void>();
    const merge=(values:readonly string[])=>{
        const next=mergeLutChoices(snapshot,values).filter(isDiskLutChoice);
        if(next.length===snapshot.length&&next.every((value,index)=>value===snapshot[index]))return false;
        snapshot=Object.freeze(next);listeners.forEach(listener=>listener());return true;
    };
    return{
        getSnapshot:()=>snapshot,
        subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)},
        seed:(values:readonly string[])=>merge(values),
        publish:(value:string)=>isDiskLutChoice(value)?merge([canonicalLutPath(value)]):false,
    };
}

export const lutLibrary=createLutLibrary();
