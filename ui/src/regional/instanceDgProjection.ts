import { legacyDebugVisible } from "./legacyPorts";
import { providerBoundaryAnchor, providerTitlebarAnchor } from "./providerProjectionGeometry";
import { withDgLineStyle } from "./dgLineStyle";

type Host={id:string;node:any;graph:any};
export type InstanceDgBinding={node:any;hosts:Host[]};
type Edge=Readonly<{source:string;target:string}>;
type Endpoint={node:any;direction:"input"|"output";boundary?:boolean};
export type InstanceDgSegment={path:string[];graph:any;from:Endpoint;to:Endpoint};

/** Instances, not graph definitions, determine the least common ancestor. */
export function instanceDgSegments(root:any,edges:readonly Edge[],bindings:Map<string,InstanceDgBinding>):InstanceDgSegment[]{
    const result:InstanceDgSegment[]=[];
    for(const edge of edges){
        const a=bindings.get(edge.source),b=bindings.get(edge.target);if(!a||!b)continue;
        let common=0;while(common<a.hosts.length&&common<b.hosts.length&&a.hosts[common].id===b.hosts[common].id)common++;
        let from:Endpoint={node:a.node,direction:"output"};
        for(let i=a.hosts.length;i>common;i--){
            const graph=a.hosts[i-1].graph;
            result.push({path:a.hosts.slice(0,i).map(h=>h.id),graph,from,to:{node:graph?.outputNode,direction:"output",boundary:true}});
            from={node:a.hosts[i-1].node,direction:"output"};
        }
        result.push({path:b.hosts.slice(0,common).map(h=>h.id),graph:common?b.hosts[common-1].graph:root,from,to:{node:common<b.hosts.length?b.hosts[common].node:b.node,direction:"input"}});
        for(let i=common;i<b.hosts.length;i++){
            const graph=b.hosts[i].graph;
            result.push({path:b.hosts.slice(0,i+1).map(h=>h.id),graph,from:{node:graph?.inputNode,direction:"input",boundary:true},to:{node:i+1<b.hosts.length?b.hosts[i+1].node:b.node,direction:"input"}});
        }
    }
    return result;
}

export function instanceDgAnchor(endpoint:Endpoint){
    if(!endpoint.boundary)return providerTitlebarAnchor(endpoint.node,endpoint.direction);
    const node=endpoint.node;
    const slots=node?.allSlots??node?.slots??[];
    const first=slots.find((entry:any)=>{
        const slot=entry?.slot??entry;
        return !slot?.__bvDgAnchor&&!slot?.__bvM0ResourceSlot&&!String(slot?.type??"").startsWith("BV_RUNTIME_RESOURCE_PROVIDER");
    });
    return providerBoundaryAnchor((first?.slot??first)?.pos??node?.emptySlot?.pos);
}

type State={root:any;segments:InstanceDgSegment[];activePath:()=>string[]|null};
const states=new WeakMap<object,State>();
const installed=new WeakSet<object>();
const samePath=(a:string[],b:string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);

export function tickInstanceDgProjection(canvas:any){
    if(!canvas)return;
    const state=states.get(canvas);
    if(state&&legacyDebugVisible()&&state.segments.some(segment=>segment.graph===canvas.graph))canvas.setDirty?.(true,false);
}

export function clearInstanceDgProjection(canvas:any){if(canvas){states.delete(canvas);canvas.setDirty?.(true,true)}}

export function publishInstanceDgProjection(canvas:any,root:any,edges:readonly Edge[],bindings:Map<string,InstanceDgBinding>,activePath:()=>string[]|null){
    if(!canvas)return;
    states.set(canvas,{root,segments:instanceDgSegments(root,edges,bindings),activePath});
    if(!installed.has(canvas)){
        installed.add(canvas);
        const original=canvas.onDrawForeground;
        canvas.onDrawForeground=function(ctx:CanvasRenderingContext2D,...args:any[]){
            const result=original?.call(this,ctx,...args);
            const state=states.get(this);
            if(!state||!legacyDebugVisible()||(this.graph?.rootGraph??this.graph)!==state.root)return result;
            const path=this.graph===state.root?[]:state.activePath();if(!path)return result;
            for(const segment of state.segments){
                if(segment.graph!==this.graph||!samePath(segment.path,path))continue;
                const a=instanceDgAnchor(segment.from),b=instanceDgAnchor(segment.to);if(!a||!b)continue;
                withDgLineStyle(this,ctx,time=>{
                    const bend=Math.max(40,Math.abs(b[0]-a[0])*.5);
                    ctx.strokeStyle="#9eaf9c";ctx.fillStyle="#9eaf9c";ctx.lineWidth=2;
                    ctx.beginPath();ctx.moveTo(...a);ctx.bezierCurveTo(a[0]+bend,a[1],b[0]-bend,b[1],...b);ctx.stroke();
                    ctx.setLineDash([]);
                    for(let i=0;i<5;i++){
                        const t=(i/5+time*.15)%1,u=1-t;
                        const x=u*u*u*a[0]+3*u*u*t*(a[0]+bend)+3*u*t*t*(b[0]-bend)+t*t*t*b[0];
                        const y=u*u*u*a[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t*t*t*b[1];
                        ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
                    }
                });
            }
            return result;
        };
    }
    canvas.setDirty?.(true,true);
}
