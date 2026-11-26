import {test,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {DatabaseSync} from "node:sqlite";
import {kinds} from "../shared/types";

const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ljt-category-scope-test-"));process.env.DATA_DIR=directory;
const legacy=new DatabaseSync(path.join(directory,"portal.sqlite"));
legacy.exec("CREATE TABLE categories(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL);CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE entries(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,canonical_url TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);");
for(const[id,name]of [["other","其他"],["ai","人工智能"],["legacy","旧分类"]])legacy.prepare("INSERT INTO categories VALUES(?,?)").run(id,name);
for(const[key,value]of [["categories_initialized","1"],["seeded","1"],["ai_config",'{"model":"unchanged-fixture"}'],["ai_key","unchanged-encrypted-fixture"]])legacy.prepare("INSERT INTO settings VALUES(?,?)").run(key,value);
for(const kind of kinds)legacy.prepare("INSERT INTO entries VALUES(?,?,?,'',3,'2024-01-01','2024-02-01')").run("old-"+kind,kind,JSON.stringify({kind,title:"原有"+kind,url:kind==="memo"||kind==="todo"?"":"https://example.com/"+kind,categoryId:"legacy",tags:["保留标签"],content:"保持正文",description:"原有摘要",visibility:kind==="memo"||kind==="todo"?"private":"public",published:true,pinned:false}));
const before=legacy.prepare("SELECT * FROM entries ORDER BY id").all(),settingsBefore=legacy.prepare("SELECT * FROM settings ORDER BY key").all(),legacyCategories=legacy.prepare("SELECT * FROM categories ORDER BY id").all();legacy.close();
const data=await import("../server/db");

await test("旧共享分类首次迁移为每页独立副本，记录、修订号和AI配置逐字保留",()=>{
 for(const kind of kinds)assert.deepEqual(data.categories(kind).map(c=>({...c})),[{id:"other",name:"其他"},{id:"ai",name:"人工智能"},{id:"legacy",name:"旧分类"}]);
 assert.deepEqual(data.db.prepare("SELECT * FROM entries ORDER BY id").all(),before);assert.deepEqual(data.db.prepare("SELECT * FROM settings ORDER BY key").all(),settingsBefore);assert.deepEqual(data.db.prepare("SELECT * FROM categories ORDER BY id").all(),legacyCategories);
});
await test("同名分类可在三页独立创建，跨页分类ID不能用于保存、改名或转移",()=>{
 const web=data.addCategory("独立同名","bookmark"),news=data.addCategory("独立同名","article"),paper=data.addCategory("独立同名","paper");assert.notEqual(web.id,news.id);assert.notEqual(news.id,paper.id);
 assert.throws(()=>data.addCategory("独立同名","bookmark"));assert.throws(()=>data.renameCategory(web.id,"错误操作",web.name,"paper"));assert.throws(()=>data.deleteCategory(web.id,paper.id,web.name,"bookmark"));
 assert.throws(()=>data.saveEntry({...data.emptyEntry("article"),title:"错误分类",url:"https://example.com/wrong",categoryId:web.id}));
 const renamed=data.renameCategory(web.id,"网页自己的名称",web.name,"bookmark");assert.equal(renamed.name,"网页自己的名称");assert.equal(data.categories("article").find(c=>c.id===news.id)?.name,"独立同名");
});
await test("删除旧同ID分类只转移当前页面，其他页的记录与分类原样保留",()=>{
 const result=data.deleteCategory("legacy","other","旧分类","bookmark");assert.equal(result.movedCount,1);assert.equal(data.findEntry("old-bookmark")?.categoryId,"other");assert.equal(data.findEntry("old-bookmark")?.revision,4);
 for(const kind of ["article","paper","memo","todo"] as const){assert.equal(data.findEntry("old-"+kind)?.categoryId,"legacy");assert.equal(data.findEntry("old-"+kind)?.revision,3);assert.ok(data.categories(kind).some(c=>c.id==="legacy"));}
});
await test("重启不会重新复制已删除分类，读者目录不包含私人分类",()=>{
 const output=execFileSync(process.execPath,["--import","tsx","--input-type=module","-e","const d=await import('./server/db.ts');console.log(JSON.stringify({web:d.categories('bookmark'),paper:d.categories('paper')}));d.db.close();"],{cwd:process.cwd(),env:process.env,encoding:"utf8",timeout:15000});const restored=JSON.parse(output.trim());assert.equal(restored.web.some((c:{id:string})=>c.id==="legacy"),false);assert.equal(restored.paper.some((c:{id:string})=>c.id==="legacy"),true);
 const reader=data.categoryCatalog(false);assert.deepEqual(reader.memo,[]);assert.deepEqual(reader.todo,[]);assert.ok(reader.paper.length>0);
});
after(()=>{data.db.close();if(path.dirname(path.resolve(directory))===path.resolve(os.tmpdir())&&path.basename(directory).startsWith("ljt-category-scope-test-"))fs.rmSync(directory,{recursive:true,force:true});});
