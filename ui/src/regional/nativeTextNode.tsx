import React from "react";
import {PromptAssistAction,PromptAssistContext,PromptAssistPanel,usePromptAssist} from "./PromptAssist";
import {NATIVE_TEXT_TARGET,type AssistNode} from "./promptAssistState";
import {installReactNodeWidgetHost} from "./reactNodeWidgetHost";

function NativeTextWriting({node}:{node:AssistNode}){
    const {config,onConfig}=usePromptAssist(node);
    return <PromptAssistContext.Provider value={{node,active:true}}>
        <div className="bv-ui-stack">
            <PromptAssistPanel config={config} onConfig={onConfig}/>
            <PromptAssistAction target={NATIVE_TEXT_TARGET} polarity="positive" alwaysEnabled/>
        </div>
    </PromptAssistContext.Provider>;
}

export function installNativeTextNode(nodeType:any){
    installReactNodeWidgetHost(nodeType,"BV Text",{
        id:"native-text-writing",name:"bv_text_writing",minHeight:110,growWithContent:true,
        render:node=><NativeTextWriting key={node.__bvReactNodeWidgetLifecycle?.generation} node={node}/>,
    });
}
