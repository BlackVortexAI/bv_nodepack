type SelectionLike={rangeCount:number;isCollapsed:boolean;toString:()=>string;getRangeAt:(index:number)=>{startContainer:Node;endContainer:Node}};
type SelectionRoot={contains:(node:Node)=>boolean};

export function selectedTextWithin(root:SelectionRoot|null,selection:SelectionLike|null){
  if(!root||!selection||selection.rangeCount<1||selection.isCollapsed)return null;
  for(let index=0;index<selection.rangeCount;index++){
    const range=selection.getRangeAt(index);
    if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;
  }
  const text=selection.toString();
  return text.trim().length?text:null;
}
