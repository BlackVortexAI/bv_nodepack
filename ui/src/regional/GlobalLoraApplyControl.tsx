import {CheckboxField} from "../ui";
import type {LoraV3Config} from "./LoraV3ResourcePickerPanel";
import {commitLoraV3Config} from "./loraV3Ui";

export function GlobalLoraApplyControl({node,config,onConfig}:{node:any;config:LoraV3Config;onConfig:(next:LoraV3Config)=>void}){
    return <CheckboxField label="Globalen Stack anwenden" checked={config.apply_global!==false} onValue={value=>onConfig(commitLoraV3Config(node,{...config,apply_global:value}))}/>;
}
