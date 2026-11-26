import {test,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {spawnSync} from "node:child_process";
import {NextRequest} from "next/server";
import {sortableKinds,orderKey,type SortableKind,type EntryOrderMove} from "../shared/entryOrder";
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ljt-entry-order-tests-"));process.env.DATA_DIR=directory;process.env.APP_ORIGIN="http://order.test";process.env.COOKIE_SECURE="false";delete process.env.AI_API_KEY;delete process.env.AI_BASE_URL;delete process.env.AI_MODEL;
const data=await import("../server/db"),route=await import("../app/api/[...segments]/route");
let cookie="",counter=0;
async function request(endpoint:string,method="GET",body?:unknown,admin=true,origin="http://order.test"){
 return route.GET(new NextRequest("http://order.test/api/"+endpoint,{method,headers:{"Content-Type":"application/json",Origin:origin,...(admin?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve({segments:endpoint.split("?")[0].split("/")})});
}
function add(kind:SortableKind,pinned=false){counter++;return data.saveEntry({...data.emptyEntry(kind),title:"ORDER "+kind+" "+counter,url:"https://order.example/"+kind+"/"+counter,pinned,description:"不可被排序改写的摘要",content:"不可被排序改写的正文"});}
function move(kind:SortableKind,pinned:boolean,id:string,targetId:string,position:EntryOrderMove["position"]="before"):EntryOrderMove{return{kind,pinned,id,targetId,position,version:data.entryOrderVersions()[orderKey(kind,pinned)]};}
function rawRows(){return data.db.prepare("SELECT * FROM entries ORDER BY id").all();}
function orderSettings(){return data.db.prepare("SELECT * FROM settings WHERE key LIKE 'entry_order:%' ORDER BY key").all();}
await test("排序接口需要真实管理员会话，读者不能伪造权限或写入顺序",async()=>{
 const a=add("paper"),b=add("paper"),body=move("paper",false,a.id,b.id);const before=rawRows();
 assert.equal((await request("entries/reorder","POST",{...body,admin:true},false)).status,401);assert.deepEqual(rawRows(),before);assert.deepEqual(orderSettings(),[]);
 const token=fs.readFileSync(path.join(directory,"setup-token.txt"),"utf8").trim();const login=await request("login","POST",{username:"order-admin",password:"Order-test-password-12345",setupToken:token},false);assert.equal(login.status,200);cookie=login.headers.get("set-cookie")!.split(";")[0];
 assert.equal((await request("entries/reorder","POST",body,true,"http://wrong.test")).status,403);assert.deepEqual(orderSettings(),[]);
});
for(const kind of sortableKinds)await test(kind+" 置顶组与非置顶组各自保存顺序，不改正文、版本号或时间",async()=>{
 const a=add(kind,true),b=add(kind,true),c=add(kind),d=add(kind),before=rawRows(),untouched=data.db.prepare("SELECT * FROM settings WHERE key NOT LIKE 'entry_order:%' ORDER BY key").all();
 let response=await request("entries/reorder","POST",move(kind,true,a.id,b.id,"after"));assert.equal(response.status,200);assert.deepEqual(rawRows(),before);
 response=await request("entries/reorder","POST",move(kind,false,c.id,d.id,"after"));assert.equal(response.status,200);assert.deepEqual(rawRows(),before);
 const group=data.listEntries(true,kind),pinned=group.filter(e=>e.pinned).map(e=>e.id),normal=group.filter(e=>!e.pinned).map(e=>e.id);assert.ok(pinned.indexOf(b.id)<pinned.indexOf(a.id));assert.ok(normal.indexOf(d.id)<normal.indexOf(c.id));assert.ok(group.findIndex(e=>!e.pinned)>group.map(e=>e.pinned).lastIndexOf(true));
 const reader=await(await request("entries?kind="+kind,"GET",undefined,false)).json();assert.deepEqual(reader.entries.map((e:{id:string})=>e.id),group.map(e=>e.id));assert.equal(reader.orderVersions,undefined);assert.deepEqual(data.db.prepare("SELECT * FROM settings WHERE key NOT LIKE 'entry_order:%' ORDER BY key").all(),untouched);
});
await test("跨置顶组、跨页面及失效目标都拒绝，失败不会保存部分顺序",async()=>{
 const a=add("bookmark",true),b=add("bookmark"),c=add("article",true),before=orderSettings(),rows=rawRows();
 for(const body of [move("bookmark",true,a.id,b.id),move("bookmark",true,a.id,c.id),move("bookmark",true,a.id,"missing-record")])assert.equal((await request("entries/reorder","POST",body)).status,409);
 assert.deepEqual(orderSettings(),before);assert.deepEqual(rawRows(),rows);
});
await test("旧顺序版本不覆盖其他设备的新排序，编辑或置顶变化也要求刷新",async()=>{
 const a=add("article"),b=add("article");add("article");const stale=move("article",false,a.id,b.id,"after"),group=data.listEntries(true,"article").filter(e=>!e.pinned);assert.equal((await request("entries/reorder","POST",move("article",false,group[0].id,group.at(-1)!.id,"after"))).status,200);const settings=orderSettings();assert.equal((await request("entries/reorder","POST",stale)).status,409);assert.deepEqual(orderSettings(),settings);
 const body=move("article",false,a.id,b.id),current=data.findEntry(a.id)!;const{id,revision,createdAt,updatedAt,...entry}=current;void id;void createdAt;void updatedAt;data.saveEntry({...entry,description:"用户后来编辑的摘要"},a.id,revision);assert.equal((await request("entries/reorder","POST",body)).status,409);assert.equal(data.findEntry(a.id)!.description,"用户后来编辑的摘要");
});
await test("筛选结果相对移动保留未显示条目之间的顺序，新增及置顶操作不破坏已存排序",async()=>{
 const a=add("paper"),b=add("paper"),c=add("paper"),before=data.listEntries(true,"paper").filter(e=>!e.pinned).map(e=>e.id),others=before.filter(id=>id!==a.id);data.reorderEntries(move("paper",false,a.id,c.id,"after"));let now=data.listEntries(true,"paper").filter(e=>!e.pinned).map(e=>e.id);assert.deepEqual(now.filter(id=>id!==a.id),others);assert.equal(now.indexOf(a.id),now.indexOf(c.id)+1);
 const added=add("paper");assert.deepEqual(data.listEntries(true,"paper").filter(e=>!e.pinned&&e.id!==added.id).map(e=>e.id),now);
 const current=data.findEntry(b.id)!;const{id,revision,createdAt,updatedAt,...entry}=current;void id;void createdAt;void updatedAt;data.saveEntry({...entry,pinned:true},b.id,revision);assert.equal(data.listEntries(true,"paper").find(e=>e.id===b.id)!.pinned,true);data.deleteEntry(a.id,data.findEntry(a.id)!.revision);now=data.listEntries(true,"paper").filter(e=>!e.pinned).map(e=>e.id);assert.ok(!now.includes(a.id));assert.ok(now.includes(c.id));
});
await test("空移动不写入设置，非法类型、字段或版本格式不能进入数据库",async()=>{
 const a=add("bookmark"),same=move("bookmark",false,a.id,a.id),before=orderSettings();assert.equal((await request("entries/reorder","POST",same)).status,200);assert.deepEqual(orderSettings(),before);
 for(const body of [{...same,kind:"memo"},{...same,kind:"todo"},{...same,pinned:"true"},{...same,version:"bad"},{...same,ids:[a.id]},{...same,position:"top"}])assert.equal((await request("entries/reorder","POST",body)).status,400);
 assert.deepEqual(orderSettings(),before);
});
await test("顺序存在 SQLite 中，新进程和读者可以读到相同排列",()=>{
 const expected=data.listEntries(false,"paper").map(e=>e.id),script="import {listEntries,db} from './server/db.ts';console.log(JSON.stringify(listEntries(false,'paper').map(e=>e.id)));db.close();";
 const child=spawnSync(process.execPath,["--import","./node_modules/tsx/dist/loader.mjs","--input-type=module","-e",script],{cwd:process.cwd(),env:process.env,encoding:"utf8",windowsHide:true});assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout.trim()),expected);
});
after(()=>{data.db.close();const absolute=fs.realpathSync(directory);if(!absolute.startsWith(path.join(fs.realpathSync(os.tmpdir()),"ljt-entry-order-tests-")))throw Error("Unexpected test directory");fs.rmSync(absolute,{recursive:true,force:true});});
