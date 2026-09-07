import {memo,useEffect,useRef,useState} from "react";
import {coverSourceRect,displayBitmapSize,type ImageViewport} from "./viewportImage";

/** Cached decoded source; only the visible crop gets a DPR-bounded paint buffer. */
export const AdaptiveImageCanvas=memo(function AdaptiveImageCanvas({src,width,height,view,opacity=1}:{src:string;width:number;height:number;view:ImageViewport;opacity?:number}){
    const canvas=useRef<HTMLCanvasElement>(null);
    const [loaded,setLoaded]=useState<{src:string;image:HTMLImageElement}|null>(null),[dpr,setDpr]=useState(()=>window.devicePixelRatio||1);
    useEffect(()=>{
        let active=true;const image=new Image();image.decoding="async";
        image.onload=()=>{if(active)setLoaded({src,image})};
        image.onerror=()=>{if(active)setLoaded(null)};image.src=src;
        return()=>{active=false;image.onload=null;image.onerror=null};
    },[src]);
    useEffect(()=>{
        const changed=()=>setDpr(window.devicePixelRatio||1),query=window.matchMedia?.(`(resolution: ${dpr}dppx)`);
        window.addEventListener("resize",changed);query?.addEventListener("change",changed);
        return()=>{window.removeEventListener("resize",changed);query?.removeEventListener("change",changed)};
    },[dpr]);
    useEffect(()=>{
        const element=canvas.current;if(!element)return;
        const size=displayBitmapSize(view.cssWidth,view.cssHeight,dpr);
        // Clear obsolete sources, but retain the last frame until a zoom repaint is ready.
        if(!loaded||loaded.src!==src||!size.width||!size.height){element.width=size.width;element.height=size.height;return;}
        const frame=requestAnimationFrame(()=>{
            element.width=size.width;element.height=size.height;
            const context=element.getContext("2d");if(!context)return;
            const source=coverSourceRect(loaded.image.naturalWidth,loaded.image.naturalHeight,width,height,view);
            context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";
            context.drawImage(loaded.image,source.x,source.y,source.width,source.height,0,0,size.width,size.height);
            context.fillStyle="#0002";context.fillRect(0,0,size.width,size.height);
        });
        return()=>cancelAnimationFrame(frame);
    },[src,loaded,width,height,view,dpr]);
    return <canvas ref={canvas} aria-hidden="true" style={{position:"absolute",pointerEvents:"none",left:view.left,top:view.top,width:view.cssWidth,height:view.cssHeight,opacity}}/>;
});
