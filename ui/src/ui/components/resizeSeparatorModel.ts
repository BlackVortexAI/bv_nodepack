export type PaneClamp = {containerWidth:number;leadingWidth:number;contentMinWidth:number;separatorWidth:number;min:number;max:number};

export function clampPaneWidth(value:number,limits:PaneClamp){
  const available=Math.max(limits.min,limits.containerWidth-limits.leadingWidth-limits.contentMinWidth-limits.separatorWidth);
  const maximum=Math.max(limits.min,Math.min(limits.max,available));
  return Math.max(limits.min,Math.min(Number.isFinite(value)?value:limits.min,maximum));
}

export function resizePaneFromPointer(startValue:number,startX:number,currentX:number,min:number,max:number){
  return Math.max(min,Math.min(max,startValue-(currentX-startX)));
}
