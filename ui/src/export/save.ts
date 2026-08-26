import type { ExportResult } from "./model";

const anchorDownload=(result:ExportResult)=>{const url=URL.createObjectURL(result.blob),anchor=document.createElement("a");anchor.href=url;anchor.download=result.filename;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)};
export async function saveExport(result:ExportResult){
    anchorDownload(result);
}
