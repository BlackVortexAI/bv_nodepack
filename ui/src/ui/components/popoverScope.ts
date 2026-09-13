/** Logical ownership survives DOM portals; unrelated popovers stay independent. */
export class PopoverScope {
    private panels = new Set<EventTarget>();
    constructor(private parent:PopoverScope|null=null){}
    register(panel:EventTarget){
        const scopes:PopoverScope[]=[];
        for(let scope:PopoverScope|null=this;scope;scope=scope.parent){scope.panels.add(panel);scopes.push(scope);}
        return ()=>{for(const scope of scopes)scope.panels.delete(panel);};
    }
    contains(path:EventTarget[]){return path.some(target=>this.panels.has(target));}
}
