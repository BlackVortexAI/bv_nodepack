export const PROVIDER_TITLEBAR_MIDLINE_Y=-15;
export const PROVIDER_BOUNDARY_ROW_OFFSET=20;

export function providerBoundaryAnchor(firstOrdinaryPosition:any):Readonly<[number,number]>|null{
    if(!Number.isFinite(Number(firstOrdinaryPosition?.[0]))||!Number.isFinite(Number(firstOrdinaryPosition?.[1])))return null;
    return[Number(firstOrdinaryPosition[0]),Number(firstOrdinaryPosition[1])-PROVIDER_BOUNDARY_ROW_OFFSET];
}

export function providerRenderedWidth(node:any):number{
    const collapsed=Boolean(node?.collapsed??node?.flags?.collapsed);
    // Vue measures the visible node into size; its classic collapse cache can
    // survive renderer switches and does not describe the DOM titlebar.
    if((globalThis as any).LiteGraph?.vueNodesMode===true||node?.__bvNodes2PresentationActive===true)return Number(node?.size?.[0]);
    const collapsedWidth=[node?.width,node?._collapsed_width,(globalThis as any).LiteGraph?.NODE_COLLAPSED_WIDTH,80]
        .map(Number).find(value=>Number.isFinite(value)&&value>0);
    return collapsed?collapsedWidth!:Number(node?.size?.[0]);
}

export function providerTitlebarAnchor(node:any,direction:"input"|"output"):Readonly<[number,number]>|null{
    const x=Number(node?.pos?.[0]),y=Number(node?.pos?.[1]),width=providerRenderedWidth(node);
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(width))return null;
    return[x+(direction==="output"?width:0),y+PROVIDER_TITLEBAR_MIDLINE_Y];
}
