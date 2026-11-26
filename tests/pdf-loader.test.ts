import {test} from "node:test";
import assert from "node:assert/strict";
import {loadPdfRuntime,PdfResourceError,isPdfResourceError} from "../shared/pdfClient";
test("PDF 主模块与 Worker 固定来自本站并使用相同版本参数",async()=>{
 let request="";const api={version:"6.4.299"};const result=await loadPdfRuntime(false,undefined,{importer:async url=>{request=url;return api;}});assert.equal(result.api,api);assert.equal(request,"/api/paper-pdf-assets/pdf.mjs?v=6.4.299-legacy1");assert.equal(result.workerUrl,"/api/paper-pdf-assets/worker.mjs?v=6.4.299-legacy1");
});
test("重试生成新的主模块和 Worker 地址，避开同一页面的失败模块记录",async()=>{
 const urls:string[]=[];for(let n=0;n<2;n++){const result=await loadPdfRuntime(true,undefined,{importer:async url=>{urls.push(url);return{};}});assert.match(urls[n],/\?v=6\.4\.299-legacy1&retry=/);assert.equal(result.workerUrl.split("?")[1],urls[n].split("?")[1]);}assert.notEqual(urls[0],urls[1]);
});
test("加载失败返回可恢复的中文提示，不把内部地址报错直接展示给用户",async()=>{
 await assert.rejects(()=>loadPdfRuntime(false,undefined,{importer:async()=>{throw Error("Failed to fetch dynamically imported module: http://127.0.0.1:18080/internal");}}),error=>{assert.ok(isPdfResourceError(error));assert.equal(error.stage,"module");assert.match(error.message,/SSH 隧道/);assert.match(error.message,/内容已保留/);assert.doesNotMatch(error.message,/internal|Failed to fetch/);return true;});
});
test("已取消的任务不发起模块请求",async()=>{
 const abort=new AbortController();abort.abort();let requested=false;await assert.rejects(()=>loadPdfRuntime(false,abort.signal,{importer:async()=>{requested=true;return{};}}),/已取消/);assert.equal(requested,false);
});
test("加载过程中取消立即结束，不将取消识别为可重试的资源错误",async()=>{
 const abort=new AbortController(),result=loadPdfRuntime(false,abort.signal,{importer:()=>new Promise(()=>{})});abort.abort();await assert.rejects(()=>result,error=>{assert.ok(error instanceof Error);assert.match(error.message,/已取消/);assert.equal(isPdfResourceError(error),false);return true;});
});
test("模块长期无响应有明确超时，普通解析错误不冒充资源错误",async()=>{
 await assert.rejects(()=>loadPdfRuntime(false,undefined,{importer:()=>new Promise(()=>{}),timeoutMs:10}),error=>isPdfResourceError(error)&&error.stage==="module");assert.equal(isPdfResourceError(Error("Invalid PDF")),false);assert.equal(isPdfResourceError(null),false);assert.ok(isPdfResourceError(new PdfResourceError("worker")));
});
