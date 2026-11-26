import { test,after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { droppedLink,parseLink } from "../shared/links";
import { pageScaleValues,validPageScale } from "../shared/pageScale";
import { NextRequest } from "next/server";
import { intentFixture,imageText } from "./intentFixture";
import { validImageDataUrl } from "../server/images";
const directory=path.resolve("work","core-"+Date.now());
process.env.DATA_DIR=directory;
process.env.APP_ORIGIN="http://portal.test";
process.env.COOKIE_SECURE="false";
process.env.AI_ALLOW_LOCAL="true";
delete process.env.AI_BASE_URL;delete process.env.AI_MODEL;delete process.env.AI_API_KEY;
const data=await import("../server/db");
const auth=await import("../server/auth");
const ai=await import("../server/ai");
const web=await import("../server/web");
const route=await import("../app/api/[...segments]/route");
let cookie="",invalidClassification=false,lastSystem="",fixtureCategory="ai",modelCalls=0,lastInputs:unknown=[],visionUnsupported=false,visionUnreadable=false,lastHadImages=false;
const fixture=createServer(async(req,res)=>{
 let text="";for await(const chunk of req)text+=chunk;
 const body=JSON.parse(text);lastSystem=body.messages[0].content;modelCalls++;
 if(lastSystem.includes("意图规划器")){lastHadImages=Array.isArray(body.messages.at(-1).content);if(lastHadImages&&visionUnsupported){res.statusCode=400;res.end('{}');return;}const plan=intentFixture(body);if(visionUnreadable)plan.material="";res.setHeader("Content-Type","application/json");res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(plan)}}]}));return;}
 if(body.stream){res.writeHead(200,{"Content-Type":"text/event-stream"});res.write('data: '+JSON.stringify({choices:[{delta:{content:"你好，"}}]})+'\n\n');res.end('data: '+JSON.stringify({choices:[{delta:{content:"这里是AI 助手。"}}]})+'\n\ndata: [DONE]\n\n');return;}
 if(lastSystem.includes("内容分类器")){
  const inputs=JSON.parse(body.messages.at(-1).content);lastInputs=inputs;
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({items:inputs.map((e:{id:string})=>({id:invalidClassification?"unexpected":e.id,categoryId:fixtureCategory,tags:["AI整理"],summary:"分类后的摘要"}))})}}]}));return;
 }
 res.setHeader("Content-Type","application/json");res.end(JSON.stringify({choices:[{message:{content:"连接成功"}}]}));
});
await new Promise<void>(r=>fixture.listen(0,"127.0.0.1",r));
const port=(fixture.address() as {port:number}).port;
async function request(p:string,method="GET",body?:unknown,admin=false,origin="http://portal.test"){
 const req=new NextRequest("http://portal.test/api/"+p,{method,headers:{"Content-Type":"application/json",...(method!=="GET"?{Origin:origin}:{}),...(admin?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return route.GET(req,{params:Promise.resolve({segments:p.split("?")[0].split("/")})});
}
const privateMarker="PRIVATE-MEMO-DO-NOT-EXPOSE";
let privateId="",bookmarkId="",jobId="";
await test("首次初始化码仅本机存在，公开 session 不返回密钥",async()=>{
 const res=await request("session"),j=await res.json();assert.equal(j.setupNeeded,true);assert.equal(j.admin,false);assert.equal(Object.keys(j).some(k=>/token|key/i.test(k)),false);assert.ok(fs.existsSync(path.join(directory,"setup-token.txt")));
});
await test("错误来源的首次账号请求被拒绝",async()=>{
 const res=await request("login","POST",{username:"tester",password:"Test-only-password-123"} as unknown,false,"https://wrong.example");assert.equal(res.status,403);assert.equal(data.hasAdmin(),false);
});
await test("初始化需要正确本机码，成功后初始化码失效",async()=>{
 const wrong=await request("login","POST",{username:"tester",password:"Test-only-password-123",setupToken:"wrong"});assert.equal(wrong.status,403);
 const token=fs.readFileSync(path.join(directory,"setup-token.txt"),"utf8").trim();
 const res=await request("login","POST",{username:"tester",password:"Test-only-password-123",setupToken:token});
 assert.equal(res.status,200);cookie=res.headers.get("set-cookie")!.split(";")[0];assert.ok(cookie.includes("xingyu_session="));assert.equal(fs.existsSync(path.join(directory,"setup-token.txt")),false);assert.equal(auth.verifyPassword("bad","bad"),false);
});
await test("匿名写入返回401，管理员跨源写入返回403",async()=>{
 assert.equal((await request("entries","POST",{})).status,401);
 assert.equal((await request("entries","POST",{},true,"https://wrong.example")).status,403);
});
await test("私有备忘录和待办强制保持私有",async()=>{
 const res=await request("entries","POST",{...data.emptyEntry("memo"),title:privateMarker,content:"严格私密的正文",visibility:"public",published:true},true);
 assert.equal(res.status,201);const j=await res.json();privateId=j.entry.id;assert.equal(j.entry.visibility,"private");assert.equal(j.entry.published,false);
 const todo=await request("entries","POST",{...data.emptyEntry("todo"),title:"私人计划",relatedId:privateId,visibility:"public",published:true},true);assert.equal(todo.status,201);assert.equal((await todo.json()).entry.visibility,"private");
});
await test("匿名列表和直接ID查询均不能读取私人记录",async()=>{
 const all=await request("entries");const text=await all.text();assert.ok(!text.includes(privateMarker));assert.ok(!text.includes("严格私密"));
 assert.equal((await request("entries/"+privateId)).status,404);
 const memo=await request("entries?kind=memo");assert.equal(memo.status,200);assert.deepEqual((await memo.json()).entries,[]);
 assert.ok((await (await request("entries","GET",undefined,true)).text()).includes(privateMarker));
});
await test("网址去重规范化跟踪参数与片段",async()=>{
 const first=await request("entries","POST",{...data.emptyEntry("bookmark"),title:"分类测试",url:"http://127.0.0.1/fixture?utm_source=test#part",description:"用于本地协议夹具",categoryId:"other"},true);
 assert.equal(first.status,201);bookmarkId=(await first.json()).entry.id;
 const duplicate=await request("entries","POST",{...data.emptyEntry("bookmark"),title:"重复",url:"http://127.0.0.1/fixture"},true);assert.equal(duplicate.status,409);
 assert.equal(data.canonicalUrl("https://example.com/?utm_source=x#fragment"),"https://example.com");
});
await test("严格参数、分类和关联ID校验",async()=>{
 assert.equal((await request("entries","POST",{...data.emptyEntry("bookmark"),title:"异常",url:"javascript:alert(1)"},true)).status,400);
 assert.equal((await request("entries","POST",{...data.emptyEntry("memo"),title:"异常",extra:"不应被接受"},true)).status,400);
 assert.equal((await request("entries","POST",{...data.emptyEntry("todo"),title:"异常",relatedId:"missing"},true)).status,400);
});
await test("并发版本检查拒绝旧版本覆盖",async()=>{
 const e=data.findEntry(privateId)!;const{id,revision,createdAt,updatedAt,...input}=e;void createdAt;void updatedAt;
 assert.equal((await request("entries","PUT",{id,revision,data:{...input,content:"更新后的私密正文"}},true)).status,200);
 assert.equal((await request("entries","PUT",{id,revision,data:{...input,content:"过期的正文"}},true)).status,409);
});
await test("公网提取拒绝环回、私网、元数据与IPv6本地地址",async()=>{
 for(const ip of ["127.0.0.1","10.1.2.3","172.16.0.1","192.168.1.1","169.254.169.254","100.100.100.200","::1","fe80::1","::ffff:127.0.0.1"])assert.equal(web.isPublicAddress(ip),false,ip);
 assert.equal(web.isPublicAddress("8.8.8.8"),true);await assert.rejects(web.extractWeb("http://127.0.0.1/anything"));await assert.rejects(web.extractWeb("https://example.com",0,Date.now()-1));
});
await test("未配置AI时返回503，不伪造分类或对话",async()=>{
 const before=data.findEntry(bookmarkId)!.revision;
 assert.equal((await request("ai/chat","POST",{message:"你好",history:[]})).status,503);
 assert.equal((await request("ai/classify","POST",{ids:[bookmarkId]},true)).status,503);
 assert.equal((await request("ai/classify-draft","POST",{kind:"bookmark",url:"https://example.com"},true)).status,503);
 assert.equal(data.findEntry(bookmarkId)!.revision,before);
});
await test("模型配置密钥加密，读者不能读取配置",async()=>{
 const res=await request("settings/ai","PUT",{baseUrl:"http://127.0.0.1:"+port+"/v1",model:"fixture-model",apiKey:"isolated-test-credential",publicChat:true},true);
 assert.equal(res.status,200);assert.ok(!(await res.text()).includes("isolated-test-credential"));
 assert.ok(!data.getSetting("ai_key")!.includes("isolated-test-credential"));
 assert.equal((await request("settings/ai")).status,401);
 const status=await (await request("ai/status")).json();assert.equal(status.configured,true);assert.equal(status.baseUrl,undefined);
 assert.equal((await request("settings/ai/test","POST",{},true)).status,200);
});
await test("真实SSE协议转发与角色上下文隔离",async()=>{
 const reader=await request("ai/chat","POST",{message:privateMarker,history:[]});const readerText=await reader.text();assert.ok(readerText.includes("你好，"));assert.ok(readerText.includes("这里是AI 助手。"));assert.ok(!lastSystem.includes(privateMarker));
 const admin=await request("ai/chat","POST",{message:privateMarker,history:[]},true);await admin.text();assert.ok(lastSystem.includes(privateMarker));
});
await test("无效AI编号不写入，正常分类事务保存并支持撤销",async()=>{
 invalidClassification=true;const previous=data.findEntry(bookmarkId)!;
 assert.equal((await request("ai/classify","POST",{ids:[bookmarkId]},true)).status,502);assert.equal(data.findEntry(bookmarkId)!.revision,previous.revision);
 invalidClassification=false;const res=await request("ai/classify","POST",{ids:[bookmarkId]},true);assert.equal(res.status,200);jobId=(await res.json()).jobId;assert.equal(data.findEntry(bookmarkId)!.categoryId,"ai");
 assert.equal((await request("ai/undo","POST",{jobId},true)).status,200);assert.equal(data.findEntry(bookmarkId)!.categoryId,"other");
 assert.equal((await request("ai/undo","POST",{jobId},true)).status,409);
});
await test("撤销不会覆盖分类之后的人工修改",async()=>{
 const result=await (await request("ai/classify","POST",{ids:[bookmarkId]},true)).json();
 const e=data.findEntry(bookmarkId)!;const{id,revision,createdAt,updatedAt,...input}=e;void createdAt;void updatedAt;
 data.saveEntry({...input,title:"人工调整后的标题"},id,revision);
 assert.equal((await request("ai/undo","POST",{jobId:result.jobId},true)).status,409);assert.equal(data.findEntry(bookmarkId)!.title,"人工调整后的标题");
});
await test("分类修改和草稿分类必须登录并通过来源校验",async()=>{
 for(const method of ["POST","PUT","DELETE"]){assert.equal((await request("categories",method,{})).status,401);assert.equal((await request("categories",method,{},true,"https://wrong.example")).status,403);}
 assert.equal((await request("ai/classify-draft","POST",{kind:"bookmark",url:"https://example.com"})).status,401);
 assert.equal((await request("ai/classify-draft","POST",{},true,"https://wrong.example")).status,403);
 assert.equal((await request("ai/classify-draft","POST",{kind:"memo",url:"https://example.com"},true)).status,400);
 assert.equal((await request("ai/classify-draft","POST",{kind:"article",url:"javascript:alert(1)"},true)).status,400);
});
await test("管理员创建与重命名分类，重复、超长和过期修改均被拒绝",async()=>{
 assert.equal((await request("categories","POST",{name:""},true)).status,400);
 assert.equal((await request("categories","POST",{name:"x".repeat(31)},true)).status,400);
 assert.equal((await request("categories","POST",{name:"开发工具"},true)).status,409);
 const created=await request("categories","POST",{name:"  机器人研究  "},true);assert.equal(created.status,201);
 const category=(await created.json()).category;assert.equal(category.name,"机器人研究");
 assert.equal((await request("categories","PUT",{id:category.id,name:"机器人",expectedName:"过期名称"},true)).status,409);
 const renamed=await request("categories","PUT",{id:category.id,name:"机器人",expectedName:category.name},true);assert.equal(renamed.status,200);
 assert.ok((await (await request("categories")).json()).categories.some((c:{id:string;name:string})=>c.id===category.id&&c.name==="机器人"));
 assert.equal((await request("categories","PUT",{id:"other",name:"兜底",expectedName:"其他"},true)).status,400);
 assert.equal((await request("categories","DELETE",{id:"other",targetId:category.id,expectedName:"其他"},true)).status,400);
});
await test("删除分类转移内容并提高版本号，保留正文与可见状态",async()=>{
 const category=data.addCategory("待归档资料","memo");
 const saved=data.saveEntry({...data.emptyEntry("memo"),title:"分类转移检查",content:"保留这段私有正文",categoryId:category.id});
 assert.equal((await request("categories","DELETE",{id:category.id,targetId:category.id,expectedName:category.name,kind:"memo"},true)).status,400);
 assert.equal((await request("categories","DELETE",{id:category.id,targetId:"other",expectedName:"过期名称",kind:"memo"},true)).status,409);
 const response=await request("categories","DELETE",{id:category.id,targetId:"other",expectedName:category.name,kind:"memo"},true);assert.equal(response.status,200);assert.equal((await response.json()).movedCount,1);
 const moved=data.findEntry(saved.id)!;assert.equal(moved.categoryId,"other");assert.equal(moved.content,saved.content);assert.equal(moved.visibility,"private");assert.equal(moved.revision,saved.revision+1);
 const{id,revision,createdAt,updatedAt,...oldInput}=saved;void createdAt;void updatedAt;
 assert.equal((await request("entries","PUT",{id,revision,data:oldInput},true)).status,409);
});
await test("删除原始分类后，重新启动模块不会重新添加默认分类",()=>{
 const existing=data.categories().find(c=>c.id==="design")!;data.deleteCategory(existing.id,"other",existing.name);
 const script="const data=await import('./server/db.ts');console.log(JSON.stringify({reappeared:data.categories().some(c=>c.id==='design')}));data.db.close();";
 const text=execFileSync(process.execPath,["--import","tsx","--input-type=module","-e",script],{cwd:process.cwd(),env:process.env,encoding:"utf8",timeout:15000});assert.equal(JSON.parse(text.trim()).reappeared,false);
});
await test("草稿 AI 使用自定义分类，网页读取失败仍可返回建议且不写入记录",async()=>{
 const category=data.addCategory("机器人","article");fixtureCategory=category.id;
 const before=(data.db.prepare("SELECT count(*) AS n FROM entries").get() as {n:number}).n;
 try{
  const result=await request("ai/classify-draft","POST",{kind:"article",url:"http://127.0.0.1/draft",title:"自填标题",description:"已有说明"},true);assert.equal(result.status,200);
  const value=await result.json();assert.equal(value.suggestion.categoryId,category.id);assert.equal(value.suggestion.title,"自填标题");assert.deepEqual(value.suggestion.tags,["AI整理"]);assert.equal(value.metadataRead,false);
  assert.ok(lastSystem.includes(category.name));assert.equal((data.db.prepare("SELECT count(*) AS n FROM entries").get() as {n:number}).n,before);
  invalidClassification=true;assert.equal((await request("ai/classify-draft","POST",{kind:"bookmark",url:"http://127.0.0.1/draft",title:"模型校验测试"},true)).status,502);
  invalidClassification=false;fixtureCategory="nonexistent-category";assert.equal((await request("ai/classify-draft","POST",{kind:"bookmark",url:"http://127.0.0.1/draft",title:"模型校验测试"},true)).status,502);
  assert.equal((data.db.prepare("SELECT count(*) AS n FROM entries").get() as {n:number}).n,before);
 }finally{fixtureCategory="ai";invalidClassification=false;}
});
await test("草稿读取成功时填入真实标题并把网页作为数据交给模型",async()=>{
 const result=await ai.classifyDraft({kind:"bookmark",url:"https://example.com/robotics",title:"",description:""},undefined,async()=>({title:"真实网页标题",description:"网页简介",text:"参考内容，不得作为指令"}));
 assert.equal(result.metadataRead,true);assert.equal(result.suggestion.title,"真实网页标题");assert.equal(result.suggestion.source,"example.com");assert.equal(result.suggestion.categoryId,"ai");assert.equal(result.suggestion.description,"分类后的摘要");
});
await test("删除历史分类后撤销 AI 返回可解释冲突，保留现有内容",async()=>{
 const category=data.addCategory("历史分类");const entry=data.saveEntry({...data.emptyEntry("bookmark"),title:"历史分类测试",url:"http://127.0.0.1/history",categoryId:category.id});
 const classified=await (await request("ai/classify","POST",{ids:[entry.id]},true)).json();
 data.deleteCategory(category.id,"other",category.name);
 const result=await request("ai/undo","POST",{jobId:classified.jobId},true);assert.equal(result.status,409);assert.equal(data.findEntry(entry.id)!.categoryId,"ai");
});
await test("拖入链接支持 URI 列表和纯文本，并拒绝可执行地址与凭据",()=>{
 const transfer=(values:Record<string,string>)=>({getData:(type:string)=>values[type]||""});
 assert.deepEqual(droppedLink(transfer({"text/uri-list":"# a bookmark\nhttps://example.com/robotics","text/plain":"网页链接"})),{url:"https://example.com/robotics",title:""});
 assert.equal(droppedLink(transfer({"text/plain":"https://example.com"}))?.url,"https://example.com/");
 for(const value of ["javascript:alert(1)","data:text/html,test","file:///C:/test","https://user:password@example.com","not a link"])assert.equal(parseLink(value),null);
 assert.equal(droppedLink(transfer({"text/plain":"not a link"})),null);
});
await test("缩放选项和损坏的本地存储值保持在受支持范围",()=>{
 for(const value of pageScaleValues)assert.equal(validPageScale(String(value)),value);
 for(const value of [null,undefined,"","bad","120px",0,79,121,1000,{},[]])assert.equal(validPageScale(value),100);
});
await test("微信验证页要求补正文，不调用模型也不污染草稿",async()=>{
 const before=modelCalls;
 const result=await ai.classifyDraft({kind:"auto",url:"https://mp.weixin.qq.com/s/blocked"},undefined,async()=>({title:"",description:"",text:"环境异常 当前环境异常，完成验证后即可继续访问。 去验证"}));
 assert.equal(result.needsContent,true);assert.equal(result.metadataRead,false);assert.equal(result.acquisition.status,"blocked");assert.equal(result.suggestion.kind,"article");assert.equal(result.suggestion.description,"");assert.deepEqual(result.suggestion.tags,[]);assert.equal(modelCalls,before);
});
await test("提供正文后跳过抓取，聊天和草稿使用相同分类服务",async()=>{
 let reads=0;const reader=async()=>{reads++;throw new Error("不应读取");};
 const url="https://mp.weixin.qq.com/s/provided-material",content="这是机器人领域的一篇公众号文章。它说明了动作控制方法以及真实设备实验的结果。";
 const draft=await ai.classifyDraft({kind:"auto",url,content},undefined,reader);
 const response=await ai.chatResponse(ai.chatInput.parse({message:url+" 帮我分类",material:content}),true,new AbortController().signal,reader);
 const text=await response.text(),events=text.split("\n\n").filter(Boolean).map(line=>JSON.parse(line.slice(6))),chat=events.find(e=>e.organize).organize;
 assert.equal(reads,0);assert.equal(chat.suggestion.kind,"article");assert.deepEqual(chat.suggestion,draft.suggestion);assert.equal(chat.acquisition.source,"provided");assert.equal(JSON.stringify(lastInputs).includes(content),true);
});
await test("聊天准确匹配网址，未命中不混入其他候选，读者不见私人匹配",()=>{
 const entry=data.saveEntry({...data.emptyEntry("article"),url:"https://knowledge.example/exact",title:"唯一精确匹配",content:"已保存的公众号正文"});
 assert.equal(ai.chatContext("https://knowledge.example/absent",true).length,0);
 assert.equal(ai.chatContext("https://knowledge.example/exact?utm_source=test#anchor",true)[0].id,entry.id);
 assert.equal(ai.chatContext("https://knowledge.example/exact",false)[0].id,entry.id);
 assert.equal(ai.chatContext("NEVER_MATCH_A_RECORD_84375839",true).length,0);
});
await test("管理员可读取网页回答，读者链接不触发网页请求",async()=>{
 let reads=0;const reader=async()=>{reads++;return{title:"网页测试标题",description:"公开网页介绍",text:"这段正文来自本次网页查询，包含机器人实验结果。"};};
 const response=await ai.chatResponse(ai.chatInput.parse({message:"读取 https://public.example/read",action:"read"}),true,new AbortController().signal,reader);
 assert.ok((await response.text()).includes("这里是AI 助手"));assert.ok(lastSystem.includes("这段正文来自本次网页查询"));assert.equal(reads,1);
 const publicResponse=await ai.chatResponse(ai.chatInput.parse({message:"https://public.example/read 帮我保存"}),false,new AbortController().signal,reader);
 assert.ok((await publicResponse.text()).includes("管理员登录"));assert.equal(reads,1);
 assert.equal((await request("ai/chat","POST",{message:"读取",action:"read"})).status,403);
 assert.equal((await request("ai/chat","POST",{message:"读取",material:"正文"})).status,403);
 assert.equal((await request("ai/chat","POST",{message:"读取",action:"read"},true,"https://wrong.example")).status,403);
});
await test("已有正文优先复用，分类建议不写入且保留原记录版本",async()=>{
 const entry=data.saveEntry({...data.emptyEntry("bookmark"),title:"已保存站点",url:"https://saved.example/",content:"已保存的有效正文",description:"原摘要"});
 const result=await ai.classifyDraft({kind:"auto",url:entry.url},undefined,async()=>{throw new Error("不应联网");});
 assert.equal(result.existing?.id,entry.id);assert.equal(result.acquisition.source,"saved");assert.equal(result.suggestion.kind,"bookmark");assert.equal(data.findEntry(entry.id)!.revision,entry.revision);assert.equal(data.findEntry(entry.id)!.description,"原摘要");
});
await test("批量没有有效依据时跳过，不把失败提示写入已保存记录",async()=>{
 const entry=data.saveEntry({...data.emptyEntry("article"),title:"127.0.0.1",url:"http://127.0.0.1/no-material",description:"微信页面环境异常，需要验证，未获取正文，无法判断主题。"});
 const result=await ai.classify([entry.id]);assert.equal(result.count,0);assert.equal(result.jobId,"");assert.equal(data.findEntry(entry.id)!.revision,entry.revision);assert.ok(result.notes.length);
});
await test("网站与资讯强制公开、资讯日期取消，旧记录读视图兼容且不改写原数据",async()=>{
 const response=await request("entries","POST",{...data.emptyEntry("article"),title:"统一公开测试",url:"https://public-policy.example/article",visibility:"private",published:false,publishedAt:"2026-01-01"},true);assert.equal(response.status,201);const entry=(await response.json()).entry;assert.equal(entry.visibility,"public");assert.equal(entry.published,true);assert.equal(entry.publishedAt,"");assert.equal((await request("entries/"+entry.id)).status,200);
 data.db.prepare("UPDATE entries SET data=json_set(data,'$.visibility','private','$.published',json('false'),'$.publishedAt','2025-01-01') WHERE id=?").run(entry.id);
 const before=data.db.prepare("SELECT data FROM entries WHERE id=?").get(entry.id);const projected=(await(await request("entries/"+entry.id)).json()).entry;assert.equal(projected.visibility,"public");assert.equal(projected.published,true);assert.equal(projected.publishedAt,"");assert.deepEqual(data.db.prepare("SELECT data FROM entries WHERE id=?").get(entry.id),before);assert.equal((await request("entries/"+privateId)).status,404);
});
const tinyImage={name:"截图.png",dataUrl:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rwAAAABJRU5ErkJggg=="};
await test("图片导入校验类型、尺寸与数量，拒绝伪装和超大输入",async()=>{
 assert.equal(validImageDataUrl(tinyImage.dataUrl),true);assert.equal(validImageDataUrl("data:image/png;base64,"+Buffer.from("not an image").toString("base64")),false);assert.equal(validImageDataUrl("data:image/svg+xml;base64,PHN2Zy8+"),false);
 const bomb=Buffer.from(tinyImage.dataUrl.split(',')[1],"base64");bomb.writeUInt32BE(100000,16);assert.equal(validImageDataUrl("data:image/png;base64,"+bomb.toString("base64")),false);
 assert.equal((await request("ai/chat","POST",{message:"分析",images:Array(4).fill(tinyImage)},true)).status,400);
 assert.equal((await request("ai/chat","POST",{message:"分析",images:[{...tinyImage,dataUrl:"https://example.com/a.png"}]},true)).status,400);
});
await test("聊天用提示词判断意图，图片经多模态输入生成分类草稿且不保存原图",async()=>{
 const before=data.listEntries(true).length;const url="https://mp.weixin.qq.com/s/vision-classify";
 const response=await ai.chatResponse(ai.chatInput.parse({message:url+" 根据图片帮我分类",images:[tinyImage]}),true,new AbortController().signal,async()=>{throw new Error("不应抓取");});
 const text=await response.text(),events=text.split("\n\n").filter(Boolean).map(s=>JSON.parse(s.slice(6))),result=events.find(e=>e.organize)?.organize;
 assert.equal(lastHadImages,true);assert.equal(result.suggestion.kind,"article");assert.equal(result.acquisition.source,"image");assert.equal(result.suggestion.content,imageText);assert.equal(result.suggestion.categoryId,"ai");assert.equal(text.includes("data:image"),false);assert.equal(data.listEntries(true).length,before);
 const analysis=await request("ai/chat","POST",{message:"分析图片",images:[tinyImage]});assert.equal(analysis.status,200);assert.ok((await analysis.text()).includes("机械臂实验"));
});
await test("表单截图分类与聊天共用识别服务；不支持视觉时明确失败且不改记录",async()=>{
 const result=await ai.classifyDraft({kind:"article",url:"https://mp.weixin.qq.com/s/form-image",images:[tinyImage]},undefined,async()=>{throw new Error("不应抓取");});assert.equal(result.acquisition.source,"image");assert.equal(result.suggestion.content,imageText);assert.equal(result.suggestion.categoryId,"ai");
 visionUnsupported=true;try{const response=await request("ai/classify-draft","POST",{kind:"article",url:"https://mp.weixin.qq.com/s/reject-image",images:[tinyImage]},true);assert.equal(response.status,502);assert.match((await response.json()).error,/未接受图片输入/);}finally{visionUnsupported=false;}
});
await test("自然语言读取意图不生成保存卡片，粘贴正文无需单独操作开关",async()=>{
 const response=await ai.chatResponse(ai.chatInput.parse({message:"https://public.example/natural 请总结网页\n正文：这里是用户粘贴的真实原文内容。"}),true,new AbortController().signal,async()=>{throw new Error("有正文时不应抓取");});const text=await response.text();assert.ok(text.includes("这里是AI 助手"));assert.equal(text.includes('"organize"'),false);
});
await test("不可识别的分类图片不会退回网址猜测或生成保存卡片",async()=>{
 visionUnreadable=true;const calls=modelCalls;try{const response=await ai.chatResponse(ai.chatInput.parse({message:"https://mp.weixin.qq.com/s/unreadable 图片帮我分类",images:[tinyImage]}),true,new AbortController().signal);const text=await response.text();assert.ok(text.includes("没有足够的可识别内容"));assert.equal(text.includes('"organize"'),false);assert.equal(modelCalls,calls+1);}finally{visionUnreadable=false;}
});
await test("分类API按页面隔离，读者不能取得私人分类，AI越界分类被拒绝",async()=>{
 const web=await request("categories","POST",{kind:"bookmark",name:"只属于网页"},true),webCategory=(await web.json()).category;assert.equal(web.status,201);
 const paper=await request("categories","POST",{kind:"paper",name:"只属于网页"},true);assert.equal(paper.status,201);
 const publicLists=await(await request("categories")).json();assert.ok(publicLists.byKind.bookmark.some((c:{id:string})=>c.id===webCategory.id));assert.equal(publicLists.byKind.article.some((c:{id:string})=>c.id===webCategory.id),false);assert.deepEqual(publicLists.byKind.memo,[]);assert.equal((await request("categories?kind=memo")).status,401);
 assert.equal((await request("categories","PUT",{kind:"article",id:webCategory.id,name:"误操作",expectedName:webCategory.name},true)).status,404);
 const entriesBefore=data.listEntries(true);fixtureCategory=webCategory.id;try{const response=await request("ai/classify-draft","POST",{kind:"article",url:"http://127.0.0.1/scoped-check",title:"真实输入标题",description:"用于验证服务端拒绝另一页分类的摘要内容"},true);assert.equal(response.status,502);assert.deepEqual(data.listEntries(true),entriesBefore);}finally{fixtureCategory="ai";}
});

await test("额度限制在数据库中生效",()=>{
 data.consumeLimit("fixture-limit",2,60000);data.consumeLimit("fixture-limit",2,60000);
 assert.throws(()=>data.consumeLimit("fixture-limit",2,60000));
});
await test("一致性备份可重新打开并保留私人记录",()=>{
 const dest=path.join(directory,"copy.sqlite");data.db.prepare("VACUUM INTO ?").run(dest);
 const copy=new DatabaseSync(dest);assert.ok(copy.prepare("SELECT id FROM entries WHERE id=?").get(privateId));assert.ok(copy.prepare("PRAGMA integrity_check").get());copy.close();
});
await test("删除关联记录清理待办关联，退出登录使原Cookie失效",async()=>{
 const memo=data.findEntry(privateId)!;assert.equal((await request("entries","DELETE",{id:privateId,revision:memo.revision},true)).status,200);
 assert.equal(data.listEntries(true).find(e=>e.kind==="todo"&&e.title==="私人计划")?.relatedId,"");
 assert.equal((await request("logout","POST",{},true)).status,200);
 assert.equal((await (await request("session","GET",undefined,true)).json()).admin,false);
 assert.equal((await request("entries","POST",{},true)).status,401);
});
after(async()=>{await new Promise<void>(r=>fixture.close(()=>r()));data.db.close();});
