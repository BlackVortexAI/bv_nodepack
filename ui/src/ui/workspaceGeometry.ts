export type UiRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
export type FloatingWindowGeometry = { x:number; y:number; width:number; height:number };
export type ResizeDirection = "n"|"ne"|"e"|"se"|"s"|"sw"|"w"|"nw";

export function resizeFloatingWindow(start:FloatingWindowGeometry,delta:{x:number;y:number},direction:ResizeDirection,minimum:{width:number;height:number}):FloatingWindowGeometry {
    const right=start.x+start.width,bottom=start.y+start.height;
    let x=start.x,y=start.y,width=start.width,height=start.height;
    if(direction.includes("e"))width=Math.max(minimum.width,start.width+delta.x);
    if(direction.includes("s"))height=Math.max(minimum.height,start.height+delta.y);
    if(direction.includes("w")){width=Math.max(minimum.width,start.width-delta.x);x=right-width;}
    if(direction.includes("n")){height=Math.max(minimum.height,start.height-delta.y);y=bottom-height;}
    return{x,y,width,height};
}

export function mergeChangedInitialGeometry(current:FloatingWindowGeometry,previous:Partial<FloatingWindowGeometry>|undefined,next:Partial<FloatingWindowGeometry>|undefined):FloatingWindowGeometry {
    const merged={...current};
    for(const key of ["x","y","width","height"] as const)if(next?.[key]!==undefined&&next[key]!==previous?.[key])merged[key]=next[key];
    return merged;
}

export function windowShelfPosition(canvas: UiRect | null, overlays: UiRect[], viewport: { width: number; height: number }, gap = 12, diagnosticWidth = 128) {
    const surface = canvas ?? { left: 0, top: 0, right: viewport.width, bottom: viewport.height, width: viewport.width, height: viewport.height };
    const candidates = overlays
        .filter(rect => rect.width > 0 && rect.height >= surface.height * .45 && rect.right < surface.right - 80)
        .sort((left, right) => left.left - right.left || right.right - left.right);
    const leftEdge = candidates.reduce((occupiedRight, rect) => rect.left <= occupiedRight + 4 ? Math.max(occupiedRight, rect.right) : occupiedRight, surface.left);
    return {
        left: Math.round(Math.max(surface.left + diagnosticWidth, leftEdge) + gap),
        bottom: Math.round(Math.max(gap, viewport.height - surface.bottom + gap)),
    };
}
