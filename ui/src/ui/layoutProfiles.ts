export const BV_LAYOUT_PROFILE_SCHEMA=1;
export const BV_LAYOUT_PROFILE_LIMIT=20;
const PREFIX="bv-nodepack:layout-profiles:v1:";

export type BvLayoutStatus="saved"|"adjusted"|"modified";
export type BvLayoutProfile={id:string;name:string;editorType:string;schemaVersion:1;editorVersion:string;library:string;signature:string;layout:unknown;updatedAt:string};
type Envelope={schemaVersion:1;profiles:BvLayoutProfile[];selectedId?:string};
const sessionDrafts=new Map<string,{layout:unknown;status:BvLayoutStatus;profileId?:string}>();
export const BV_LAYOUT_SESSION_CHANGED_EVENT="bv-layout-session-changed";
const key=(editorType:string)=>`${PREFIX}${editorType}`;

export function readLayoutProfiles(editorType:string):Envelope{
    try{const value=JSON.parse(localStorage.getItem(key(editorType))??"");if(value?.schemaVersion===1&&Array.isArray(value.profiles))return value}catch{}
    return{schemaVersion:1,profiles:[]};
}
function write(editorType:string,value:Envelope){localStorage.setItem(key(editorType),JSON.stringify(value))}
const validName=(name:string)=>{const value=name.trim();if(value.length<1||value.length>40)throw new Error("Layout name must contain 1 to 40 characters.");return value};
export function saveLayoutProfile(input:Omit<BvLayoutProfile,"id"|"name"|"schemaVersion"|"updatedAt">&{id?:string;name:string}){
    const current=readLayoutProfiles(input.editorType),name=validName(input.name),id=input.id??crypto.randomUUID(),duplicate=current.profiles.find(profile=>profile.name.localeCompare(name,undefined,{sensitivity:"accent"})===0&&profile.id!==id);
    if(duplicate)throw new Error("A layout with this name already exists.");
    const profile:BvLayoutProfile={...input,id,name,schemaVersion:1,updatedAt:new Date().toISOString()};
    const profiles=current.profiles.some(item=>item.id===id)?current.profiles.map(item=>item.id===id?profile:item):[...current.profiles,profile];
    if(profiles.length>BV_LAYOUT_PROFILE_LIMIT)throw new Error(`A maximum of ${BV_LAYOUT_PROFILE_LIMIT} layouts can be saved for this editor.`);
    write(input.editorType,{schemaVersion:1,profiles,selectedId:id});return profile;
}
export function deleteLayoutProfile(editorType:string,id:string){const current=readLayoutProfiles(editorType);write(editorType,{...current,profiles:current.profiles.filter(profile=>profile.id!==id),selectedId:current.selectedId===id?undefined:current.selectedId})}
export function renameLayoutProfile(editorType:string,id:string,name:string){const current=readLayoutProfiles(editorType),profile=current.profiles.find(item=>item.id===id);if(!profile)throw new Error("Layout not found.");return saveLayoutProfile({...profile,id,name})}
export function setSessionLayoutDraft(key:string,layout:unknown,status:BvLayoutStatus,profileId?:string,notify=true){sessionDrafts.set(key,{layout:structuredClone(layout),status,profileId});if(notify)window.dispatchEvent(new CustomEvent(BV_LAYOUT_SESSION_CHANGED_EVENT,{detail:{key}}))}
export function getSessionLayoutDraft(key:string){const draft=sessionDrafts.get(key);return draft?structuredClone(draft):undefined}
export function clearSessionLayoutDraft(key:string){sessionDrafts.delete(key)}
export function isCompatibleLayoutProfile(profile:BvLayoutProfile,input:{editorType:string;editorVersion:string;library:string;signature:string}){return profile.editorType===input.editorType&&profile.editorVersion===input.editorVersion&&profile.library===input.library&&profile.signature===input.signature}
export function layoutPanelIds(layout:any):Set<string>{const ids=new Set<string>();const visit=(node:any)=>{if(!node||typeof node!=="object")return;if(node.type==="tab"&&typeof node.id==="string")ids.add(node.id);for(const child of node.children??[])visit(child)};visit(layout?.layout);for(const border of layout?.borders??[])visit(border);return ids}
export function missingLayoutPanels(layout:unknown,registeredIds:string[]){const present=layoutPanelIds(layout);return registeredIds.filter(id=>!present.has(id))}
