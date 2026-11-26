const version="6.4.299-legacy1";
export class PdfResourceError extends Error{
 readonly code="PDF_RESOURCE_LOAD_FAILED";
 constructor(readonly stage:"module"|"worker",cause?:unknown){super("PDF 解析组件加载失败。请确认 SSH 隧道仍连接，然后重试导入；当前填写内容已保留。",{cause});this.name="PdfResourceError";}
}
export function isPdfResourceError(error:unknown):error is PdfResourceError{return error instanceof PdfResourceError;}
export async function loadPdfRuntime<T>(fresh:boolean,signal?:AbortSignal,dependencies:{importer?:(url:string)=>Promise<unknown>;timeoutMs?:number}={}){
 if(signal?.aborted)throw Error("已取消文件解析。");
 // A failed module URL can remain rejected for the lifetime of a browser page.
 const suffix="?v="+version+(fresh?"&retry="+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2):"");
 const moduleUrl="/api/paper-pdf-assets/pdf.mjs"+suffix,workerUrl="/api/paper-pdf-assets/worker.mjs"+suffix;
 let timer:ReturnType<typeof setTimeout>|undefined,abortHandler:(()=>void)|undefined;
 try{
  const api=await new Promise<T>((resolve,reject)=>{
   timer=setTimeout(()=>reject(new PdfResourceError("module",Error("PDF module request timed out"))),dependencies.timeoutMs??12000);
   abortHandler=()=>reject(Error("已取消文件解析。"));signal?.addEventListener("abort",abortHandler,{once:true});
   const importer=dependencies.importer||((url:string)=>import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url));
   Promise.resolve().then(()=>{if(signal?.aborted)throw Error("已取消文件解析。");return importer(moduleUrl);}).then(value=>resolve(value as T),error=>reject(signal?.aborted?Error("已取消文件解析。"):new PdfResourceError("module",error)));
  });
  return{api,workerUrl};
 }finally{if(timer)clearTimeout(timer);if(abortHandler)signal?.removeEventListener("abort",abortHandler);}
}
