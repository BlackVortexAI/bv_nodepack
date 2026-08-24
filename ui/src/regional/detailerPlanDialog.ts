import { createElement } from "react";
import { mountBvView } from "../ui";
import { DetailerPlanDialogView } from "./DetailerPlanDialogView";
import type { DetailerPlanRegion } from "./detailerPlanConfig";
import type { ResourcePickerCollector } from "../ui/components";

export const openDetailerPlanDialog = (regions: DetailerPlanRegion[], collectors: ResourcePickerCollector[], stored: unknown, save: (value: string) => void, windowKey: string, nodes: Array<{id:string;label:string}>, onNavigate: (id:string,replaceCurrent:boolean)=>void, currentNode?:any) => {
    mountBvView((close, activationToken) => createElement(DetailerPlanDialogView, { regions, collectors, stored, save, close, activationToken, nodeId:windowKey.split(":").slice(1).join(":"), nodes, onNavigate, currentNode }), { key: windowKey });
};
