import assert from"node:assert/strict";
import test from"node:test";
import{readFileSync}from"node:fs";
const source=readFileSync(new URL("../ui/src/regional/lutDownloadDialog.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");
test("download manager uses compact shared header controls and category routing",()=>{assert.match(source,/BvManagedWindow/);assert.match(source,/DOWNLOAD_CATEGORIES/);assert.match(source,/initialCategory/);assert.match(source,/CompactSelect className="bv-download-category-select"/);assert.doesNotMatch(source,/context=\{<SelectField/);assert.doesNotMatch(source,/<Dialog\b/)});

test("download manager filters all, available, and installed resources",()=>{assert.match(source,/type StatusFilter="all"\|"available"\|"installed"/);assert.match(source,/statusFilter==="installed"\?item\.installed:!item\.installed/);for(const label of ["All (","Available (","Installed ("])assert.ok(source.includes(label))});

test("download manager filters shrink without collapsing the contained status field",()=>{assert.match(css,/\.bv-download-manager-body\{[^}]*overflow-x:hidden/);assert.match(css,/\.bv-download-filters\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(280px,320px\)[^}]*min-width:0[^}]*max-width:100%/);assert.match(css,/\.bv-download-filters>\.bv-control-field\{[^}]*min-width:0/);assert.match(css,/@container bv-download-manager \(max-width:640px\)\{\.bv-download-filters\{grid-template-columns:minmax\(0,1fr\)\}/)});
