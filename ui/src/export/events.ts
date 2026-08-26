import type { ExportOptions } from "./model";
export const BV_EXPORT_OPEN_EVENT="bv-export-open";
export type ExportOpenDetail={source?:ExportOptions["source"]};
export const openExportDialog=(source?:ExportOptions["source"])=>window.dispatchEvent(new CustomEvent<ExportOpenDetail>(BV_EXPORT_OPEN_EVENT,{detail:{source}}));
