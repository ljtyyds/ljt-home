import {test,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {NextRequest} from "next/server";
import {continueMemoList,insertMemoImages,memoContentLimit} from "../shared/memoEditor";

await test("编号列表回车自动递增，同时兼容现有无空格写法",()=>{
 for(const[value,expected]of [["1. 第一项","1. 第一项\n2. "],["9.正文","9. 正文\n10. "],["2) 项目","2) 项目\n3) "]])assert.equal(continueMemoList(value,value.length)?.value,expected);
});
await test("项目符号、缩进、引用及任务框延续，完成项的新任务重新未选中",()=>{
 for(const[value,expected]of [["- 项目","- 项目\n- "],["  * 嵌套","  * 嵌套\n  * "],["> - 项目","> - 项目\n> - "],["- [x] 完成","- [x] 完成\n- [ ] "],["1. [ ] 待办","1. [ ] 待办\n2. [ ] "]])assert.equal(continueMemoList(value,value.length)?.value,expected);
});
await test("空列表项回车结束，光标留在正确位置",()=>{
 for(const[value,expected]of [["- ",""],["1. ",""],["- [ ] ",""],["  - ","  "],["> - ","> "]]){const result=continueMemoList(value,value.length)!;assert.equal(result.value,expected);assert.equal(result.cursor,expected.length);}
});
await test("普通段落、减号单词和代码块不被当成列表",()=>{
 for(const value of ["普通段落","-word","```md\n1. code","~~~\n- code","    ```\n- code"])assert.equal(continueMemoList(value,value.length),null);
 const closed="```\n1. code\n```\n1. 正文";assert.equal(continueMemoList(closed,closed.length)?.value,closed+"\n2. ");
});
await test("列表中间换行保留光标后的文字和后续行，选中文本可以替换",()=>{
 const value="- 前半后半\n- 下一条",start=value.indexOf("后半"),result=continueMemoList(value,start)!;assert.equal(result.value,"- 前半\n- 后半\n- 下一条");assert.equal(result.cursor,7);
 const selected=continueMemoList("1. abcdef",6,9)!;assert.equal(selected.value,"1. abc\n2. ");
 assert.equal(continueMemoList("- 内容",1),null);
});
const image={url:"/api/memo-images/00000000-0000-4000-8000-000000000000",name:"实验[图]\\1.png"};
await test("图片在选区位置插入私有链接，保留前后正文并清理替代文本",()=>{
 const result=insertMemoImages("前文删除后文",2,4,[image]);assert.equal(result.value,"前文\n\n![实验 图  1.png]("+image.url+")\n\n后文");assert.equal(result.value.slice(result.cursor),"后文");
 assert.equal(insertMemoImages("",0,0,[image,image]).value.match(/!\[/g)?.length,2);
});
await test("无效图片地址和正文超限均拒绝，不改变原文",()=>{
 assert.throws(()=>insertMemoImages("",0,0,[{...image,url:"https://external.test/a.png"}]));assert.throws(()=>insertMemoImages("a".repeat(memoContentLimit),0,0,[image]));
});

const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ljt-memo-test-"));process.env.DATA_DIR=directory;process.env.APP_ORIGIN="http://portal.test";process.env.COOKIE_SECURE="false";
const data=await import("../server/db"),route=await import("../app/api/[...segments]/route");
let cookie="",imageUrl="";
const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p1sAAAAASUVORK5CYII=",attachment={name:"private-fixture.png",dataUrl:"data:image/png;base64,"+png};
async function request(p:string,method="GET",payload?:unknown,admin=false,origin="http://portal.test"){
 const req=new NextRequest("http://portal.test/api/"+p,{method,headers:{"Content-Type":"application/json",...(method!=="GET"?{Origin:origin}:{}),...(admin?{Cookie:cookie}:{})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});return route.GET(req,{params:Promise.resolve({segments:p.split("/")})});
}
await test("图片上传及读取都要求管理员，跨来源写入被拒绝",async()=>{
 assert.equal((await request("memo-images","POST",{images:[attachment]})).status,401);
 const login=await request("login","POST",{username:"memo-admin",password:"Memo-fixture-password-123",setupToken:fs.readFileSync(path.join(directory,"setup-token.txt"),"utf8").trim()});cookie=login.headers.get("set-cookie")!.split(";")[0];assert.equal(login.status,200);
 assert.equal((await request("memo-images","POST",{images:[attachment]},true,"https://external.test")).status,403);
});
await test("真实PNG图片入库，正文只保存短地址，图片响应禁止公开缓存",async()=>{
 const response=await request("memo-images","POST",{images:[attachment]},true);assert.equal(response.status,201);const result=await response.json();imageUrl=result.images[0].url;assert.match(imageUrl,/^\/api\/memo-images\/[0-9a-f-]{36}$/);assert.ok(!JSON.stringify(result).includes(png));
 const image=await request(imageUrl.slice(5),"GET",undefined,true);assert.equal(image.status,200);assert.equal(image.headers.get("Content-Type"),"image/png");assert.equal(image.headers.get("Cache-Control"),"private, no-store");assert.equal(image.headers.get("Cross-Origin-Resource-Policy"),"same-origin");assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(png,"base64"));
 const saved=await request("entries","POST",{...data.emptyEntry("memo"),title:"PRIVATE-IMAGE-MEMO",content:"图片内容\n\n![实验图]("+imageUrl+")"},true);assert.equal(saved.status,201);assert.equal((await saved.json()).entry.visibility,"private");assert.ok(!(await(await request("entries")).text()).includes(imageUrl));
});
await test("伪造格式、SVG、空批次、超出数量和过大请求都拒绝且不插入数据",async()=>{
 const count=()=>data.db.prepare("SELECT count(*) AS n FROM memo_images").get()!.n,before=count();
 for(const images of [[],[...Array(4)].map(()=>attachment),[{name:"bad.svg",dataUrl:"data:image/svg+xml;base64,"+Buffer.from("<svg/>").toString("base64")}],[{name:"bad.png",dataUrl:"data:image/png;base64,"+Buffer.from("not an image").toString("base64")}]] )assert.equal((await request("memo-images","POST",{images},true)).status,400);
 const req=new NextRequest("http://portal.test/api/memo-images",{method:"POST",headers:{Cookie:cookie,Origin:"http://portal.test","Content-Type":"application/json","Content-Length":"7000001"},body:"{}"});assert.equal((await route.POST(req,{params:Promise.resolve({segments:["memo-images"]})})).status,413);assert.equal(count(),before);
});
await test("未知图片地址返回404，猜到地址的读者也无法读取",async()=>{
 assert.equal((await request(imageUrl.slice(5))).status,401);assert.equal((await request("memo-images/not-a-uuid","GET",undefined,true)).status,404);assert.equal((await request("memo-images/00000000-0000-4000-8000-000000000000","GET",undefined,true)).status,404);
});
await test("现有SQLite一致性备份包含图片字节，恢复后仍可读取",()=>{
 const copy=path.join(directory,"backup.sqlite");data.db.prepare("VACUUM INTO ?").run(copy);const restored=new DatabaseSync(copy,{readOnly:true});const row=restored.prepare("SELECT mime,data FROM memo_images WHERE id=?").get(imageUrl.split("/").at(-1)!)!;assert.equal(row.mime,"image/png");assert.deepEqual(Buffer.from(row.data as Uint8Array),Buffer.from(png,"base64"));assert.equal(restored.prepare("PRAGMA integrity_check").get()!.integrity_check,"ok");restored.close();
});
await test("退出管理员后原Cookie不能继续读取图片",async()=>{
 assert.equal((await request("logout","POST",{},true)).status,200);assert.equal((await request(imageUrl.slice(5),"GET",undefined,true)).status,401);
});
after(()=>data.db.close());
