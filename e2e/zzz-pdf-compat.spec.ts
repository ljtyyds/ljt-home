import {test,expect,type Page,type BrowserContext} from "@playwright/test";
import {pdfFixture} from "../tests/documentFixtures";
import fs from "node:fs/promises";
import path from "node:path";
test.describe.configure({mode:"serial"});
const visuals="test-results/qa/zzz-pdf-compat.spec";
let adminState:Awaited<ReturnType<BrowserContext["storageState"]>>|undefined;
async function paperDialog(page:Page){
 if(adminState)await page.context().addCookies(adminState.cookies);await page.goto("/");await expect(page).toHaveTitle(/个人知识门户/);
 if(!adminState){const setup=(await(await page.request.get("/api/session")).json()).setupNeeded;await page.getByRole("button",{name:"管理员登录",exact:true}).click();if(setup)await page.getByLabel("初始化码",{exact:true}).fill((await fs.readFile(path.join(process.env.E2E_DATA_DIR!,"setup-token.txt"),"utf8")).trim());await page.getByLabel("用户名",{exact:true}).fill("pdf-loader-admin");await page.getByLabel("密码",{exact:true}).fill("Pdf-loader-test-password-12345");await page.getByRole("button",{name:setup?"创建并进入管理":"进入管理工作区",exact:true}).click();await expect(page.getByRole("button",{name:"个人备忘录",exact:true})).toBeVisible();adminState=await page.context().storageState();}
 await page.getByRole("button",{name:"论文库",exact:true}).click();await page.getByRole("button",{name:"新增论文",exact:true}).click();return page.getByRole("dialog",{name:"新增论文",exact:true});
}
async function choosePdf(page:Page){await page.getByLabel("选择论文文件",{exact:true}).setInputFiles({name:"retry-paper.pdf",mimeType:"application/pdf",buffer:pdfFixture()});}
async function extracted(page:Page){const dialog=page.getByRole("dialog",{name:"新增论文",exact:true});await expect(dialog.locator(".paper-file-preview")).toContainText("retry-paper.pdf");await expect(dialog.locator(".paper-import-notes")).toContainText("已提取 PDF 前");await expect(dialog.getByLabel("论文补充内容",{exact:true})).toHaveValue(/Grounded Robot File Study/);await expect(dialog.locator(".form-error")).toHaveCount(0);return dialog;}
test("缺少 Map 新方法时，页面与 Worker 的兼容构建仍可提取文字和渲染 PDF",async({page})=>{
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.addInitScript(()=>{for(const name of ["getOrInsert","getOrInsertComputed"]){Reflect.deleteProperty(Map.prototype,name);Reflect.deleteProperty(WeakMap.prototype,name);}});
 await page.route("**/api/paper-pdf-assets/worker.mjs*",async route=>{
  const response=await route.fetch();const original=await response.text();
  const prefix='for(const name of ["getOrInsert","getOrInsertComputed"]){Reflect.deleteProperty(Map.prototype,name);Reflect.deleteProperty(WeakMap.prototype,name);}\n';
  const suffix='\nself.addEventListener("message",function(event){if(event.data?.pdfCompatProbe)self.postMessage({pdfCompatResult:true,map:typeof Reflect.get(Map.prototype,"getOrInsertComputed"),weakMap:typeof Reflect.get(WeakMap.prototype,"getOrInsertComputed")});});';
  await route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:prefix+original+suffix});
 });
 await page.goto("/");await expect(page).toHaveTitle(/个人知识门户/);
 const before=await page.evaluate(()=>({map:typeof Reflect.get(Map.prototype,"getOrInsertComputed"),weakMap:typeof Reflect.get(WeakMap.prototype,"getOrInsertComputed")}));expect(before).toEqual({map:"undefined",weakMap:"undefined"});
 const result=await page.evaluate(async encoded=>{
  const url="/api/paper-pdf-assets/pdf.mjs?v=6.4.299-legacy1";
  const pdf=await import(/* webpackIgnore: true */ url);
  const worker=new Worker("/api/paper-pdf-assets/worker.mjs?v=6.4.299-legacy1",{type:"module"});
  const task=pdf.getDocument({data:Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),worker:new pdf.PDFWorker({port:worker}),isEvalSupported:false,disableFontFace:true,useSystemFonts:true,useWasm:false,verbosity:0});
  try{const document=await task.promise,page=await document.getPage(1),content=await page.getTextContent(),viewport=page.getViewport({scale:1});const canvas=window.document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvas,canvasContext:canvas.getContext("2d"),viewport}).promise;
   const workerCapabilities=await new Promise<{map:string;weakMap:string}>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error("Worker compatibility probe timed out")),5000);const receive=(event:MessageEvent)=>{if(!event.data?.pdfCompatResult)return;clearTimeout(timeout);worker.removeEventListener("message",receive);resolve(event.data);};worker.addEventListener("message",receive);worker.postMessage({pdfCompatProbe:true});});
   return{main:{map:typeof Reflect.get(Map.prototype,"getOrInsertComputed"),weakMap:typeof Reflect.get(WeakMap.prototype,"getOrInsertComputed")},worker:{map:workerCapabilities.map,weakMap:workerCapabilities.weakMap},text:content.items.map((item:{str?:string})=>item.str||"").join(" "),rendered:canvas.width>0&&canvas.height>0};
  }finally{worker.terminate();void task.destroy().catch(()=>{});}
 },pdfFixture().toString("base64"));
 expect(result.main).toEqual({map:"function",weakMap:"function"});expect(result.worker).toEqual({map:"function",weakMap:"function"});expect(result.text).toContain("Grounded Robot File Study");expect(result.rendered).toBe(true);expect(errors).toEqual([]);
});
test("第一次导入时无需预加载，PDF 文件能直接提取正文",async({page})=>{const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));await paperDialog(page);await choosePdf(page);await extracted(page);expect(errors).toEqual([]);});
test("主模块首次网络失败后自动换新地址重试，并保留表单输入",async({page})=>{
 const dialog=await paperDialog(page),urls:string[]=[];await dialog.getByLabel("标题",{exact:true}).fill("手工填写的标题");await dialog.getByLabel("大致摘要",{exact:true}).fill("保留我的摘要");await page.route("**/api/paper-pdf-assets/pdf.mjs*",route=>{urls.push(route.request().url());return urls.length===1?route.abort("connectionreset"):route.continue();});await choosePdf(page);await extracted(page);expect(urls).toHaveLength(2);expect(new URL(urls[1]).searchParams.has("retry")).toBe(true);await expect(dialog.getByLabel("标题",{exact:true})).toHaveValue("手工填写的标题");await expect(dialog.getByLabel("大致摘要",{exact:true})).toHaveValue("保留我的摘要");
});
test("Worker 初次下载失败也能自动重试，不留未处理的页面错误",async({page})=>{
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));await paperDialog(page);let requests=0;await page.route("**/api/paper-pdf-assets/worker.mjs*",route=>++requests===1?route.abort("connectionreset"):route.continue());await choosePdf(page);await extracted(page);expect(requests).toBe(2);expect(errors).toEqual([]);
});
test("Worker 接收文档数据后中断仍能重试，原 PDF 字节不会被转移耗尽",async({page})=>{
 await paperDialog(page);let workers=0;await page.route("**/api/paper-pdf-assets/worker.mjs*",async route=>{workers++;if(workers!==1)return route.continue();const response=await route.fetch(),text=await response.text();const prefix='self.addEventListener("message",function(event){if(event.data?.action==="GetDocRequest"){event.stopImmediatePropagation();setTimeout(()=>{throw Error("simulated worker interruption after transfer");},0);}});\n';await route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:prefix+text});});await choosePdf(page);await extracted(page);expect(workers).toBe(2);
});
test("持续失败显示中文说明和重试按钮，恢复连接后不重选文件即可导入",async({page})=>{
 const dialog=await paperDialog(page);await dialog.getByLabel("标题",{exact:true}).fill("保留标题以便重试");await dialog.getByLabel("作者",{exact:true}).fill("User Author");await page.route("**/api/paper-pdf-assets/pdf.mjs*",route=>route.abort("connectionreset"));await choosePdf(page);await expect(dialog.locator(".form-error")).toContainText("PDF 解析组件加载失败");await expect(dialog.locator(".form-error")).not.toContainText("Failed to fetch");await expect(dialog.getByRole("button",{name:"重试导入",exact:true})).toBeEnabled();await expect(dialog.getByLabel("标题",{exact:true})).toHaveValue("保留标题以便重试");await fs.mkdir(visuals,{recursive:true});await page.screenshot({path:path.join(visuals,"pdf-loader-retry-error.png"),animations:"disabled"});await page.unroute("**/api/paper-pdf-assets/pdf.mjs*");await dialog.getByRole("button",{name:"重试导入",exact:true}).click();await extracted(page);await expect(dialog.getByRole("button",{name:"重试导入",exact:true})).toHaveCount(0);await expect(dialog.getByLabel("标题",{exact:true})).toHaveValue("保留标题以便重试");await expect(dialog.getByLabel("作者",{exact:true})).toHaveValue("User Author");await dialog.evaluate(element=>{element.scrollTop=0;});await page.screenshot({path:path.join(visuals,"pdf-loader-recovered.png"),animations:"disabled"});
});
test("关闭窗口会取消组件加载，不在关闭后继续覆盖表单",async({page})=>{
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));const dialog=await paperDialog(page);let release:(()=>void)|undefined;const gate=new Promise<void>(resolve=>{release=resolve;});await page.route("**/api/paper-pdf-assets/pdf.mjs*",async route=>{await gate;await route.abort("connectionreset");});await choosePdf(page);await expect(dialog.getByText("正在解析论文文件…",{exact:true})).toBeVisible();await dialog.getByRole("button",{name:"关闭窗口",exact:true}).click();await expect(dialog).toHaveCount(0);release!();await page.unrouteAll({behavior:"wait"});expect(errors).toEqual([]);
});
