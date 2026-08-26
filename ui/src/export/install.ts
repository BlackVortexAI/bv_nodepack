import { configureCaptureApp, listUiCaptureSources } from "./captureRegistry";
import { openExportDialog } from "./events";
import { captureExport } from "./ExportDialog";
import { normalizeExportOptions, type ExportOptions, type ExportResult } from "./model";
import { saveExport } from "./save";

export type BvExportApi={capture:(options?:ExportOptions)=>Promise<ExportResult>;download:(options?:ExportOptions)=>Promise<ExportResult>;openDialog:(options?:ExportOptions)=>void;listSources:()=>Array<{id:string;title:string;kind:"graph"|"selection"|"ui"}>};
declare global{interface Window{bvNodepack?:{export?:{v1?:BvExportApi}}}}

export function installExporter(app:any,api:any){
    configureCaptureApp(app);
    const ensureIdle=async()=>{const queue=await api.getQueue();if(queue.Running?.length||queue.Pending?.length)throw new Error("Export is disabled while the ComfyUI queue is active.")};
    const capture=async(options:ExportOptions={})=>{await ensureIdle();return captureExport(app,normalizeExportOptions(options))};
    const value:BvExportApi={capture,download:async options=>{const result=await capture(options);await saveExport(result);return result},openDialog:options=>openExportDialog(options?.source),listSources:()=>[{id:"graph",title:"Entire active graph",kind:"graph"},{id:"selection",title:"Selected nodes and groups",kind:"selection"},...listUiCaptureSources().map(source=>({id:`ui:${source.id}`,title:source.title,kind:"ui" as const}))]};
    window.bvNodepack??={};window.bvNodepack.export??={};window.bvNodepack.export.v1=value;return value;
}
