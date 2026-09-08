import assert from 'node:assert/strict';
import test from 'node:test';
import {configureReactNodeWidgetHost,renderReactNodeWidget,removeReactNodeWidgets} from '../ui/src/regional/reactNodeWidgetHost.tsx';

test('central content growth caps automatic height but permits larger saved user height',()=>{
 let measure,options;const queue=[],host={className:'',dataset:{},remove(){}},content={className:'',style:{}};
 configureReactNodeWidgetHost({createHost:()=>host,createContentHost:()=>content,createRoot:()=>({render(){},unmount(){}}),schedule:action=>queue.push(action),applyPresentation(){},viewportHeight:()=>1000,observeHost:(_host,callback)=>{measure=callback;return()=>{}}});
 const node={size:[510,700],properties:{},addDOMWidget(_name,_type,_host,opts){options=opts;return{}}};
 renderReactNodeWidget(node,'BV LoRA Registry',{id:'review',name:'review',minHeight:72,maxHeight:340,growWithContent:true,render:()=>null});
 measure(250);while(queue.length)queue.shift()();assert.equal(options.getMinHeight(),250);
 measure(1200);while(queue.length)queue.shift()();assert.equal(options.getMinHeight(),340);assert.equal(options.getMaxHeight(),340);
 node.properties={bvPresentationSizeVersion:1,bvPresentationUserHeight:700};
 assert.equal(options.getMinHeight(),72);assert.equal(options.getMaxHeight(),Infinity);
 assert.equal(content.style.maxHeight,'100%');assert.deepEqual(node.size,[510,700]);
 removeReactNodeWidgets(node);
});

test('automatic content height also obeys the shared viewport cap',()=>{
 let measure,options;const host={className:'',dataset:{},remove(){}},content={className:'',style:{}};
 configureReactNodeWidgetHost({createHost:()=>host,createContentHost:()=>content,createRoot:()=>({render(){},unmount(){}}),schedule:action=>action(),applyPresentation(){},viewportHeight:()=>400,observeHost:(_host,callback)=>{measure=callback;return()=>{}}});
 const node={properties:{},addDOMWidget(_name,_type,_host,opts){options=opts;return{}}};
 renderReactNodeWidget(node,'BV LoRA Registry',{id:'review',name:'review',minHeight:72,maxHeight:340,growWithContent:true,render:()=>null});
 measure(900);assert.equal(options.getMinHeight(),240);assert.equal(options.getMaxHeight(),240);
 removeReactNodeWidgets(node);
});
