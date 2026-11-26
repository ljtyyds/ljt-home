import {citationText} from "./paperFiles";
import {paperReference} from "./papers";
import {prepareImage} from "./imageClient";
import type {ImageAttachment} from "./images";
import {loadPdfRuntime,PdfResourceError,isPdfResourceError} from "./pdfClient";
export type ImportedPaperFile={name:string;hash:string;text:string;title:string;reference:string;images:ImageAttachment[];note:string};
type TextItem={str?:string;hasEOL?:boolean};
type PdfPage={getTextContent:()=>Promise<{items:TextItem[]}>;getViewport:(v:{scale:number})=>{width:number;height:number};render:(v:unknown)=>{promise:Promise<void>};cleanup:()=>void};
type PdfDoc={numPages:number;getPage:(n:number)=>Promise<PdfPage>;getMetadata:()=>Promise<{info?:{Title?:string}}>};
type PdfApi={PDFWorker:new(options:{port:Worker})=>unknown;getDocument:(options:unknown)=>{promise:Promise<PdfDoc>;destroy:()=>Promise<void>}};
async function boundedRead(stream:ReadableStream<Uint8Array>,limit:number){const reader=stream.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit)throw Error("文档解压后内容过大，请改用论文首页或摘要。");chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;}
async function docxText(data:Uint8Array){
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let end=-1;for(let p=data.length-22;p>=Math.max(0,data.length-65557);p--)if(view.getUint32(p,true)===0x06054b50){end=p;break;}if(end<0)throw Error("DOCX 不是有效的 Word 文档。");
 const count=view.getUint16(end+10,true),start=view.getUint32(end+16,true);if(count>3000)throw Error("DOCX 文件内容过多，请转换为 PDF 或文本。");let cursor=start;
 for(let i=0;i<count;i++){if(cursor+46>data.length||view.getUint32(cursor,true)!==0x02014b50)throw Error("DOCX 压缩结构损坏。");const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),compressed=view.getUint32(cursor+20,true),size=view.getUint32(cursor+24,true),nameSize=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),local=view.getUint32(cursor+42,true);const name=new TextDecoder().decode(data.subarray(cursor+46,cursor+46+nameSize));cursor+=46+nameSize+extra+comment;
  if(name!=="word/document.xml")continue;if(flags&1)throw Error("暂不支持加密 DOCX，请先解除密码。");if(size>2000000||compressed>12000000||local+30>data.length||view.getUint32(local,true)!==0x04034b50)throw Error("DOCX 正文过大或结构无效。");const offset=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);if(offset+compressed>data.length)throw Error("DOCX 文件不完整。");let xml:Uint8Array;if(method===0)xml=data.subarray(offset,offset+compressed);else if(method===8)xml=await boundedRead(new Blob([new Uint8Array(data.subarray(offset,offset+compressed))]).stream().pipeThrough(new DecompressionStream("deflate-raw")),2000000);else throw Error("DOCX 压缩格式不受支持。");
  const document=new DOMParser().parseFromString(new TextDecoder().decode(xml),"application/xml");if(document.querySelector("parsererror"))throw Error("DOCX 正文无法读取。");return Array.from(document.getElementsByTagNameNS("*","p")).map(p=>Array.from(p.getElementsByTagNameNS("*","t")).map(t=>t.textContent).join("")).join("\n").slice(0,50000);
 }throw Error("DOCX 中未找到正文。");
}
async function pdfAttempt(data:Uint8Array,progress:(text:string)=>void,signal:AbortSignal|undefined,fresh:boolean){
 const{api:pdf,workerUrl}=await loadPdfRuntime<PdfApi>(fresh,signal);
 let worker:Worker;try{worker=new Worker(workerUrl,{type:"module"});}catch(error){throw new PdfResourceError("worker",error);}
 let task:ReturnType<PdfApi["getDocument"]>;try{task=pdf.getDocument({data:new Uint8Array(data),worker:new pdf.PDFWorker({port:worker}),isEvalSupported:false,disableFontFace:true,useSystemFonts:true,useWasm:false,disableAutoFetch:true,disableStream:true,verbosity:0});}catch(error){worker.terminate();throw error;}
 let timer:ReturnType<typeof setTimeout>|undefined,abortHandler:(()=>void)|undefined,workerError:((event:ErrorEvent)=>void)|undefined;
 const workerFailure=new Promise<never>((_,reject)=>{workerError=event=>{event.preventDefault();reject(new PdfResourceError("worker",event.message));};worker.addEventListener("error",workerError);});
 try{return await Promise.race([workerFailure,(async()=>{const doc=await task.promise;if(doc.numPages>300)throw Error("PDF 超过 300 页，请只导入论文或摘要页。");let text="";const pages=Math.min(doc.numPages,12);for(let n=1;n<=pages;n++){progress("正在读取 PDF 第 "+n+" / "+pages+" 页…");const page=await doc.getPage(n);const content=await page.getTextContent();text+=content.items.map(item=>(item.str||"")+(item.hasEOL?"\n":" ")).join("")+"\n";page.cleanup();if(text.length>=48000)break;}
  const title=(await doc.getMetadata().catch(()=>({info:{Title:""}}))).info?.Title?.slice(0,200)||"";
  const images:ImageAttachment[]=[];if(text.replace(/\s/g,"").length<100){for(let n=1;n<=Math.min(doc.numPages,3);n++){progress("文字层不足，正在转换 PDF 第 "+n+" 页供图片分析…");const page=await doc.getPage(n),viewport=page.getViewport({scale:1});const scale=Math.min(2,2000/Math.max(viewport.width,viewport.height));const size=page.getViewport({scale}),canvas=document.createElement("canvas");canvas.width=Math.ceil(size.width);canvas.height=Math.ceil(size.height);await page.render({canvas,canvasContext:canvas.getContext("2d"),viewport:size}).promise;const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("PDF 页面转换失败")),"image/jpeg",0.87));images.push(await prepareImage(new File([blob],"PDF第"+n+"页.jpg",{type:"image/jpeg"})));page.cleanup();}}
  return{text:text.slice(0,50000),title,images,note:images.length?"PDF 没有足够文字层，已提取前 "+images.length+" 页供图片分析。":"已提取 PDF 前 "+pages+" 页文字（最多 50000 字符），请核对标题和摘要。"};})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("PDF 解析超时，请只导入论文首页或摘要。")),40000);abortHandler=()=>reject(Error("已取消文件解析。"));signal?.addEventListener("abort",abortHandler,{once:true});if(signal?.aborted)abortHandler();})]);}catch(error){if(error instanceof Error&&/password|encrypted/i.test(error.message))throw Error("PDF 有密码或被加密，请先解除密码后导入。");throw error;}finally{if(timer)clearTimeout(timer);if(abortHandler)signal?.removeEventListener("abort",abortHandler);if(workerError)worker.removeEventListener("error",workerError);worker.terminate();void task.destroy().catch(()=>{});}
}
async function pdfText(data:Uint8Array,progress:(text:string)=>void,signal?:AbortSignal){
 for(let attempt=0;attempt<2;attempt++)try{return await pdfAttempt(data,progress,signal,attempt>0);}catch(error){if(signal?.aborted)throw Error("已取消文件解析。");if(!isPdfResourceError(error)||attempt===1)throw error;progress("PDF 组件加载中断，正在重新连接并重试…");}
 throw new PdfResourceError("module");
}
export async function readPaperFile(file:File,progress:(text:string)=>void=()=>{},signal?:AbortSignal):Promise<ImportedPaperFile>{
 if(!file.size||file.size>20*1024*1024)throw Error("单个论文文件须大于 0 且不超过 20 MB。");const extension=file.name.split(".").pop()?.toLowerCase()||"";
 if(!["pdf","docx","txt","md","bib","ris","enw","json"].includes(extension))throw Error("支持 PDF、DOCX、TXT、Markdown、BibTeX、RIS、EndNote 和 CSL JSON；旧 DOC 请先转为 PDF 或 DOCX。");
 const bytes=new Uint8Array(await file.arrayBuffer());const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes)))).map(n=>n.toString(16).padStart(2,"0")).join("");const base={name:file.name.slice(0,200),hash};
 if(signal?.aborted)throw Error("已取消文件解析。");
 if(extension==="pdf"){if(!new TextDecoder().decode(bytes.subarray(0,1024)).includes("%PDF-"))throw Error("文件不是有效的 PDF。");const result=await pdfText(bytes,progress,signal);return{...base,...result,reference:""};}
 progress("正在读取文献文件…");const text=extension==="docx"?await docxText(bytes):new TextDecoder("utf-8",{fatal:true}).decode(bytes);const parsed=citationText(text,extension);return{...base,...parsed,reference:paperReference(parsed.reference)?.url||"",images:[],note:"已读取 "+file.name+"，可点击 AI 识别整理，也可手动检查后保存。"};
}
