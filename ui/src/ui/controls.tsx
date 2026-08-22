/* Compatibility exports for existing callers. Implementations live in
   ui/components; new code imports from that module directly. */
import React, { ReactNode } from "react";
import { FieldFrame, NumberField, NumberFieldProps, SelectField, TextareaField } from "./components";

export function BvField({ label, help, children, className = "" }: { label: string; help?: string; children: ReactNode; className?: string }) {
    return <FieldFrame label={label} help={help} className={className}>{children}</FieldFrame>;
}

export function BvSelect({ label, help, value, onChange, children, disabled, className = "" }: { label: string; help?: string; value: string; onChange: (value: string) => void; children: ReactNode; disabled?: boolean; className?: string }) {
    const options=React.Children.toArray(children).flatMap(child=>React.isValidElement<{value?:string;children?:ReactNode;disabled?:boolean}>(child)?[{value:String(child.props.value??child.props.children??""),label:String(child.props.children??child.props.value??""),disabled:child.props.disabled}]:[]);
    return <div className={className}><SelectField label={label} help={help} value={value} onValue={onChange} options={options} disabled={disabled}/></div>;
}

export function BvNumberField({onChange,...props}:Omit<NumberFieldProps,"onValue">&{onChange:(value:number)=>void}) { return <NumberField {...props} onValue={onChange}/>; }

export function BvTextareaField({ label, help, children, className = "" }: { label: string; help?: string; children: ReactNode; className?: string }) {
    if(React.isValidElement<React.TextareaHTMLAttributes<HTMLTextAreaElement>>(children)) return <TextareaField label={label} help={help} className={className} {...children.props}/>;
    return <FieldFrame label={label} help={help} className={className}>{children}</FieldFrame>;
}
