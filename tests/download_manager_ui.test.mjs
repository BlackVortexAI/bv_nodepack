import assert from"node:assert/strict";
import test from"node:test";
import{readFileSync}from"node:fs";
import vm from"node:vm";
import ts from"../ui/node_modules/typescript/lib/typescript.js";
const source=readFileSync(new URL("../ui/src/regional/lutDownloadDialog.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");
const helperSource=source.match(/export const isCurrentCatalogRequest=.*?export const catalogItemKey=.*?;\r?\n/s)?.[0];
assert.ok(helperSource,"catalog request helpers must remain extractable");
const helperModule={exports:{}};
vm.runInNewContext(ts.transpileModule(helperSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:helperModule.exports,module:helperModule});
const{catalogItemKey,catalogPollDecision,isCurrentCatalogRequest}=helperModule.exports;
test("download manager uses compact shared header controls and category routing",()=>{assert.match(source,/BvManagedWindow/);assert.match(source,/DOWNLOAD_CATEGORIES/);assert.match(source,/initialCategory/);assert.match(source,/CompactSelect className="bv-download-category-select"/);assert.doesNotMatch(source,/context=\{<SelectField/);assert.doesNotMatch(source,/<Dialog\b/)});

test("download manager filters all, available, and installed resources",()=>{assert.match(source,/type StatusFilter="all"\|"available"\|"installed"/);assert.match(source,/statusFilter==="installed"\?item\.installed:!item\.installed/);for(const label of ["All (","Available (","Installed ("])assert.ok(source.includes(label))});

test("download manager filters shrink without collapsing the contained status field",()=>{assert.match(css,/\.bv-download-manager-body\{[^}]*overflow-x:hidden/);assert.match(css,/\.bv-download-filters\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(280px,320px\)[^}]*min-width:0[^}]*max-width:100%/);assert.match(css,/\.bv-download-filters>\.bv-control-field\{[^}]*min-width:0/);assert.match(css,/@container bv-download-manager \(max-width:640px\)\{\.bv-download-filters\{grid-template-columns:minmax\(0,1fr\)\}/)});

test("download manager persists stable or experimental channel through the backend",()=>{
 assert.match(source,/type CatalogChannel="stable"\|"experimental"/);
 assert.match(source,/label:"Stable"/);
 assert.match(source,/label:"Experimental"/);
 assert.match(source,/label="Catalog channel"/);
 assert.match(source,/fetchApi\("\/bv_nodepack\/luts\/catalog\/channel"/);
 assert.match(source,/method:"PUT"/);
 assert.match(source,/Experimental LUTs may change or be removed/);
});

test("manual catalog refresh is non-blocking, polled with cleanup, and generation guarded",()=>{
 assert.match(source,/fetchApi\("\/bv_nodepack\/luts\/catalog\/refresh"/);
 assert.doesNotMatch(source,/catalog\/refresh[^\n]*JSON\.stringify\(\{channel\}\)/);
 assert.match(source,/const activeChannel=value\.channel as CatalogChannel/);
 assert.match(source,/>Refresh catalog<\/Button>/);
 assert.match(source,/fetchApi\("\/bv_nodepack\/luts\/catalog\/status"/);
 assert.match(source,/attempt>=60/);
 assert.match(source,/Catalog refresh is still running/);
 assert.match(source,/setRefreshStatus\(current=>\(\{\.\.\.current,phase:"failed",last_error:message\}\)\)/);
 assert.match(source,/window\.clearTimeout\(pollTimer\.current\)/);
 assert.match(source,/return\(\)=>\{generation\.current\+\+;stopPolling\(\)\}/);
 assert.match(source,/aria-busy=/);
});

test("catalog request helpers reject stale work and bound polling",()=>{
 assert.equal(isCurrentCatalogRequest(7,7),true);
 assert.equal(isCurrentCatalogRequest(8,7),false);
 assert.equal(catalogPollDecision(3,8,7),"stale");
 assert.equal(catalogPollDecision(60,7,7),"timeout");
 assert.equal(catalogPollDecision(59,7,7),"schedule");
 assert.notEqual(catalogItemKey("stable",1,"same"),catalogItemKey("stable",2,"same"));
 assert.notEqual(catalogItemKey("stable",2,"same"),catalogItemKey("experimental",2,"same"));
});

test("stale reload failures cannot overwrite the current catalog error state",()=>{
 assert.match(source,/const reload=\(\)=>\{const requestGeneration=\+\+generation\.current;stopPolling\(\);loadCatalog\(requestGeneration,channel\)\.catch\(reason=>\{if\(isCurrentCatalogRequest\(generation\.current,requestGeneration\)\)setError\(/);
});

test("LUT installation is bound to the rendered channel and catalog version",()=>{
 assert.match(source,/catalog_version:catalogVersion/);
 assert.match(source,/const listedChannel=channel,listedVersion=catalogVersion/);
 assert.match(source,/itemKey=catalogItemKey\(listedChannel,listedVersion,item\.id\)/);
 assert.match(source,/itemKey=catalogItemKey\(channel,catalogVersion,item\.id\)/);
 assert.match(source,/key=\{itemKey\}/);
 assert.match(source,/isCurrentCatalogRequest\(generation\.current,installGeneration\)/);
 assert.equal((source.match(/lutLibrary\.publish\(path\)/g)??[]).length,1,"successful installation must publish exactly once");
 assert.match(source,/lutLibrary\.publish\(path\);onInstalled\?\.\(category\.id,path\)/,"global publication must precede the optional origin callback");
});
