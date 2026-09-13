import React from "react";
import { FieldFrame, CheckboxField } from "../ui/components";
import PromptTextarea from "./PromptTextarea";
import type { CompletionContext } from "./engine";
import type { ReferenceChoice, ReferenceMention } from "./referenceMentions";
import {PromptAssistAction} from "../regional/PromptAssist";

export type ReferencePromptPair = {positive_source:string;negative_source:string;reference_editor?:boolean;references?:{positive?:ReferenceMention[];negative?:ReferenceMention[]}};
export function ReferenceSearchToggle({value,onValue}:{value:boolean;onValue:(value:boolean)=>void}) {
    return <div className="bv-reference-search-toggle" title="Enable @ suggestions. Existing references remain stored."><CheckboxField label="@ references" checked={value} onValue={onValue}/></div>;
}
export function PromptPairFields({value,onValue,scope,choices,assistTarget}:{value:ReferencePromptPair;onValue:(value:ReferencePromptPair)=>void;scope:CompletionContext["scope"];choices:ReferenceChoice[];assistTarget?:string}) {
    return <div className="bv-prompt-editor-fields">{(["positive","negative"] as const).map(polarity=><FieldFrame as="div" label={polarity==="positive"?"Positive":"Negative"} key={polarity}>
        <PromptTextarea value={value[`${polarity}_source`]} onValue={text=>onValue({...value,[`${polarity}_source`]:text})} completionContext={{scope,polarity}}
            references={{enabled:value.reference_editor===true,choices,mentions:value.references?.[polarity]??[],onChange:(text,mentions)=>onValue({...value,[`${polarity}_source`]:text,references:{...value.references,[polarity]:mentions}})}}/>
        {assistTarget&&<PromptAssistAction target={assistTarget} polarity={polarity} text={value[`${polarity}_source`]}/>}
    </FieldFrame>)}{Object.values(value.references??{}).some(items=>items?.length)?<small className="bv-reference-status">References saved. Application requires a compatible model mode.</small>:null}</div>;
}
