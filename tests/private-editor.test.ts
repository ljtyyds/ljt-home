import {test,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {NextRequest} from "next/server";
import {DatabaseSync} from "node:sqlite";
import {memoImageRefs,removeMemoImage,memoExcerpt,insertMemoImages} from "../shared/memoEditor";
const first="/api/memo-images/00000000-0000-4000-8000-000000000001",second="/api/memo-images/00000000-0000-4000-8000-000000000002";
await test("图片缩略图只收集受保护的图片地址，去重且保留名称",()=>{
 const text="![甲]("+first+")\n![重复]("+first+")\n![乙]("+second+")\n![外部](https://example.org/a.png)\n![无效](/api/memo-images/bad)";
 assert.deepEqual(memoImageRefs(text),[{url:first,name:"甲"},{url:second,name:"乙"}]);assert.deepEqual(memoImageRefs("普通备注"),[]);
});
await test("移除当前图片引用保留正文、另一张图片及其他内容",()=>{
 const text="开始\n![甲]("+first+")\n![乙]("+second+")\n结束";assert.equal(removeMemoImage(text,first),"开始\n\n![乙]("+second+")\n结束");assert.equal(removeMemoImage(text,"https://example.org/a.png"),text);
});
await test("备注图片插入遵守原有4000字符上限，不截断旧内容",()=>{
 const image={url:first,name:"参考.png"};assert.throws(()=>insertMemoImages("a".repeat(3990),3990,3990,[image],4000),/4000/);assert.match(insertMemoImages("执行步骤",4,4,[image],4000).value,/参考.png/);assert.doesNotMatch(memoExcerpt("![参考]("+first+")"),/\/api\//);
});
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ljt-private-editors-"));process.env.DATA_DIR=directory;process.env.APP_ORIGIN="http://portal.test";process.env.COOKIE_SECURE="false";
const db=await import("../server/db"),route=await import("../app/api/[...segments]/route");let cookie="",url="",todoId="",memoId="",originalMemo="";
async function request(p:string,method="GET",payload?:unknown,admin=false){return route.GET(new NextRequest("http://portal.test/api/"+p,{method,headers:{Origin:"http://portal.test","Content-Type":"application/json",...(admin?{Cookie:cookie}:{})},...(payload===undefined?{}:{body:JSON.stringify(payload)})}),{params:Promise.resolve({segments:p.split("/")})});}
const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p1sAAAAASUVORK5CYII=";
await test("原有图片服务可供待办使用，既有备忘录和备注无需迁移",async()=>{
 const login=await request("login","POST",{username:"private-editor-admin",password:"Private-editor-fixture-123",setupToken:fs.readFileSync(path.join(directory,"setup-token.txt"),"utf8").trim()});assert.equal(login.status,200);cookie=login.headers.get("set-cookie")!.split(";")[0];
 const upload=await request("memo-images","POST",{images:[{name:"参考.png",dataUrl:"data:image/png;base64,"+png}]},true);assert.equal(upload.status,201);url=(await upload.json()).images[0].url;
 originalMemo="原有备忘录\n![参考]("+url+")";memoId=db.saveEntry({...db.emptyEntry("memo"),title:"原有备忘录",content:originalMemo}).id;
 const todo=db.saveEntry({...db.emptyEntry("todo"),title:"原有待办",description:"原有备注\n1. 旧步骤",relatedId:memoId,status:"doing",priority:"high",dueAt:"2026-12-01T00:00:00.000Z"});todoId=todo.id;assert.equal(db.findEntry(todoId)!.description,"原有备注\n1. 旧步骤");
});
await test("待办备注保存图片后保持状态、优先级、截止时间和关联，私人内容不公开",async()=>{
 const before=db.findEntry(todoId)!,{id,revision,createdAt,updatedAt,...input}=before;void createdAt;void updatedAt;
 const description=insertMemoImages(before.description,before.description.length,before.description.length,[{url,name:"参考.png"}],4000).value;
 const result=await request("entries","PUT",{id,revision,data:{...input,description}},true);assert.equal(result.status,200);const saved=(await result.json()).entry;
 assert.equal(saved.description,description);for(const key of ["status","priority","dueAt","relatedId"] as const)assert.equal(saved[key],before[key]);assert.equal(saved.visibility,"private");assert.equal(saved.published,false);
 assert.equal((await request(url.slice(5),"GET",undefined,true)).status,200);assert.equal((await request(url.slice(5))).status,401);assert.ok(!(await(await request("entries")).text()).includes(description));
});
await test("从待办移除引用不删除共享图片，也不改写原有备忘录",async()=>{
 const todo=db.findEntry(todoId)!,{id,revision,createdAt,updatedAt,...input}=todo;void createdAt;void updatedAt;
 const result=await request("entries","PUT",{id,revision,data:{...input,description:removeMemoImage(todo.description,url)}},true);assert.equal(result.status,200);assert.equal(db.findEntry(memoId)!.content,originalMemo);assert.equal((await request(url.slice(5),"GET",undefined,true)).status,200);
});
await test("备注超长由服务端拒绝，旧数据不会被覆盖",async()=>{
 const todo=db.findEntry(todoId)!,{id,revision,createdAt,updatedAt,...input}=todo;void createdAt;void updatedAt;
 assert.equal((await request("entries","PUT",{id,revision,data:{...input,description:"a".repeat(4001)}},true)).status,400);assert.deepEqual(db.findEntry(todoId),todo);
});
await test("现有备份同时保留备忘录图片和待办备注",()=>{
 const file=path.join(directory,"copy.sqlite");db.db.prepare("VACUUM INTO ?").run(file);const copy=new DatabaseSync(file,{readOnly:true});assert.equal(copy.prepare("SELECT count(*) AS n FROM memo_images").get()!.n,1);assert.ok(copy.prepare("SELECT data FROM entries WHERE id=?").get(todoId));assert.equal(copy.prepare("PRAGMA integrity_check").get()!.integrity_check,"ok");copy.close();
});
after(()=>db.db.close());
