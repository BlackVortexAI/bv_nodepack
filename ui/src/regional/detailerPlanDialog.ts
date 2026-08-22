import { createElement } from "react";
import { mountBvView } from "../ui";
import { DetailerPlanDialogView } from "./DetailerPlanDialogView";
import type { DetailerPlanRegion } from "./detailerPlanConfig";

export const openDetailerPlanDialog = (regions: DetailerPlanRegion[], detectorIds: string[], stored: unknown, save: (value: string) => void, windowKey: string, nodes: Array<{id:string;label:string}>, onNavigate: (id:string,replaceCurrent:boolean)=>void, currentNode?:any) => {
    mountBvView((close, activationToken) => createElement(DetailerPlanDialogView, { regions, detectorIds, stored, save, close, activationToken, nodeId:windowKey.split(":").slice(1).join(":"), nodes, onNavigate, currentNode }), { key: windowKey });
};
