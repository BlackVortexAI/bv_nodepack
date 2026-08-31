import assert from"node:assert/strict";
import{readFileSync}from"node:fs";
import test from"node:test";
import React from"../ui/node_modules/react/index.js";
import{renderToStaticMarkup}from"../ui/node_modules/react-dom/server.node.js";
import{ImagePicker,ImagePickerOptionRow,ImagePickerOptions,imageOptionPreviewSource,imageOptionSource}from"../ui/src/ui/components/data.tsx";

const styles=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");
const ruleBody=selector=>{
  const start=styles.lastIndexOf(`${selector} {`);
  assert.notEqual(start,-1,`missing CSS rule: ${selector}`);
  return styles.slice(styles.indexOf("{",start)+1,styles.indexOf("}",start));
};
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const hasDeclaration=(body,property,value)=>assert.match(body,new RegExp(`${property}\\s*:\\s*${escapeRegExp(value)}`));

test("shared image picker preserves defaults and renders a real thumbnail",()=>{
  const option={id:"one",name:"Sender 1",meta:"Latest",src:"/full.png",thumbnail:"/thumb.png"};
  const markup=renderToStaticMarkup(React.createElement(ImagePicker,{label:"Queue image",value:"one",onValue(){},options:[option]}));
  assert.match(markup,/bv-control-label/);assert.match(markup,/src="\/thumb.png"/);assert.doesNotMatch(markup,/src="\/full.png"/);assert.match(markup,/Open large preview/);
  assert.equal(imageOptionSource(option),"/thumb.png");assert.equal(imageOptionPreviewSource(option),"/full.png");
});

test("shared image picker supports compact accessible no-image selections",()=>{
  const markup=renderToStaticMarkup(React.createElement(ImagePicker,{className:"feature-picker",label:"Canvas image",labelVisible:false,largePreview:false,value:"missing",onValue(){},options:[{id:"missing",name:"Source unavailable",disabled:true}]}));
  assert.match(markup,/feature-picker/);assert.match(markup,/aria-label="Canvas image"/);assert.match(markup,/bv-image-picker-placeholder/);assert.doesNotMatch(markup,/<img/);assert.doesNotMatch(markup,/bv-image-preview-action/);
});

test("shared image picker options enforce disabled selection and accessibility",()=>{
  const option={id:"missing",name:"Source unavailable",disabled:true};let selected="";
  const row=ImagePickerOptionRow({item:option,selected:true,onSelect:id=>{selected=id}});
  assert.equal(row.props.role,"option");assert.equal(row.props["aria-selected"],true);assert.equal(row.props.disabled,true);
  row.props.onClick();assert.equal(selected,"");
  const markup=renderToStaticMarkup(React.createElement(ImagePickerOptions,{label:"Canvas image",options:[option],value:"missing",onSelect:id=>{selected=id}}));
  assert.match(markup,/role="listbox"/);assert.match(markup,/role="option"/);assert.match(markup,/aria-selected="true"/);assert.match(markup,/disabled=""/);assert.match(markup,/aria-hidden="true"/);
});

test("shared image picker contains long option labels inside menu and trigger",()=>{
  const longName="Prompt #54bv_regional_canvas_temp_nnzpy_00001_png_with_an_extremely_long_source_name";
  const markup=renderToStaticMarkup(React.createElement(ImagePicker,{label:"Canvas image",value:"long",onValue(){},options:[{id:"long",name:"Prompt",meta:longName}]}));
  assert.match(markup,new RegExp(longName));

  const listbox=ruleBody('.bv-image-picker-menu [role=listbox]');
  hasDeclaration(listbox,"grid-template-columns","minmax(0,1fr)");
  hasDeclaration(listbox,"min-width","0");
  hasDeclaration(listbox,"max-width","100%");

  const row=ruleBody('.bv-image-picker-menu [role=listbox]>button');
  hasDeclaration(row,"box-sizing","border-box");
  hasDeclaration(row,"min-width","0");
  hasDeclaration(row,"max-width","100%");
  hasDeclaration(row,"overflow","hidden");

  const optionText=ruleBody('.bv-image-picker-menu [role=listbox]>button>span');
  hasDeclaration(optionText,"flex","1 1 auto");
  hasDeclaration(optionText,"min-width","0");
  hasDeclaration(optionText,"overflow","hidden");
  const triggerText=ruleBody('.bv-image-picker-trigger>span');
  hasDeclaration(triggerText,"min-width","0");
  hasDeclaration(triggerText,"overflow","hidden");
  for(const selector of['.bv-image-picker-menu [role=listbox]>button>span>strong,.bv-image-picker-menu [role=listbox]>button>span>small','.bv-image-picker-trigger>span>strong,.bv-image-picker-trigger>span>small']){
    const label=ruleBody(selector);
    hasDeclaration(label,"display","block");
    hasDeclaration(label,"overflow","hidden");
    hasDeclaration(label,"text-overflow","ellipsis");
    hasDeclaration(label,"white-space","nowrap");
  }
});
