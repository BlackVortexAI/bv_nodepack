const stub=(source)=>({url:`data:text/javascript,${encodeURIComponent(source)}`,shortCircuit:true});

export async function resolve(specifier,context,nextResolve){
  const normalized=specifier.replaceAll("\\","/");
  if(normalized.endsWith("/scripts/app.js"))return stub("export const app={canvas:null};");
  if(normalized.endsWith("/scripts/api.js"))return stub("export const api={};");
  return nextResolve(specifier,context);
}
