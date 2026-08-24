export function compactNodeToComputedHeight(node:any,minWidth=220,minHeight=60){
    if(!node?.setSize)return;
    const width=Math.max(Number(node.size?.[0]??0),minWidth);
    node.setSize([width,minHeight]);
    const computed=node.computeSize?.()??node.size??[minWidth,minHeight];
    node.setSize([Math.max(width,Number(computed[0]??0),minWidth),Math.max(minHeight,Number(computed[1]??minHeight))]);
}
