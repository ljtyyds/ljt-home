import {test,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {NextRequest} from "next/server";
import {isOpenCodeGo,providerHeaders,providerFailure,withAiSession} from "../server/aiTransport";

const go="https://opencode.ai/inference/go/openai/v1",session=randomUUID();
await test("Go headers use the actual client identity and one stable session across auxiliary calls",async()=>{
 await withAiSession(session,async()=>{
  const first=providerHeaders(go,"fixture-key");await Promise.resolve();
  assert.equal(first["User-Agent"],"personal-portal/1.0");assert.equal(first.Authorization,"Bearer fixture-key");
  assert.equal(first["x-opencode-session"],session);assert.equal(providerHeaders(go,"fixture-key")["x-opencode-session"],session);
 });
});
await test("Concurrent conversations retain separate sessions through interleaved async work",async()=>{
 const other=randomUUID();const result=await Promise.all([session,other].map(id=>withAiSession(id,async()=>{await new Promise(r=>setTimeout(r,5));return providerHeaders(go,"fixture-key")["x-opencode-session"];})));
 assert.deepEqual(result,[session,other]);
});
await test("Missing or invalid client IDs get independent server IDs without forwarding header injection",()=>{
 const ids=[null,"not-a-session","bad\r\nAuthorization: secret"].map(id=>withAiSession(id,()=>providerHeaders(go,"fixture-key")["x-opencode-session"]));
 assert.equal(new Set(ids).size,3);for(const id of ids)assert.match(id,/^[0-9a-f-]{36}$/);
});
await test("Go detection is restricted to official HTTPS routes; other providers keep their original headers",()=>{
 assert.equal(isOpenCodeGo(go+"/"),true);assert.equal(isOpenCodeGo("https://opencode.ai/zen/go/v1"),true);
 for(const url of ["https://opencode.ai/inference/openai/v1","https://opencode.ai.evil.test/inference/go/openai/v1","http://opencode.ai/inference/go/openai/v1","https://user@opencode.ai/inference/go/openai/v1",go+"?key=secret",go+"/extra"]){assert.equal(isOpenCodeGo(url),false);assert.deepEqual(providerHeaders(url,"fixture-key"),{Authorization:"Bearer fixture-key","Content-Type":"application/json"});}
});
const failure=(status:number,error:unknown,goProvider=true,images=false)=>providerFailure(Response.json({error},{status}),goProvider,images);
await test("Missing-session errors are shown accurately even for image requests",async()=>{
 assert.match(await failure(400,{type:"MissingSessionID",message:"Request is missing x-opencode-session"},true,true),/会话标识/);
});
await test("Invalid credentials are distinct from image capability and never expose provider text",async()=>{
 const message=await failure(401,{type:"authentication_error",message:"Invalid credential sk-fixture-secret Bearer very-secret"},true,true);
 assert.match(message,/认证失败.*401/);assert.doesNotMatch(message,/sk-fixture|very-secret|未接受图片/);
});
await test("Billing, privacy, model permissions and rate limits have separate guidance",async()=>{
 assert.match(await failure(402,"payment required"),/余额、订阅/);
 assert.match(await failure(403,{message:"Model blocked by privacy regions"}),/Global/);
 assert.match(await failure(403,{message:"Forbidden"}),/模型权限/);
 assert.match(await failure(429,{message:"Limit exceeded"}),/限流或额度/);
});
await test("Unsupported image inputs retain useful guidance without exposing arbitrary upstream content",async()=>{
 assert.match(await failure(400,{message:"image not supported"},false,true),/未接受图片输入/);
 const raw=await failure(400,{message:"secret private upstream text"});assert.match(raw,/HTTP 400/);assert.doesNotMatch(raw,/secret/);
});
await test("Malformed and oversized errors are bounded and the response stream is cancelled",async()=>{
 assert.match(await providerFailure(new Response("<html>secret</html>",{status:502}),true,false),/HTTP 502/);
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(17000));},cancel(){cancelled=true;}});
 assert.match(await providerFailure(new Response(stream,{status:400}),true,false),/HTTP 400/);assert.equal(cancelled,true);
});

