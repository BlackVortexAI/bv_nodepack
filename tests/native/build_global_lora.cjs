/** Run from repository root: node tests/native/build_global_lora.cjs */
const path=require('path');
const root=path.resolve(__dirname,'../..');
const esbuild=require(path.join(root,'ui/node_modules/esbuild'));
(async()=>{for(const [entry,output] of [['global_lora.tsx','global-lora-harness.js'],['global_lora_editor.tsx','global-lora-editor.js'],['lora_catalog_client.tsx','lora-catalog-client.js'],['lora_preview.tsx','lora-preview-harness.js'],['exclusive_global_lora.tsx','exclusive-global-lora.js'],['registry_ux.tsx','registry-ux.js'],['catalog_incremental.tsx','catalog-incremental.js'],['quick_prompt_layout.tsx','quick-prompt-layout.js']]){
 await esbuild.build({plugins:[{name:"detached-app-singleton",setup(build){build.onResolve({filter:/scripts\/(app|api)\.js$/},()=>({path:path.join(root,"tests/native/global_lora_app.ts")}))}}],absWorkingDir:root,entryPoints:[`tests/native/${entry}`],bundle:true,format:'esm',outfile:`.tmp/${output}`,jsx:'automatic',alias:{react:path.join(root,'ui/node_modules/react'),'react-dom':path.join(root,'ui/node_modules/react-dom')},nodePaths:[path.join(root,'ui/node_modules')]});
}

})().catch(()=>process.exit(1));
