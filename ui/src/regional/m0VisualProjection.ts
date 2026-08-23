type M0Slot = { __bvM0VisualHidden?: boolean; link?: unknown };
type M0Node = { id?: string|number; inputs?: M0Slot[]; outputs?: M0Slot[] };

function node2Element(node:M0Node) {
    if (typeof document === "undefined" || node.id == null) return null;
    return document.querySelector(`.lg-node[data-node-id="${CSS.escape(String(node.id))}"]`);
}

function hiddenLink(canvas:any,link:any) {
    if (!link) return false;
    const origin=canvas.graph?.getNodeById?.(link.origin_id) as M0Node|undefined;
    const target=canvas.graph?.getNodeById?.(link.target_id) as M0Node|undefined;
    return Boolean(origin?.outputs?.[link.origin_slot]?.__bvM0VisualHidden||target?.inputs?.[link.target_slot]?.__bvM0VisualHidden);
}

export function installM0CanvasVisibility(canvas: any) {
    if (!canvas || canvas.__bvM0VisibilityInstalled) return;
    canvas.__bvM0VisibilityInstalled = true;
    const drawNode = canvas.drawNode;
    const renderLink = canvas.renderLink;
    canvas.renderLink = function (...args:any[]) {
        if (hiddenLink(this,args[3])) return;
        return renderLink.apply(this,args);
    };
    canvas.drawNode = function (node:M0Node,ctx:CanvasRenderingContext2D) {
        // Nodes 2.0 observes these arrays as workflow state. Its DOM projection is
        // hidden with CSS; never replace canonical graph arrays just to draw it.
        if(node2Element(node))return drawNode.call(this,node,ctx);
        const inputs=node.inputs,outputs=node.outputs;
        if(inputs?.some(slot=>slot.__bvM0VisualHidden))node.inputs=inputs.filter(slot=>!slot.__bvM0VisualHidden);
        if(outputs?.some(slot=>slot.__bvM0VisualHidden))node.outputs=outputs.filter(slot=>!slot.__bvM0VisualHidden);
        try { return drawNode.call(this,node,ctx); }
        finally { if(inputs)node.inputs=inputs;if(outputs)node.outputs=outputs; }
    };
}

export function markM0NodeElement(node:any,kind:"collector"|"consumer",debug:boolean) {
    let attempts=0;
    const apply=()=>{
        const id=CSS.escape(String(node.id));
        const element=document.querySelector<HTMLElement>(`.lg-node[data-node-id="${id}"]`);
        if(!element){if(attempts++<40)setTimeout(apply,50);return;}
        element.classList.add(`bv-m0-${kind}`);
        element.classList.toggle("bv-m0-debug",debug);
    };
    apply();
}