const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ljt-ai-transport-"));
process.env.DATA_DIR=directory;process.env.APP_ORIGIN="http://portal.test";process.env.COOKIE_SECURE="false";
delete process.env.AI_BASE_URL;delete process.env.AI_MODEL;delete process.env.AI_API_KEY;
const db=await import("../server/db"),route=await import("../app/api/[...segments]/route"),ai=await import("../server/ai");
const fetchBefore=globalThis.fetch;
type Call={headers:Headers;body:{stream?:boolean;messages:Array<{role:string;content:string}>}};
let calls:Call[]=[],mode="ok",cookie="";
const material="这是一份关于机器人视觉控制的研究资料，介绍在真实机械臂上进行的控制算法实验，并比较动作延迟、成功率和误差。";
globalThis.fetch=async(input,init)=>{
 assert.equal(String(input),go+"/chat/completions");
 const headers=new Headers(init?.headers),body=JSON.parse(String(init?.body));calls.push({headers,body});
 if(mode==="auth")return Response.json({error:{type:"authentication_error",message:"Invalid credential "+headers.get("Authorization")}},{status:401});
 if(body.stream)return new Response('data: '+JSON.stringify({choices:[{delta:{content:"已依据站内资料回答。"}}]})+'\n\ndata: [DONE]\n\n',{headers:{"Content-Type":"text/event-stream"}});
 let content="连接成功";const system=body.messages[0].content;
 if(system.includes("意图规划器"))content=JSON.stringify({intent:"organize",url:"https://example.org/transport-article",title:"机器人研究",material,analysis:"已提取正文。"});
 else if(system.includes("内容分类器"))content=JSON.stringify({items:JSON.parse(body.messages.at(-1).content).map((entry:{id:string;kind:string})=>({id:entry.id,kind:entry.kind==="auto"?"article":entry.kind,title:"机器人研究",categoryId:"ai",tags:["机器人"],summary:"机器人控制方法比较。"}))});
 else if(system==="transport-structured")content=JSON.stringify({ok:true});
 return Response.json({choices:[{message:{content}}]});
};
async function request(p:string,body:unknown={},id?:string,authenticated=true,method="POST"){
 return route.POST(new NextRequest("http://portal.test/api/"+p,{method,headers:{Origin:"http://portal.test","Content-Type":"application/json",...(id?{"x-ljt-ai-session":id}:{}),...(authenticated?{Cookie:cookie}:{})},...(method==="GET"?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve({segments:p.split("/")})});
}
await test("Saving a replacement key encrypts it and the connection test uses the newly saved value",async()=>{
 const login=await request("login",{username:"transport-admin",password:"Transport-fixture-password-123",setupToken:fs.readFileSync(path.join(directory,"setup-token.txt"),"utf8").trim()},undefined,false);assert.equal(login.status,200);cookie=login.headers.get("set-cookie")!.split(";")[0];
 for(const key of ["old-fixture-key","new-fixture-key"]){
  const saved=await request("settings/ai",{baseUrl:go,model:"deepseek-v4.1-flash",apiKey:key,publicChat:true},undefined,true,"PUT");assert.equal(saved.status,200);assert.doesNotMatch(await saved.text(),/fixture-key/);
 }
 calls=[];const response=await request("settings/ai/test",{},session);assert.equal(response.status,200);assert.equal(calls[0].headers.get("Authorization"),"Bearer new-fixture-key");assert.equal(calls[0].headers.get("x-opencode-session"),session);assert.equal(calls[0].headers.get("User-Agent"),"personal-portal/1.0");assert.notEqual(db.getSetting("ai_key"),"new-fixture-key");
});
await test("Route wrapper preserves the conversation across streaming requests and rotates independent operations",async()=>{
 calls=[];for(let turn=0;turn<2;turn++){const response=await request("ai/chat",{message:"你好"},session);assert.equal(response.status,200);assert.match(await response.text(),/已依据站内资料回答/);}
 assert.equal(calls.length,2);assert.ok(calls.every(call=>call.headers.get("x-opencode-session")===session));
 await request("settings/ai/test");await request("settings/ai/test");assert.notEqual(calls[2].headers.get("x-opencode-session"),calls[3].headers.get("x-opencode-session"));
});
await test("Intent planning and link classification share a session without changing records",async()=>{
 calls=[];const before=db.listEntries(true),response=await request("ai/chat",{message:"请整理分类 https://example.org/transport-article 正文："+material},session);
 assert.match(await response.text(),/organize/);assert.equal(calls.length,2);assert.ok(calls.every(call=>call.headers.get("x-opencode-session")===session));assert.deepEqual(db.listEntries(true),before);
});
await test("Classification and structured paper helpers both use the shared authenticated transport",async()=>{
 calls=[];const response=await request("ai/classify-draft",{kind:"article",url:"https://example.org/transport-draft",title:"机器人控制研究",content:material},session);assert.equal(response.status,200);
 await withAiSession(session,async()=>{assert.deepEqual(await ai.structuredModel("transport-structured","metadata"),{ok:true});});
 assert.equal(calls.length,2);assert.ok(calls.every(call=>call.headers.get("x-opencode-session")===session));
});
await test("Upstream credential failures stay HTTP 502 locally so they cannot expire the administrator session",async()=>{
 mode="auth";try{const response=await request("settings/ai/test");assert.equal(response.status,502);const text=await response.text();assert.match(text,/认证失败/);assert.doesNotMatch(text,/new-fixture-key|Bearer/);const current=await request("session",{},undefined,true,"GET");assert.equal((await current.json()).admin,true);}finally{mode="ok";}
});
await test("Conversation headers do not grant anonymous callers access to configuration or writing",async()=>{
 const before=calls.length;assert.equal((await request("settings/ai/test",{},session,false)).status,401);assert.equal((await request("ai/classify-draft",{},session,false)).status,401);assert.equal((await request("ai/chat",{message:"read",action:"read"},session,false)).status,403);assert.equal(calls.length,before);
});
after(()=>{globalThis.fetch=fetchBefore;db.db.close();});
