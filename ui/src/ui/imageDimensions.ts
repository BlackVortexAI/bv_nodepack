export type ImageDimensions={width:number;height:number};
/** Cancelable image metadata read, reusable by any BV view. */
export function observeImageDimensions(src:string,onValue:(value:ImageDimensions|null)=>void,createImage=()=>new Image()){
 let active=true;const image=createImage();
 image.onload=()=>{if(active)onValue(image.naturalWidth>0&&image.naturalHeight>0?{width:image.naturalWidth,height:image.naturalHeight}:null)};
 image.onerror=()=>{if(active)onValue(null)};image.src=src;
 return()=>{active=false;image.onload=null;image.onerror=null};
}
