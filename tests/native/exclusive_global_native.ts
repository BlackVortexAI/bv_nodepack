/** Detached installed LiteGraph helper, without application workflow state. */
export async function exclusiveNativeRuntime(){
 const vueUrl='/native/assets/vendor-vue-core-BZZQdWHo.js',nativeUrl='/native/assets/settingStore-CwkLtSKP.js';
 const vue:any=await import(/* @vite-ignore */vueUrl);vue.g({render(){return null}}).use(vue.l());
 const values:any[]=Object.values(await import(/* @vite-ignore */nativeUrl));
 const LGraph=values.find(v=>typeof v==='function'&&v.name==='LGraph'),LGraphNode=values.find(v=>typeof v==='function'&&v.name==='LGraphNode'),LiteGraph=values.find(v=>v&&typeof v.registerNodeType==='function'&&typeof v.createNode==='function'),SubgraphNode=values.find(v=>typeof v==='function'&&v.prototype?.isSubgraphNode?.());
 if(!LGraph||!LGraphNode||!LiteGraph||!SubgraphNode)throw Error('Installed native frontend contract unavailable');
 const createGraph=()=>{const graph=new LGraph();graph.events.addEventListener('subgraph-created',(event:any)=>{const sub=event.detail.subgraph;class Bound extends SubgraphNode{constructor(){super(graph,sub,{id:-1,type:sub.id,pos:[0,0],size:[200,100],flags:{},order:0,mode:0})}}LiteGraph.registerNodeType(sub.id,Bound)});return graph};
 return{LGraph,LGraphNode,LiteGraph,SubgraphNode,createGraph};
}
