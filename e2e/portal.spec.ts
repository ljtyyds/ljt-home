import { test,expect,type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer,type Server } from "node:http";
import {intentFixture,imageText} from "../tests/intentFixture";
const visuals="test-results/qa/portal.spec";
const password="Browser-fixture-password-123";
let model:Server,modelPort=0,privateMemoId="",privateBookmarkId="",preferredCategory="ai",invalidDraftResult=false,draftDelayMs=0,visionUnsupported=false;
const browserErrors:string[]=[];
test.describe.configure({mode:"serial"});
test.beforeAll(async()=>{
 model=createServer(async(req,res)=>{let text="";for await(const chunk of req)text+=chunk;const data=JSON.parse(text);
 if(data.messages[0].content.includes("意图规划器")){if(visionUnsupported&&Array.isArray(data.messages.at(-1).content)){res.statusCode=400;res.end("{}");return;}res.setHeader("Content-Type","application/json");res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(intentFixture(data))}}]}));return;}
 if(data.stream){res.writeHead(200,{"Content-Type":"text/event-stream"});res.write('data: '+JSON.stringify({choices:[{delta:{content:"你好，我是AI 助手。"}}]})+'\n\n');res.end('data: '+JSON.stringify({choices:[{delta:{content:"我会依据当前身份允许访问的资料回答。"}}]})+'\n\ndata: [DONE]\n\n');return;}
 const classify=data.messages[0].content.includes("内容分类器");
 if(classify&&draftDelayMs&&JSON.parse(data.messages.at(-1).content).some((entry:{id:string})=>entry.id==="draft"))await new Promise(resolve=>setTimeout(resolve,draftDelayMs));
 const content=classify?JSON.stringify({items:JSON.parse(data.messages.at(-1).content).map((e:{id:string;kind:string;url:string;title:string})=>({id:invalidDraftResult&&e.id==="draft"?"unexpected":e.id,kind:e.kind==="auto"?(/mp\.weixin|\/articles?\//.test(e.url)?"article":"bookmark"):e.kind,title:e.title||"机器人研究进展",categoryId:preferredCategory,tags:["模型协议测试"],summary:"使用已保存信息整理的摘要"}))}):"连接成功";
 res.setHeader("Content-Type","application/json");res.end(JSON.stringify({choices:[{message:{content}}]}));
 });await new Promise<void>(r=>model.listen(0,"127.0.0.1",r));modelPort=(model.address() as {port:number}).port;await fs.mkdir(visuals,{recursive:true});
});
test.afterAll(async()=>{await new Promise<void>(r=>model.close(()=>r()));});
async function login(page:Page){
 await page.getByRole("button",{name:"管理员登录",exact:true}).click();
 await page.getByLabel("用户名",{exact:true}).fill("portal-admin");await page.getByLabel("密码",{exact:true}).fill(password);
 await page.getByRole("button",{name:"进入管理工作区",exact:true}).click();
 await expect(page.getByRole("button",{name:"个人备忘录",exact:true})).toBeVisible();
}
function record(page:Page){page.on("pageerror",e=>browserErrors.push(e.message));}
test("完整管理流程：初始化、收藏、自动保存、Markdown和关联待办",async({page})=>{
 record(page);await page.goto("/");await expect(page).toHaveTitle(/个人知识门户/);await expect(page.getByRole("heading",{name:"关注网站",exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"GitHub",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"管理员登录",exact:true}).click();
 await page.getByLabel("初始化码",{exact:true}).fill((await fs.readFile(path.join(process.env.E2E_DATA_DIR!,"setup-token.txt"),"utf8")).trim());
 await page.getByLabel("用户名",{exact:true}).fill("portal-admin");await page.getByLabel("密码",{exact:true}).fill(password);
 await page.getByRole("button",{name:"创建并进入管理",exact:true}).click();
 await expect(page.getByRole("button",{name:"个人备忘录",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"新增网站",exact:true}).click();
 await page.getByLabel("标题",{exact:true}).fill("PUBLIC-BOOKMARK-FIXTURE");
 await page.getByLabel("网址",{exact:true}).fill("http://127.0.0.1/private-fixture");
 await page.getByRole("button",{name:"保存",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
 const all=(await(await page.request.get("/api/entries")).json()).entries;
 privateBookmarkId=all.find((e:{title:string})=>e.title==="PUBLIC-BOOKMARK-FIXTURE").id;
 await page.getByRole("button",{name:"个人备忘录",exact:true}).click();
 await page.getByRole("button",{name:"新增备忘录",exact:true}).click();
 await page.getByLabel("标题",{exact:true}).fill("PRIVATE-MEMO-FIXTURE");
 await page.getByLabel("备忘录正文").fill("# 私人研究计划\n\n- 自动保存需要生效\n- 测试 **Markdown**");
 await expect(page.getByText(/已保存 \d/)).toBeVisible({timeout:10000});
 await page.getByRole("button",{name:"预览",exact:true}).click();await expect(page.getByRole("heading",{name:"私人研究计划",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"关闭",exact:true}).click();
 const memos=(await(await page.request.get("/api/entries?kind=memo")).json()).entries;
 privateMemoId=memos.find((e:{title:string})=>e.title==="PRIVATE-MEMO-FIXTURE").id;
 await page.reload();await page.getByRole("button",{name:"个人备忘录",exact:true}).click();await expect(page.getByRole("heading",{name:"PRIVATE-MEMO-FIXTURE",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"待办事项",exact:true}).click();await page.getByRole("button",{name:"新增待办",exact:true}).click();
 await page.getByLabel("标题",{exact:true}).fill("阅读并整理机器人资料");
 await page.getByLabel("关联记录",{exact:true}).selectOption(privateMemoId);
 await page.getByLabel("优先级",{exact:true}).selectOption("high");
 await page.getByRole("button",{name:"保存",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
 await page.getByRole("button",{name:"完成 阅读并整理机器人资料",exact:true}).click();
 await expect(page.locator(".todo-column.done")).toContainText("阅读并整理机器人资料");
 await page.getByRole("button",{name:"关注网站",exact:true}).click();
 await page.getByLabel("搜索内容").fill("PUBLIC-BOOKMARK");await expect(page.locator(".bookmark-card")).toHaveCount(1);
 await page.getByLabel("搜索内容").fill("");await page.getByRole("button",{name:"退出管理",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"确认退出管理员模式？"})).toBeVisible();
 await page.getByRole("button",{name:"取消",exact:true}).click();expect((await(await page.request.get("/api/session")).json()).admin).toBe(true);
 await page.getByRole("button",{name:"退出管理",exact:true}).click();await page.getByRole("button",{name:"确认退出",exact:true}).click();
 await expect(page.getByRole("button",{name:"管理员登录",exact:true})).toBeVisible();await expect(page.getByRole("link",{name:"PUBLIC-BOOKMARK-FIXTURE",exact:true})).toBeVisible();
});
test("读者隐私、搜索筛选、未配置AI提示和桌面手机布局",async({page})=>{
 record(page);await page.goto("/");await expect(page.getByRole("link",{name:"GitHub",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"个人备忘录",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"待办事项",exact:true})).toHaveCount(0);
 const list=await(await page.request.get("/api/entries")).text();expect(list).not.toContain("PRIVATE-");expect((await page.request.get("/api/entries/"+privateMemoId)).status()).toBe(404);expect((await page.request.get("/api/entries/"+privateBookmarkId)).status()).toBe(200);
 expect((await page.request.post("/api/entries",{headers:{Origin:"http://127.0.0.1:3100"},data:{}})).status()).toBe(401);
 await page.getByRole("button",{name:"人工智能",exact:true}).click();await expect(page.locator(".bookmark-card")).toHaveCount(1);
 await page.getByRole("button",{name:"全部",exact:true}).click();await page.getByLabel("搜索内容").fill("MDN");await expect(page.locator(".bookmark-card")).toHaveCount(1);
 await page.getByRole("button",{name:"清空搜索"}).click();
 await page.screenshot({path:path.join(visuals,"portal-desktop.png"),fullPage:false});
 await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();await page.getByLabel("发送给AI 助手的消息").fill("你好");await page.getByRole("button",{name:"发送消息",exact:true}).click();
 await expect(page.getByRole("alert").filter({hasText:"AI 助手尚未配置"})).toBeVisible();
 await page.getByRole("button",{name:"关闭对话"}).click();await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole("button",{name:"展开导航"})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await expect.poll(()=>page.locator(".sidebar").evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
 await page.screenshot({path:path.join(visuals,"portal-mobile.png"),fullPage:false,animations:"disabled"});
 await page.getByRole("button",{name:"展开导航"}).click();await page.getByRole("button",{name:"行业前沿",exact:true}).click();await expect(page.getByRole("heading",{name:"行业前沿",exact:true})).toBeVisible();
});
test("模型协议接入、流式对话、批量分类撤销和删除",async({page})=>{
 record(page);await page.goto("/");await login(page);
 await page.getByRole("button",{name:"设置",exact:true}).click();
 await page.getByLabel("API 基础地址",{exact:true}).fill("http://127.0.0.1:"+modelPort+"/v1");
 await page.getByLabel("模型名称",{exact:true}).fill("local-protocol-fixture");
 await page.getByLabel("API 密钥",{exact:true}).fill("test-fixture-only");
 await page.getByRole("button",{name:"保存设置",exact:true}).click();await expect(page.getByRole("status")).toContainText("模型设置已保存");
 await page.getByRole("button",{name:"测试已保存的连接",exact:true}).click();await expect(page.getByRole("status")).toContainText("连接成功");
 await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();await page.getByLabel("发送给AI 助手的消息").fill("你好");await page.getByRole("button",{name:"发送消息",exact:true}).click();
 await expect(page.locator(".chat-message.assistant")).toContainText("依据当前身份允许访问的资料");
 await page.getByRole("button",{name:"关闭对话"}).click();
 await page.getByRole("button",{name:"关注网站",exact:true}).click();await page.getByRole("button",{name:"选择 PUBLIC-BOOKMARK-FIXTURE",exact:true}).click();
 await page.getByRole("button",{name:"AI 一键分类",exact:true}).click();await expect(page.getByRole("status")).toContainText("已整理 1 条记录",{timeout:15000});
 await page.getByRole("button",{name:"撤销上次 AI 分类"}).click();await expect(page.getByRole("status")).toContainText("已恢复");
 await page.getByRole("button",{name:"个人备忘录",exact:true}).click();
 page.once("dialog",d=>void d.accept());await page.getByRole("button",{name:"删除 PRIVATE-MEMO-FIXTURE",exact:true}).click();await expect(page.locator(".memo-card")).toHaveCount(0);
 await page.getByRole("button",{name:"待办事项",exact:true}).click();await expect(page.locator(".related-link")).toHaveCount(0);
 await page.screenshot({path:path.join(visuals,"portal-admin.png"),fullPage:false});
 expect(browserErrors).toEqual([]);
});

test("本地背景持久化、菜单关闭、AI 助手与退出确认",async({page})=>{
 record(page);
 const relevantErrors:string[]=[];
 page.on("console",message=>{if(message.type()==="error")relevantErrors.push(message.text());});
 await page.goto("/");await login(page);
 await expect(page.locator(".brand")).toHaveText("个人知识门户");
 await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"AI 助手助手",exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"你好，我是AI 助手。",exact:true})).toBeVisible();
 await expect(page.getByLabel("发送给AI 助手的消息")).toBeVisible();
 await page.getByRole("button",{name:"关闭对话",exact:true}).click();
 const toggle=page.getByRole("button",{name:"切换背景",exact:true}),panel=page.getByRole("region",{name:"背景设置",exact:true});
 await toggle.click();await expect(panel).toBeVisible();
 await page.getByRole("button",{name:"夜间星海",exact:true}).click();await expect(panel).toBeVisible();
 await expect(page.locator("html")).toHaveAttribute("data-theme","night");
 await page.getByRole("heading",{name:"关注网站",exact:true}).click();await expect(panel).toHaveCount(0);
 await toggle.click();await page.keyboard.press("Escape");await expect(panel).toHaveCount(0);
 await expect(toggle).toBeFocused();await toggle.click();
 await page.getByRole("button",{name:"行业前沿",exact:true}).click();await expect(panel).toHaveCount(0);
 await expect(page.getByRole("heading",{name:"行业前沿",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"关注网站",exact:true}).click();await toggle.click();
 const file=page.getByLabel("选择本地背景文件",{exact:true});
 await file.setInputFiles({name:"unsupported.txt",mimeType:"text/plain",buffer:Buffer.from("invalid")});
 await expect(panel.getByRole("alert")).toContainText("请选择 JPG");
 await file.setInputFiles({name:"corrupt.png",mimeType:"image/png",buffer:Buffer.from("invalid")});
 await expect(panel.getByRole("alert")).toContainText("无法读取此文件");
 const png=await page.evaluate(()=>{const canvas=document.createElement("canvas");canvas.width=960;canvas.height=640;const ctx=canvas.getContext("2d")!;const gradient=ctx.createLinearGradient(0,0,960,640);gradient.addColorStop(0,"#143b59");gradient.addColorStop(.5,"#348c8e");gradient.addColorStop(1,"#849fba");ctx.fillStyle=gradient;ctx.fillRect(0,0,960,640);ctx.fillStyle="rgba(240,255,255,.6)";for(let i=0;i<40;i++){ctx.beginPath();ctx.arc((i*73)%960,(i*47)%640,1+(i%3),0,Math.PI*2);ctx.fill();}return canvas.toDataURL("image/png").split(",")[1];});
 await file.setInputFiles({name:"local-wallpaper.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
 await expect(panel.getByRole("button",{name:/正在使用本地背景/})).toBeVisible();
 await expect(page.locator("img.custom-wallpaper")).toBeVisible();
 expect(await page.locator("img.custom-wallpaper").evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(960);
 await page.getByRole("heading",{name:"关注网站",exact:true}).click();await page.reload();
 await expect(page.locator("img.custom-wallpaper")).toBeVisible();
 await toggle.click();await expect(panel).toContainText("local-wallpaper.png");
 await page.getByRole("button",{name:"安静素色",exact:true}).click();await expect(page.locator(".custom-wallpaper")).toHaveCount(0);
 await page.reload();await toggle.click();await expect(page.getByRole("button",{name:/使用已导入背景/})).toBeVisible();
 await page.getByRole("button",{name:/使用已导入背景/}).click();await expect(page.locator("img.custom-wallpaper")).toBeVisible();
 await page.getByRole("button",{name:"夜间星海",exact:true}).click();
 // Small self-generated VP8/WebM fixture; no network or recording dependency.
 const video=await fs.readFile(path.join("e2e","fixtures","local-motion.webm"));
 await file.setInputFiles({name:"local-motion.webm",mimeType:"video/webm",buffer:Buffer.from(video)});
 await expect(page.locator("video.custom-wallpaper")).toBeVisible();
 await expect.poll(()=>page.locator("video.custom-wallpaper").evaluate(el=>(el as HTMLVideoElement).paused)).toBe(false);
 await page.getByRole("switch",{name:"动态效果",exact:true}).uncheck();
 await expect.poll(()=>page.locator("video.custom-wallpaper").evaluate(el=>(el as HTMLVideoElement).paused)).toBe(true);
 await page.reload();await expect(page.locator("video.custom-wallpaper")).toBeVisible();
 await expect.poll(()=>page.locator("video.custom-wallpaper").evaluate(el=>(el as HTMLVideoElement).paused)).toBe(true);
 await toggle.click();await page.getByRole("switch",{name:"动态效果",exact:true}).check();
 await expect.poll(()=>page.locator("video.custom-wallpaper").evaluate(el=>(el as HTMLVideoElement).paused)).toBe(false);
 await file.setInputFiles({name:"local-wallpaper.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
 await expect(page.locator("img.custom-wallpaper")).toBeVisible();
 await page.screenshot({path:path.join(visuals,"portal-background-import.png"),animations:"disabled"});
 await page.getByRole("heading",{name:"关注网站",exact:true}).click();
 await page.getByRole("button",{name:"管理员模式",exact:true}).click();
 const exit=page.getByRole("dialog",{name:"确认退出管理员模式？",exact:true});await expect(exit).toBeVisible();
 await page.getByRole("button",{name:"取消",exact:true}).click();
 expect((await(await page.request.get("/api/session")).json()).admin).toBe(true);
 await page.getByRole("button",{name:"退出管理",exact:true}).click();await page.keyboard.press("Escape");await expect(exit).toHaveCount(0);
 expect((await(await page.request.get("/api/session")).json()).admin).toBe(true);
 await page.getByRole("button",{name:"管理员模式",exact:true}).click();
 await page.screenshot({path:path.join(visuals,"portal-logout-confirm.png"),animations:"disabled"});
 await page.getByRole("button",{name:"确认退出",exact:true}).click();
 await expect(page.getByRole("button",{name:"读者模式",exact:true})).toBeVisible();
 expect((await(await page.request.get("/api/session")).json()).admin).toBe(false);
 await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"展开导航",exact:true}).click();await toggle.click();
 await expect(panel).toBeVisible();
 expect(await panel.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:path.join(visuals,"portal-background-mobile.png"),animations:"disabled"});
 await page.getByRole("button",{name:"关闭导航",exact:true}).click({position:{x:370,y:400}});
 await expect(panel).toHaveCount(0);
 await expect.poll(()=>page.locator(".sidebar").evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
 expect(relevantErrors).toEqual([]);expect(browserErrors).toEqual([]);
});

test("自定义分类、拖入链接AI分类、手动保存及分类转移",async({page})=>{
 record(page);await page.goto("/");await login(page);await page.getByRole("button",{name:"设置",exact:true}).click();
 const manager=page.getByRole("region",{name:"分类管理",exact:true});await expect(manager).toBeVisible();
 await manager.getByLabel("新分类名称",{exact:true}).fill("机器人实测");await manager.getByRole("button",{name:"新增分类",exact:true}).click();
 await expect(manager).toContainText("机器人实测");
 await manager.getByRole("button",{name:"重命名 机器人实测",exact:true}).click();
 await manager.getByLabel("重命名分类 机器人实测",{exact:true}).fill("机器人资料");await manager.getByRole("button",{name:"保存分类名称",exact:true}).click();await expect(manager).toContainText("机器人资料");
 const categories=(await(await page.request.get("/api/categories")).json()).categories;const category=categories.find((c:{name:string})=>c.name==="机器人资料");preferredCategory=category.id;
 await manager.getByRole("button",{name:"管理行业前沿分类",exact:true}).click();await manager.getByLabel("新分类名称",{exact:true}).fill("机器人资讯");await manager.getByRole("button",{name:"新增分类",exact:true}).click();await expect(manager).toContainText("机器人资讯");const newsCategory=(await(await page.request.get("/api/categories?kind=article")).json()).categories.find((c:{name:string})=>c.name==="机器人资讯");await manager.getByRole("button",{name:"管理关注网站分类",exact:true}).click();
 await page.screenshot({path:path.join(visuals,"portal-custom-categories.png"),animations:"disabled"});
 await page.getByRole("button",{name:"关注网站",exact:true}).click();await expect(page.getByRole("button",{name:"机器人资料",exact:true})).toBeVisible();
 const countBefore=(await(await page.request.get("/api/entries")).json()).entries.length;
 const transfer=await page.evaluateHandle(()=>{const data=new DataTransfer();data.setData("text/uri-list","http://127.0.0.1/e2e-drag-bookmark");data.setData("text/plain","http://127.0.0.1/e2e-drag-bookmark");return data;});
 await page.getByRole("region",{name:"拖入链接新增内容",exact:true}).dispatchEvent("drop",{dataTransfer:transfer});await transfer.dispose();
 const editor=page.getByRole("dialog",{name:"新增关注网站",exact:true});await expect(editor).toBeVisible();
 await expect(editor.getByLabel("网址",{exact:true})).toHaveValue("http://127.0.0.1/e2e-drag-bookmark");
 await editor.getByLabel("标题",{exact:true}).fill("拖入网站的标题");await editor.getByRole("button",{name:"AI 识别并分类",exact:true}).click();await expect(editor.getByRole("status")).toContainText("已有标题和摘要",{timeout:15000});
 await expect(editor.getByLabel("分类",{exact:true})).toHaveValue(category.id);await expect(editor.getByLabel("标题",{exact:true})).toHaveValue("拖入网站的标题");
 expect((await(await page.request.get("/api/entries")).json()).entries.length).toBe(countBefore);
 await editor.getByLabel("标题",{exact:true}).fill("拖入链接后整理的网站");await expect(editor.getByLabel("可见范围",{exact:true})).toHaveCount(0);await expect(editor.getByLabel("发布状态",{exact:true})).toHaveCount(0);
 await page.screenshot({path:path.join(visuals,"portal-draft-ai-classification.png"),animations:"disabled"});
 await editor.getByRole("button",{name:"保存",exact:true}).click();await expect(editor).toHaveCount(0);
 await page.getByRole("button",{name:"机器人资料",exact:true}).click();await expect(page.getByRole("link",{name:"拖入链接后整理的网站",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"行业前沿",exact:true}).click();
 preferredCategory=newsCategory.id;const articleTransfer=await page.evaluateHandle(()=>{const data=new DataTransfer();data.setData("text/uri-list","http://127.0.0.1/manual-article");return data;});await page.getByRole("region",{name:"拖入链接新增内容",exact:true}).dispatchEvent("drop",{dataTransfer:articleTransfer});await articleTransfer.dispose();
 const articleDraft=page.getByRole("dialog",{name:"新增行业前沿",exact:true});await articleDraft.getByLabel("标题",{exact:true}).fill("拖入资讯的标题");await articleDraft.getByRole("button",{name:"AI 识别并分类",exact:true}).click();await expect(articleDraft.getByRole("status")).toContainText("已有标题和摘要");await expect(articleDraft.getByLabel("分类",{exact:true})).toHaveValue(newsCategory.id);await articleDraft.getByRole("button",{name:"手动填写",exact:true}).click();
 const manual=page.getByRole("dialog",{name:"新增行业前沿",exact:true});await manual.getByLabel("网址",{exact:true}).fill("http://127.0.0.1/manual-article");await manual.getByLabel("标题",{exact:true}).fill("手动录入的资讯");await manual.getByLabel("简介 / 摘要",{exact:true}).fill("手动模式继续可用");await manual.getByLabel("分类",{exact:true}).selectOption(newsCategory.id);await manual.getByRole("button",{name:"保存",exact:true}).click();await expect(manual).toHaveCount(0);
 await page.getByRole("button",{name:"新增资讯",exact:true}).click();const fallback=page.getByRole("dialog",{name:"新增行业前沿",exact:true});await fallback.getByLabel("标题",{exact:true}).fill("AI失败仍可手动保存");await fallback.getByLabel("网址",{exact:true}).fill("http://127.0.0.1/failure-article");await fallback.getByLabel("简介 / 摘要",{exact:true}).fill("保留人工输入的说明");
 await fallback.getByRole("button",{name:"AI 辅助分类",exact:true}).click();draftDelayMs=600;
 try{await fallback.getByRole("button",{name:"AI 识别并分类",exact:true}).click();await fallback.getByLabel("标题",{exact:true}).fill("处理期间的新标题");await expect(fallback.getByRole("status")).toContainText("未覆盖草稿");await expect(fallback.getByLabel("标题",{exact:true})).toHaveValue("处理期间的新标题");}finally{draftDelayMs=0;}
 await fallback.getByLabel("标题",{exact:true}).fill("AI失败仍可手动保存");invalidDraftResult=true;
 try{await fallback.getByRole("button",{name:"AI 识别并分类",exact:true}).click();await expect(fallback.getByRole("alert")).toContainText("草稿未修改");}finally{invalidDraftResult=false;}
 await expect(fallback.getByLabel("标题",{exact:true})).toHaveValue("AI失败仍可手动保存");await expect(fallback.getByLabel("简介 / 摘要",{exact:true})).toHaveValue("保留人工输入的说明");await fallback.getByRole("button",{name:"手动填写",exact:true}).click();await fallback.getByRole("button",{name:"保存",exact:true}).click();await expect(fallback).toHaveCount(0);
 await page.getByRole("button",{name:"设置",exact:true}).click();await manager.getByRole("button",{name:"删除分类 机器人资料",exact:true}).click();const deletion=page.getByRole("dialog",{name:"删除分类：机器人资料",exact:true});await expect(deletion).toContainText("1 条内容");await deletion.getByRole("button",{name:"确认删除分类",exact:true}).click();await expect(deletion).toHaveCount(0);await expect(manager.getByRole("button",{name:"删除分类 机器人资料",exact:true})).toHaveCount(0);
 const saved=(await(await page.request.get("/api/entries")).json()).entries;expect(saved.find((e:{title:string})=>e.title==="拖入链接后整理的网站").categoryId).toBe("other");expect(saved.find((e:{title:string})=>e.title==="手动录入的资讯").categoryId).toBe(newsCategory.id);preferredCategory="ai";
 await page.reload();expect((await(await page.request.get("/api/categories")).json()).categories.some((c:{id:string})=>c.id===category.id)).toBe(false);expect(browserErrors).toEqual([]);
});
test("聊天链接自动识别、共用正文分类、保存同步及管理员网页读取",async({page})=>{
 record(page);const errors:string[]=[];page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});await page.goto("/");await login(page);
 await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();const chat=page.getByRole("dialog",{name:"AI 助手助手",exact:true});
 await expect(chat.getByLabel("助手链接操作",{exact:true})).toHaveCount(0);await expect(chat.getByRole("button",{name:"补充正文",exact:true})).toHaveCount(0);
 await chat.getByLabel("发送给AI 助手的消息",{exact:true}).fill("https://mp.weixin.qq.com/s/chat-shared-test 帮我整理分类\n正文：机器人研究进展：这篇文章介绍了视觉动作模型在真实机器人上的实验结果，并比较不同方法的动作延迟。");await chat.getByRole("button",{name:"发送消息",exact:true}).click();
 const card=chat.getByRole("region",{name:"链接整理草稿",exact:true}).last();try{await expect(card.getByLabel("草稿保存位置",{exact:true})).toHaveValue("article",{timeout:30000});}catch(e){throw new Error(String(e)+"; pageErrors="+JSON.stringify(browserErrors)+"; assistant="+await chat.innerText());}await expect(card).toContainText("使用你提供的正文");
 await expect(card.getByLabel("草稿分类",{exact:true})).toHaveValue("ai");await expect(card).toContainText("使用已保存信息整理的摘要");
 await page.screenshot({path:path.join(visuals,"assistant-shared-draft.png"),animations:"disabled"});
 await card.getByRole("button",{name:"保存为行业前沿",exact:true}).click();await expect(card.getByRole("button",{name:"已保存",exact:true})).toBeDisabled();
 const created=(await(await page.request.get("/api/entries")).json()).entries.find((e:{url:string})=>e.url==="https://mp.weixin.qq.com/s/chat-shared-test");expect(created.kind).toBe("article");expect(created.content).toContain("真实机器人");expect(created.visibility).toBe("public");expect(created.published).toBe(true);
 await chat.getByRole("button",{name:"关闭对话",exact:true}).click();await page.getByRole("button",{name:"行业前沿",exact:true}).click();await expect(page.getByRole("link",{name:"机器人研究进展",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();await chat.getByLabel("发送给AI 助手的消息",{exact:true}).fill("https://mp.weixin.qq.com/s/chat-shared-test 读取这篇文章");await chat.getByRole("button",{name:"发送消息",exact:true}).click();await expect(chat.locator(".chat-message.assistant").last()).toContainText("我会依据当前身份");
 await chat.getByLabel("发送给AI 助手的消息",{exact:true}).fill("https://tools.example/ 帮我分类\n正文：这是一个提供机器人开发工具、文档和示例的网站首页。");await chat.getByRole("button",{name:"发送消息",exact:true}).click();await expect(card.getByLabel("草稿保存位置",{exact:true})).toHaveValue("bookmark");
 await page.setViewportSize({width:390,height:844});await page.getByLabel("页面缩放比例",{exact:true}).selectOption("120");const bounds=await chat.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(391);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(845);const saveButton=card.getByRole("button",{name:"保存为关注网站",exact:true});await saveButton.scrollIntoViewIfNeeded();await expect(saveButton).toBeVisible();const buttonBounds=await saveButton.boundingBox(),bodyBounds=await chat.locator(".chat-body").boundingBox();expect(buttonBounds!.y).toBeGreaterThanOrEqual(bodyBounds!.y);expect(buttonBounds!.y+buttonBounds!.height).toBeLessThanOrEqual(bodyBounds!.y+bodyBounds!.height+1);await page.screenshot({path:path.join(visuals,"assistant-mobile-draft.png"),animations:"disabled"});
 expect(errors).toEqual([]);expect(browserErrors).toEqual([]);
});

test("正文不足保留草稿、可补正文重试，读者没有外部操作权限",async({page})=>{
 record(page);await page.goto("/");await login(page);await page.getByRole("button",{name:"新增网站",exact:true}).click();const editor=page.getByRole("dialog",{name:"新增关注网站",exact:true});await editor.getByLabel("网址",{exact:true}).fill("http://127.0.0.1/no-e2e-body");await editor.getByRole("button",{name:"AI 辅助分类",exact:true}).click();await editor.getByRole("button",{name:"AI 识别并分类",exact:true}).click();await expect(editor.getByRole("status")).toContainText("补充真实标题");await expect(editor.getByLabel("文章正文",{exact:true})).toBeVisible();await expect(editor.getByLabel("标题",{exact:true})).toHaveValue("");
 await editor.getByLabel("文章正文",{exact:true}).fill("这是一款机器人开发工具。它提供公开文档和用于实验控制的示例。");await editor.getByRole("button",{name:"AI 识别并分类",exact:true}).click();await expect(editor.getByRole("status")).toContainText("使用你提供的正文");await expect(editor.getByLabel("分类",{exact:true})).toHaveValue("ai");
 page.once("dialog",d=>d.accept());await editor.getByRole("button",{name:"关闭",exact:true}).click();await page.getByRole("button",{name:"管理员模式",exact:true}).click();await page.getByRole("button",{name:"确认退出",exact:true}).click();await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();const chat=page.getByRole("dialog",{name:"AI 助手助手",exact:true});await expect(chat.getByLabel("助手链接操作",{exact:true})).toHaveCount(0);await chat.getByLabel("发送给AI 助手的消息",{exact:true}).fill("https://mp.weixin.qq.com/s/reader-attempt 帮我保存");await chat.getByRole("button",{name:"发送消息",exact:true}).click();await expect(chat).toContainText("需要管理员登录");
 const rejected=await page.request.post("/api/ai/chat",{data:{message:"读取网页",action:"read"}});expect(rejected.status()).toBe(403);expect(browserErrors).toEqual([]);
});

async function articleImage(page:Page){const value=await page.evaluate(()=>{const canvas=document.createElement("canvas");canvas.width=1000;canvas.height=650;const context=canvas.getContext("2d")!;context.fillStyle="white";context.fillRect(0,0,1000,650);context.fillStyle="#143640";context.font="bold 40px Microsoft YaHei";context.fillText("机器人视觉控制研究",45,85);context.font="28px Microsoft YaHei";context.fillText("机械臂实验 / 动作延迟 / 成功率",45,170);return canvas.toDataURL("image/png").split(",")[1];});return Buffer.from(value,"base64");}

test("图片导入分析、视觉错误保留、截图续接分类与表单截图共用",async({page})=>{
 record(page);const errors:string[]=[];page.on("console",message=>{if(message.type()==="error"&&!visionUnsupported)errors.push(message.text());});await page.goto("/");await login(page);const png=await articleImage(page);await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();const chat=page.getByRole("dialog",{name:"AI 助手助手",exact:true});
 await chat.getByLabel("导入图片",{exact:true}).setInputFiles({name:"研究截图.png",mimeType:"image/png",buffer:png});await expect(chat.locator(".image-previews img")).toHaveCount(1);await chat.getByLabel("发送给AI 助手的消息",{exact:true}).fill("这张图片讲了什么？");await chat.getByRole("button",{name:"发送消息",exact:true}).click();await expect(chat).toContainText("机械臂实验与方法比较");await expect(chat.locator(".image-previews img")).toHaveCount(0);
 await chat.getByLabel("发送给AI 助手的消息",{exact:true}).fill("http://127.0.0.1/article/needs-picture 帮我分类");await chat.getByRole("button",{name:"发送消息",exact:true}).click();const card=chat.getByRole("region",{name:"链接整理草稿",exact:true}).last();await expect(card).toContainText("需要补充文章内容");await expect(chat.getByRole("button",{name:"补充正文后重试",exact:true})).toHaveCount(0);
 await chat.getByLabel("发送给AI 助手的消息",{exact:true}).evaluate((element,base64)=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],"粘贴截图.png",{type:"image/png"}));element.dispatchEvent(new ClipboardEvent("paste",{clipboardData:transfer,bubbles:true,cancelable:true}));},png.toString("base64"));await expect(chat.locator(".image-previews img")).toHaveCount(1);
 visionUnsupported=true;try{await chat.getByRole("button",{name:"发送消息",exact:true}).click();await expect(chat.getByRole("alert")).toContainText("未接受图片输入");await expect(chat.locator(".image-previews img")).toHaveCount(1);await expect(chat.getByLabel("发送给AI 助手的消息",{exact:true})).not.toHaveValue("");}finally{visionUnsupported=false;}
 await chat.getByRole("button",{name:"发送消息",exact:true}).click();await expect(card).toContainText("依据本次图片中可见");await expect(card.getByLabel("草稿保存位置",{exact:true})).toHaveValue("article");await card.getByRole("button",{name:"保存为行业前沿",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(visuals,"vision-chat-classification.png"),animations:"disabled"});await card.getByRole("button",{name:"保存为行业前沿",exact:true}).click();await expect(card.getByRole("button",{name:"已保存",exact:true})).toBeDisabled();
 const entries=(await(await page.request.get("/api/entries")).json()).entries;const saved=entries.find((entry:{url:string})=>entry.url==="http://127.0.0.1/article/needs-picture");expect(saved.content).toBe(imageText);expect(saved.visibility).toBe("public");expect(saved.published).toBe(true);expect(JSON.stringify(saved)).not.toContain("data:image");
 await chat.getByRole("button",{name:"关闭对话",exact:true}).click();await page.getByRole("button",{name:"行业前沿",exact:true}).click();await page.getByRole("button",{name:"新增资讯",exact:true}).click();const editor=page.getByRole("dialog",{name:"新增行业前沿",exact:true});await editor.getByLabel("网址",{exact:true}).fill("http://127.0.0.1/article/form-picture");await editor.getByRole("button",{name:"AI 辅助分类",exact:true}).click();await editor.getByLabel("导入分类截图",{exact:true}).setInputFiles({name:"文章截图.png",mimeType:"image/png",buffer:png});await expect(editor.locator(".image-previews img")).toHaveCount(1);await editor.getByRole("button",{name:"AI 识别并分类",exact:true}).click();await expect(editor.getByRole("status")).toContainText("图片中可见");await expect(editor.getByLabel("原文发布日期",{exact:true})).toHaveCount(0);await expect(editor.getByLabel("可见范围",{exact:true})).toHaveCount(0);await expect(editor.getByLabel("发布状态",{exact:true})).toHaveCount(0);await page.screenshot({path:path.join(visuals,"vision-editor.png"),animations:"disabled"});
 await editor.getByRole("button",{name:"保存",exact:true}).click();await expect(editor).toHaveCount(0);await expect(page.getByText("原文日期未提供",{exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();await page.setViewportSize({width:390,height:844});await page.getByLabel("页面缩放比例",{exact:true}).selectOption("120");await chat.getByLabel("导入图片",{exact:true}).setInputFiles({name:"手机截图.png",mimeType:"image/png",buffer:png});await expect(chat.locator(".image-previews img")).toHaveCount(1);const bounds=await chat.boundingBox();expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(391);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(845);await expect(chat.getByRole("button",{name:"发送消息",exact:true})).toBeEnabled();await page.screenshot({path:path.join(visuals,"vision-mobile-input.png"),animations:"disabled"});expect(errors).toEqual([]);expect(browserErrors).toEqual([]);
});

test("读者可分析图片但不能保存，收藏统一公开而备忘录待办仍私有",async({page})=>{
 record(page);await page.goto("/");const before=(await(await page.request.get("/api/entries")).json()).entries;expect(before.every((entry:{kind:string;visibility:string;published:boolean})=>["bookmark","article"].includes(entry.kind)&&entry.visibility==="public"&&entry.published)).toBe(true);const png=await articleImage(page);await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();const chat=page.getByRole("dialog",{name:"AI 助手助手",exact:true});await chat.getByLabel("导入图片",{exact:true}).setInputFiles({name:"读者截图.png",mimeType:"image/png",buffer:png});await expect(chat.locator(".image-previews img")).toHaveCount(1);await chat.getByLabel("发送给AI 助手的消息",{exact:true}).fill("请分析图片并分类");await chat.getByRole("button",{name:"发送消息",exact:true}).click();await expect(chat).toContainText("机械臂实验与方法比较");await expect(chat.getByRole("region",{name:"链接整理草稿",exact:true})).toHaveCount(0);expect((await(await page.request.get("/api/entries")).json()).entries.length).toBe(before.length);expect((await page.request.post("/api/entries",{data:{}})).status()).toBe(401);
});

test("页面缩放在刷新和同浏览器新页面保持，桌面与手机布局可操作",async({page})=>{
 record(page);const errors:string[]=[];page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});await page.goto("/");await login(page);
 const scale=page.getByLabel("页面缩放比例",{exact:true});await scale.selectOption("80");await expect(page.locator("html")).toHaveAttribute("data-page-scale","80");await page.reload();await expect(scale).toHaveValue("80");
 expect(await page.evaluate(()=>localStorage.getItem("ljt-page-scale-v1"))).toBe("80");
 const second=await page.context().newPage();await second.goto("http://127.0.0.1:3100/");await expect(second.getByLabel("页面缩放比例",{exact:true})).toHaveValue("80");await second.close();
 await scale.selectOption("120");await expect(page.locator("html")).toHaveAttribute("data-page-scale","120");await page.screenshot({path:path.join(visuals,"portal-scale-desktop-120.png"),animations:"disabled"});
 await page.setViewportSize({width:390,height:844});await expect(scale).toBeVisible();await expect(scale).toHaveValue("120");
 await page.getByRole("button",{name:"新增网站",exact:true}).click();const editor=page.getByRole("dialog",{name:"新增关注网站",exact:true});await expect(editor).toBeVisible();
 const bounds=await editor.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(391);expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(845);
 await page.screenshot({path:path.join(visuals,"portal-scale-mobile-120.png"),animations:"disabled"});await editor.getByRole("button",{name:"关闭",exact:true}).click();
 await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();const chat=page.getByRole("dialog",{name:"AI 助手助手",exact:true});const chatBounds=await chat.boundingBox();expect(chatBounds!.x).toBeGreaterThanOrEqual(0);expect(chatBounds!.x+chatBounds!.width).toBeLessThanOrEqual(391);expect(chatBounds!.y).toBeGreaterThanOrEqual(0);expect(chatBounds!.y+chatBounds!.height).toBeLessThanOrEqual(845);await page.getByRole("button",{name:"关闭对话",exact:true}).click();
 await page.getByRole("button",{name:"展开导航",exact:true}).click();await page.getByRole("button",{name:"切换背景",exact:true}).click();const appearanceBounds=await page.getByRole("region",{name:"背景设置",exact:true}).boundingBox();expect(appearanceBounds!.y).toBeGreaterThanOrEqual(0);expect(appearanceBounds!.y+appearanceBounds!.height).toBeLessThanOrEqual(845);await page.getByRole("button",{name:"关闭导航",exact:true}).click({position:{x:380,y:400}});
 await scale.selectOption("80");await page.getByRole("button",{name:"展开导航",exact:true}).click();const sidebarBounds=await page.locator(".sidebar").boundingBox();expect(sidebarBounds!.y).toBeGreaterThanOrEqual(0);expect(sidebarBounds!.y+sidebarBounds!.height).toBeLessThanOrEqual(845);await page.getByRole("button",{name:"关闭导航",exact:true}).click({position:{x:380,y:400}});
 await scale.selectOption("100");await page.reload();await expect(scale).toHaveValue("100");expect(errors).toEqual([]);expect(browserErrors).toEqual([]);
});
