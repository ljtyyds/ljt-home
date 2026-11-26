import {test,expect,type Page} from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {createServer,type Server} from "node:http";
import {intentFixture} from "../tests/intentFixture";

const work=process.env.AI_TRANSPORT_QA_DIR||"test-results/qa/ai-transport.spec";
const password="Transport-browser-fixture-123",origin="http://127.0.0.1:3100";
let model:Server,port=0,authorization="";
const errors:string[]=[];
test.describe.configure({mode:"serial"});
test.beforeAll(async()=>{
 await fs.mkdir(work,{recursive:true});
 model=createServer(async(req,res)=>{
  let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);authorization=req.headers.authorization||"";
  if(authorization==="Bearer rejected-fixture-key"){res.writeHead(401,{"Content-Type":"application/json"});res.end(JSON.stringify({error:{message:"Invalid credential rejected-fixture-key"}}));return;}
  if(body.stream){res.writeHead(200,{"Content-Type":"text/event-stream"});res.end('data: '+JSON.stringify({choices:[{delta:{content:"这是夸克浏览器中的连续对话测试。"}}]})+'\n\ndata: [DONE]\n\n');return;}
  const system=body.messages[0].content;
  const content=system.includes("意图规划器")?JSON.stringify(intentFixture(body)):system.includes("内容分类器")?JSON.stringify({items:JSON.parse(body.messages.at(-1).content).map((entry:{id:string;kind:string;title:string})=>({id:entry.id,kind:entry.kind==="auto"?"article":entry.kind,title:entry.title||"机器人研究",categoryId:"ai",tags:["机器人"],summary:"依据提供的研究正文生成的分类摘要。"}))}):"连接成功";
  res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({choices:[{message:{content}}]}));
 });await new Promise<void>(r=>model.listen(0,"127.0.0.1",r));port=(model.address() as {port:number}).port;
});
test.afterAll(async()=>{await new Promise<void>(r=>model.close(()=>r()));});
function observe(page:Page){page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error"&&!/Failed to load resource.*502/.test(message.text()))errors.push(message.text());});}
async function admin(page:Page){
 await page.goto("/");await page.getByRole("button",{name:"管理员登录",exact:true}).click();await page.getByLabel("用户名",{exact:true}).fill("transport-browser-admin");await page.getByLabel("密码",{exact:true}).fill(password);await page.getByRole("button",{name:"进入管理工作区",exact:true}).click();await expect(page.getByRole("button",{name:"个人备忘录",exact:true})).toBeVisible();
}
test("保存新密钥后才能测试，认证错误不退出管理，重新保存后可连接",async({page})=>{
 observe(page);await page.goto("/");await expect(page).toHaveTitle(/个人知识门户/);await expect(page.getByRole("heading",{name:"关注网站",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"管理员登录",exact:true}).click();await page.getByLabel("初始化码",{exact:true}).fill((await fs.readFile(path.join(process.env.E2E_DATA_DIR!,"setup-token.txt"),"utf8")).trim());await page.getByLabel("用户名",{exact:true}).fill("transport-browser-admin");await page.getByLabel("密码",{exact:true}).fill(password);await page.getByRole("button",{name:"创建并进入管理",exact:true}).click();
 await page.getByRole("button",{name:"设置",exact:true}).click();const connection=page.getByRole("button",{name:"测试已保存的连接",exact:true});
 await page.getByLabel("API 基础地址",{exact:true}).fill("http://127.0.0.1:"+port+"/v1");await page.getByLabel("模型名称",{exact:true}).fill("transport-browser-model");await page.getByLabel("API 密钥",{exact:true}).fill("rejected-fixture-key");await expect(connection).toBeDisabled();await expect(page.getByText("有未保存的修改，请先保存设置，再测试连接。",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"保存设置",exact:true}).click();await expect(connection).toBeEnabled();await expect(page.getByLabel("API 密钥",{exact:true})).toHaveValue("");await connection.click();await expect(page.getByRole("alert").filter({hasText:"模型服务认证失败"})).toBeVisible();expect((await(await page.request.get("/api/session")).json()).admin).toBe(true);await expect(page.getByRole("alert").filter({hasText:"模型服务认证失败"})).not.toContainText("rejected-fixture-key");
 await page.screenshot({path:path.join(work,"quark-auth-guidance.png"),fullPage:false});
 await page.getByLabel("API 密钥",{exact:true}).fill("accepted-fixture-key");await expect(connection).toBeDisabled();await page.getByRole("button",{name:"保存设置",exact:true}).click();await expect(connection).toBeEnabled();await connection.click();await expect(page.getByRole("status").filter({hasText:"模型 API 连接成功"})).toBeVisible();expect(authorization).toBe("Bearer accepted-fixture-key");
 await page.reload();await page.getByRole("button",{name:"设置",exact:true}).click();await expect(page.getByLabel("API 密钥",{exact:true})).toHaveValue("");await expect(connection).toBeEnabled();
 await connection.scrollIntoViewIfNeeded();await expect(connection).toBeVisible();await page.screenshot({path:path.join(work,"quark-saved-connection.png"),fullPage:false});
});
test("连续聊天复用会话，关闭重开保留，清空和身份切换后更换",async({page})=>{
 observe(page);await admin(page);const ids:string[]=[];
 page.on("request",req=>{if(req.url().endsWith("/api/ai/chat"))ids.push(req.headers()["x-ljt-ai-session"]||"");});
 const chat=page.getByRole("dialog",{name:"AI 助手助手",exact:true});
 async function send(text:string){const count=await chat.locator(".chat-message.assistant").count();await page.getByLabel("发送给AI 助手的消息",{exact:true}).fill(text);await page.getByRole("button",{name:"发送消息",exact:true}).click();await expect(chat.locator(".chat-message.assistant")).toHaveCount(count+1);await expect(chat.locator(".chat-message.assistant").last()).toContainText("连续对话测试");await expect(page.getByRole("button",{name:"发送消息",exact:true})).toBeVisible();}
 await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();await send("你好");await send("接着解释一下");expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);expect(ids[1]).toBe(ids[0]);
 await page.getByRole("button",{name:"关闭对话",exact:true}).click();await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();await send("继续聊天");expect(ids[2]).toBe(ids[0]);
 await page.getByRole("button",{name:"清空对话",exact:true}).click();await send("新话题");expect(ids[3]).not.toBe(ids[0]);await page.screenshot({path:path.join(work,"quark-chat-session.png"),fullPage:false});
 await page.getByRole("button",{name:"关闭对话",exact:true}).click();await page.getByRole("button",{name:"退出管理",exact:true}).click();await page.getByRole("button",{name:"确认退出",exact:true}).click();await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();await send("读者你好");expect(ids[4]).not.toBe(ids[3]);
 expect(errors).toEqual([]);
});
test("聊天中的整理分类生成草稿，支持手机界面且不直接修改收藏",async({page})=>{
 observe(page);await admin(page);const before=(await(await page.request.get("/api/entries")).json()).entries;
 await page.getByRole("button",{name:"和AI 助手聊聊",exact:true}).click();await page.getByLabel("发送给AI 助手的消息",{exact:true}).fill("请整理分类 https://example.org/transport-article 正文：这是一份关于机器人视觉控制的研究资料，介绍真实机械臂的控制算法实验，比较动作延迟、成功率和误差。");await page.getByRole("button",{name:"发送消息",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"AI 助手助手",exact:true})).toContainText("链接整理草稿");await expect(page.getByRole("dialog",{name:"AI 助手助手",exact:true})).toContainText("分类摘要");expect((await(await page.request.get("/api/entries")).json()).entries).toEqual(before);
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.locator(".sidebar").evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);await expect(page.getByRole("dialog",{name:"AI 助手助手",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:path.join(work,"quark-organize-mobile.png"),fullPage:false});expect(errors).toEqual([]);
});
