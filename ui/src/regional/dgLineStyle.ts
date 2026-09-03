/** Shared debug style for native provider links and non-interactive projections. */
export function withDgLineStyle<T>(canvas:any,ctx:CanvasRenderingContext2D,draw:(time:number)=>T):T{
    ctx.save();
    try{
        const exportTime=Number(canvas.__bvExportTimeSeconds);
        const time=Number.isFinite(exportTime)?exportTime:(typeof performance==="undefined"?0:performance.now()/1000);
        ctx.setLineDash([7,5]);
        const offset=-(time*1000/45%12);
        ctx.lineDashOffset=Object.is(offset,-0)?0:offset;
        return draw(time);
    }finally{ctx.restore()}
}
