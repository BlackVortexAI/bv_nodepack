import type{LoraCatalogItem}from"./loraRegistryConfig";

export type LoraBrowserFilters={query:string;directory:string;baseModel:string[];tag:string[];type:string[];category:string[];author:string[]};
export type LoraDirectoryNode={id:string;label:string;count:number;children:LoraDirectoryNode[]};
export type LoraBrowserFacets={baseModels:string[];tags:string[];types:string[];categories:string[];authors:string[]};
export type LoraBrowserModel={items:LoraCatalogItem[];directories:LoraDirectoryNode[];facets:LoraBrowserFacets};

const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:"base"});
const sort=(values:Iterable<string>)=>[...new Set([...values].map(value=>value.trim()).filter(Boolean))].sort(collator.compare);
export const defaultLoraBrowserFilters=():LoraBrowserFilters=>({query:"",directory:"",baseModel:[],tag:[],type:[],category:[],author:[]});

function directoryTree(items:LoraCatalogItem[]):LoraDirectoryNode[]{
    const root:LoraDirectoryNode={id:"",label:"All LoRAs",count:items.length,children:[]},byId=new Map<string,LoraDirectoryNode>([["",root]]);
    for(const item of items){
        const directory=item.directory||item.name.replace(/\\/g,"/").split("/").slice(0,-1).join("/");
        let parent=root,path="";
        for(const part of directory.split("/").filter(Boolean)){
            path=path?`${path}/${part}`:part;
            let node=byId.get(path);
            if(!node){node={id:path,label:part,count:0,children:[]};byId.set(path,node);parent.children.push(node)}
            node.count++;parent=node;
        }
    }
    const order=(node:LoraDirectoryNode)=>{node.children.sort((left,right)=>collator.compare(left.label,right.label));node.children.forEach(order)};order(root);
    return[root,...root.children];
}

export function buildLoraBrowserModel(items:LoraCatalogItem[],filters:LoraBrowserFilters):LoraBrowserModel{
    const words=filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const visible=items.filter(item=>{
        const directory=item.directory||item.name.replace(/\\/g,"/").split("/").slice(0,-1).join("/");
        const text=[item.display_name,item.name,item.base_model,item.author,item.type,item.category,...item.tags,...item.trigger_words].join(" ").toLocaleLowerCase();
        return words.every(word=>text.includes(word))
            &&(!filters.directory||directory===filters.directory||directory.startsWith(`${filters.directory}/`))
            &&(!filters.baseModel.length||filters.baseModel.includes(item.base_model))
            &&(!filters.tag.length||filters.tag.some(tag=>item.tags.includes(tag)))
            &&(!filters.type.length||filters.type.includes(item.type))
            &&(!filters.category.length||filters.category.includes(item.category))
            &&(!filters.author.length||filters.author.includes(item.author));
    }).sort((left,right)=>collator.compare(left.display_name||left.name,right.display_name||right.name)||collator.compare(left.name,right.name));
    return{
        items:visible,
        directories:directoryTree(items),
        facets:{baseModels:sort(items.map(item=>item.base_model)),tags:sort(items.flatMap(item=>item.tags)),types:sort(items.map(item=>item.type)),categories:sort(items.map(item=>item.category)),authors:sort(items.map(item=>item.author))},
    };
}
