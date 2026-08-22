import { createElement } from "react";
import { mountBvView } from "../ui";
import { DetectorRegistryDialogView } from "./DetectorRegistryDialogView";
import type { DetectorModelCatalog } from "./detectorRegistryConfig";

export const openDetectorRegistryDialog = async (api: any, stored: unknown, save: (value: string) => void, windowKey: string, nodes: Array<{id:string;label:string}>, onNavigate: (id:string,replaceCurrent:boolean)=>void, currentNode?:any) => {
    const response = await fetch(api.apiURL("/bv_nodepack/detectors/models"));
    if (!response.ok) throw new Error(`Detector model catalog failed: ${response.status}`);
    const catalog = await response.json() as DetectorModelCatalog;
    mountBvView((close, activationToken) => createElement(DetectorRegistryDialogView, { catalog, stored, save, close, activationToken, nodeId:windowKey.split(":").slice(1).join(":"), nodes, onNavigate, currentNode }), { key: windowKey });
};
