/** Display-only geometry. World dimensions and authoring coordinates never change. */
export type ImageViewport={x:number;y:number;width:number;height:number;left:number;top:number;cssWidth:number;cssHeight:number};
export function visibleImageViewport(width:number,height:number,zoom:number,left:number,top:number,viewportWidth:number,viewportHeight:number):ImageViewport{
    const x=Math.min(width,Math.max(0,-left/zoom)),y=Math.min(height,Math.max(0,-top/zoom));
    const right=Math.max(x,Math.min(width,(viewportWidth-left)/zoom)),bottom=Math.max(y,Math.min(height,(viewportHeight-top)/zoom));
    return {x,y,width:right-x,height:bottom-y,left:x*zoom,top:y*zoom,cssWidth:(right-x)*zoom,cssHeight:(bottom-y)*zoom};
}
export function displayBitmapSize(width:number,height:number,dpr:number,maxPixels=8_000_000,maxSide=4096){
    if(width<=0||height<=0)return {width:0,height:0};
    const ratio=Math.min(Math.max(1,dpr||1),maxSide/width,maxSide/height,Math.sqrt(maxPixels/(width*height)));
    return {width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio))};
}
/** Matches CSS background-size:cover and its existing top-left positioning. */
export function coverSourceRect(imageWidth:number,imageHeight:number,worldWidth:number,worldHeight:number,view:ImageViewport){
    const scale=Math.max(worldWidth/imageWidth,worldHeight/imageHeight);
    return {x:view.x/scale,y:view.y/scale,width:view.width/scale,height:view.height/scale};
}
export function paddedViewport(view:ImageViewport,width:number,height:number,padding:number){
    const x=Math.max(0,view.x-padding),y=Math.max(0,view.y-padding);
    return {x,y,width:Math.max(0,Math.min(width,view.x+view.width+padding)-x),height:Math.max(0,Math.min(height,view.y+view.height+padding)-y)};
}
