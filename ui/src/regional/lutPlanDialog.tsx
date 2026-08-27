import {createElement}from"react";
import{mountBvView}from"../ui";
import{LutPlanDialogView}from"./LutPlanDialogView";
export function openLutPlanDialog(props:any){mountBvView((close,activationToken)=>createElement(LutPlanDialogView,{...props,close,activationToken}),{key:`lut-plan:${props.nodeId??"active"}`});}
