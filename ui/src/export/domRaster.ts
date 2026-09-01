import { domToCanvas } from "modern-screenshot";

const setBooleanAttribute=(element:Element,name:string,enabled:boolean)=>enabled?element.setAttribute(name,""):element.removeAttribute(name);
const maskedValue=(value:string)=>"•".repeat(Array.from(value).length);

export const copyLiveDomState=(source:Element,clone:Element)=>{
    const originals=[source,...source.querySelectorAll("*")],copies=[clone,...clone.querySelectorAll("*")];
    if(originals.length!==copies.length)throw new Error("Graph export could not safely match the cloned DOM surface.");
    originals.forEach((item,index)=>{const target=copies[index] as any;if(!target)return;
        if(item instanceof HTMLInputElement){
            if(!(target instanceof HTMLInputElement))throw new Error("Graph export found a mismatched input in the cloned DOM surface.");
            const type=String(item.type??"").toLowerCase(),serializeValue=type!=="file"&&type!=="hidden",value=type==="password"?maskedValue(item.value):serializeValue?item.value:"";
            target.value=value;target.defaultValue=value;
            if(serializeValue)target.setAttribute("value",value);else target.removeAttribute("value");
            target.checked=item.checked;target.defaultChecked=item.checked;target.indeterminate=item.indeterminate;setBooleanAttribute(target,"checked",item.checked);
        }
        else if(item instanceof HTMLTextAreaElement){
            if(!(target instanceof HTMLTextAreaElement))throw new Error("Graph export found a mismatched textarea in the cloned DOM surface.");
            target.value=item.value;target.defaultValue=item.value;target.textContent=item.value;
        }
        else if(item instanceof HTMLSelectElement){
            if(!(target instanceof HTMLSelectElement)||target.options.length!==item.options.length)throw new Error("Graph export found a mismatched select in the cloned DOM surface.");
            for(let optionIndex=0;optionIndex<item.options.length;optionIndex++){
                const selected=item.options[optionIndex].selected,targetOption=target.options[optionIndex];targetOption.selected=selected;targetOption.defaultSelected=selected;setBooleanAttribute(targetOption,"selected",selected);
            }
        }
        else if(item instanceof HTMLCanvasElement){
            if(!(target instanceof HTMLCanvasElement))throw new Error("Graph export found a mismatched canvas in the cloned DOM surface.");
            target.width=item.width;target.height=item.height;target.getContext("2d")?.drawImage(item,0,0);
        }
        if(item instanceof HTMLElement&&target instanceof HTMLElement){target.scrollTop=item.scrollTop;target.scrollLeft=item.scrollLeft}
    });
};

const nextFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));

export async function rasterizeDomElement(source:HTMLElement,width:number,height:number,scale:number,options:{padding?:number;sanitize?:(clone:HTMLElement)=>void}={}){
    const padding=Math.max(0,options.padding??0),host=document.createElement("div"),clone=source.cloneNode(true) as HTMLElement;
    copyLiveDomState(source,clone);options.sanitize?.(clone);
    Object.assign(host.style,{position:"fixed",left:"0",top:"0",width:`${width+padding*2}px`,height:`${height+padding*2}px`,overflow:"visible",pointerEvents:"none",zIndex:"-2147483647",background:"transparent",contain:"strict"});
    Object.assign(clone.style,{position:"absolute",left:`${padding}px`,top:`${padding}px`,width:`${width}px`,height:`${height}px`,margin:"0",transform:"none",transformOrigin:"0 0",zIndex:"auto",contentVisibility:"visible"});
    host.append(clone);document.body.append(host);
    try{
        for(const child of clone.querySelectorAll<HTMLElement>("*"))if(getComputedStyle(child).contentVisibility==="auto")child.style.contentVisibility="visible";
        await document.fonts?.ready;await nextFrame();
        return await domToCanvas(host,{scale,backgroundColor:null,maximumCanvasSize:16384,timeout:30000,filter:node=>!(node instanceof Element)||!node.matches(".bv-context-menu,[data-bv-export-ui],.bv-toast-stack,.bv-completion-popup")});
    }finally{host.remove()}
}
