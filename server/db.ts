import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID,createHash } from "node:crypto";
import type { Entry, Kind, Category } from "@/shared/types";
import {kinds} from "@/shared/types";
import type {CategoryCatalog} from "@/shared/categories";
import { emptyPaper,paperReference } from "@/shared/papers";
import {applyEntryOrders,moveEntryIds,orderKey,sortableKind,sortableKinds,type EntryOrderMove,type OrderVersions} from "@/shared/entryOrder";

export const dataDir=path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR||"./data");
if(dataDir===path.resolve("public")||dataDir.startsWith(path.resolve("public")+path.sep))throw new Error("DATA_DIR 不能放在 public 中");
fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
export const masterKey=(()=>{
  const p=path.join(dataDir,".master-key");
  if(!fs.existsSync(p))try{fs.writeFileSync(p,randomBytes(32),{flag:"wx",mode:0o600});}catch(e){if(!fs.existsSync(p))throw e;}
  return fs.readFileSync(p);
})();
export const db = new DatabaseSync(path.join(dataDir,"portal.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
db.exec(
  "CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,canonical_url TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);" +
  "CREATE UNIQUE INDEX IF NOT EXISTS entries_unique_url ON entries(kind,canonical_url) WHERE canonical_url<>'';" +
  "CREATE INDEX IF NOT EXISTS entries_kind ON entries(kind);" +
  "CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS ai_jobs(id TEXT PRIMARY KEY,data TEXT NOT NULL,created_at TEXT NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS memo_images(id TEXT PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL,created_at TEXT NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);"
);
const categorySeeds=[["development","开发工具"],["ai","人工智能"],["research","学术研究"],["design","设计灵感"],["other","其他"]];
// Seed once so administrators can remove or rename the original categories permanently.
if(!getSetting("categories_initialized")){
 for(const [id,name]of categorySeeds)db.prepare("INSERT OR IGNORE INTO categories VALUES(?,?)").run(id,name);
 setSetting("categories_initialized","1");
}
// Preserve the legacy table for rollback; existing entry IDs/category IDs stay intact.
db.exec("CREATE TABLE IF NOT EXISTS scoped_categories(kind TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(kind,id),UNIQUE(kind,name));CREATE TABLE IF NOT EXISTS category_scope_migrations(version INTEGER PRIMARY KEY);");
db.exec("BEGIN IMMEDIATE");
try{
 if(!db.prepare("SELECT version FROM category_scope_migrations WHERE version=1").get()){
  for(const kind of kinds){db.prepare("INSERT INTO scoped_categories(kind,id,name) SELECT ?,id,name FROM categories").run(kind);db.prepare("INSERT OR IGNORE INTO scoped_categories(kind,id,name) VALUES(?,'other','其他')").run(kind);}
  db.prepare("INSERT INTO category_scope_migrations(version) VALUES(1)").run();
 }
 db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
export function categories(kind:Kind="bookmark"){if(!kinds.includes(kind))categoryFailure("分类所属页面不正确");return db.prepare("SELECT id,name FROM scoped_categories WHERE kind=? ORDER BY rowid").all(kind) as Category[];}
export function categoryCatalog(admin=true):CategoryCatalog{return Object.fromEntries(kinds.map(kind=>[kind,admin||kind==="bookmark"||kind==="article"||kind==="paper"?categories(kind):[]])) as CategoryCatalog;}
function categoryFailure(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
function categoryName(input:string,kind:Kind,exceptId?:string){
 const name=input.normalize("NFKC").replace(/\s+/g," ").trim();
 if(!name||name.length>30)categoryFailure("分类名称须为 1 至 30 个字符");
 if(categories(kind).some(c=>c.id!==exceptId&&c.name.normalize("NFKC").toLowerCase()===name.toLowerCase()))categoryFailure("这个页面中已存在同名分类",409);
 return name;
}
export function addCategory(input:string,kind:Kind="bookmark"){
 if(categories(kind).length>=100)categoryFailure("每个页面最多可创建 100 个分类");
 const name=categoryName(input,kind),id=randomUUID();
 db.prepare("INSERT INTO scoped_categories(kind,id,name) VALUES(?,?,?)").run(kind,id,name);return{id,name};
}
export function renameCategory(id:string,input:string,expectedName:string,kind:Kind="bookmark"){
 if(id==="other")categoryFailure("其他是保留分类，无需修改");
 const previous=categories(kind).find(c=>c.id===id);if(!previous)categoryFailure("这个页面中不存在该分类",404);
 if(previous.name!==expectedName)categoryFailure("分类已在其他位置修改，请刷新后再试",409);
 const name=categoryName(input,kind,id);db.prepare("UPDATE scoped_categories SET name=? WHERE kind=? AND id=?").run(name,kind,id);return{id,name};
}
export function deleteCategory(id:string,targetId:string,expectedName:string,kind:Kind="bookmark"){
 if(id==="other")categoryFailure("其他是保留分类，不能删除");
 const previous=categories(kind).find(c=>c.id===id);if(!previous)categoryFailure("这个页面中不存在该分类",404);
 if(previous.name!==expectedName)categoryFailure("分类已在其他位置修改，请刷新后再试",409);
 if(id===targetId||!categories(kind).some(c=>c.id===targetId))categoryFailure("请选择同一页面的有效接收分类");
 db.exec("BEGIN IMMEDIATE");
 try{
  const changed=db.prepare("UPDATE entries SET data=json_set(data,'$.categoryId',?),revision=revision+1,updated_at=? WHERE kind=? AND json_extract(data,'$.categoryId')=?").run(targetId,new Date().toISOString(),kind,id);
  db.prepare("DELETE FROM scoped_categories WHERE kind=? AND id=?").run(kind,id);db.exec("COMMIT");return{movedCount:Number(changed.changes)};
 }catch(e){db.exec("ROLLBACK");throw e;}
}
export function hasAdmin(){return !!db.prepare("SELECT id FROM users LIMIT 1").get();}
if(!hasAdmin()){
  const p=path.join(dataDir,"setup-token.txt");
  if(!fs.existsSync(p))fs.writeFileSync(p,randomBytes(24).toString("hex"),{flag:"wx",mode:0o600});
}
export function canonicalUrl(input:string){
  if(!input)return "";const u=new URL(input);
  if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw new Error("请输入有效的 HTTP / HTTPS 网址");
  u.hash="";for(const k of [...u.searchParams.keys()])if(/^utm_|^fbclid$|^gclid$/i.test(k))u.searchParams.delete(k);
  u.searchParams.sort();u.hostname=u.hostname.toLowerCase();return u.toString().replace(/\/$/,"");
}
export function emptyEntry(kind:Kind):Omit<Entry,"id"|"revision"|"createdAt"|"updatedAt">{
 return {kind,title:"",url:"",description:"",content:"",categoryId:"other",tags:[],pinned:false,visibility:kind==="memo"||kind==="todo"?"private":"public",published:kind!=="memo"&&kind!=="todo",source:"",publishedAt:"",dueAt:"",priority:"medium",status:"todo",relatedId:"",...(kind==="paper"?{paper:emptyPaper()}: {})};
}
type Row={id:string;kind:Kind;data:string;revision:number;created_at:string;updated_at:string};
function toEntry(r:Row):Entry{const value={...JSON.parse(r.data),id:r.id,kind:r.kind,revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at};if(r.kind==="bookmark"||r.kind==="article"||r.kind==="paper"){value.visibility="public";value.published=true;if(r.kind==="article")value.publishedAt="";}return value;}
export function findEntry(id:string){const r=db.prepare("SELECT * FROM entries WHERE id=?").get(id) as Row|undefined;return r?toEntry(r):undefined;}
export function visible(e:Entry,admin:boolean){return admin||e.kind==="bookmark"||e.kind==="article"||e.kind==="paper";}
export function listEntries(admin:boolean,kind?:Kind){
 const rows=(kind?db.prepare("SELECT * FROM entries WHERE kind=? ORDER BY updated_at DESC").all(kind):db.prepare("SELECT * FROM entries ORDER BY updated_at DESC").all()) as Row[];
 const orders:Record<string,string[]>={};for(const type of sortableKinds)for(const pinned of [true,false]){const key=orderKey(type,pinned);try{const ids=JSON.parse(getSetting("entry_order:"+key)||"[]");orders[key]=Array.isArray(ids)?ids.filter(id=>typeof id==="string"):[];}catch{orders[key]=[];}}
 return applyEntryOrders(rows.map(toEntry).filter(e=>visible(e,admin)),orders);
}
export function entryOrderVersions(entries=listEntries(true)):OrderVersions{
 const versions:OrderVersions={};for(const kind of sortableKinds)for(const pinned of [true,false])versions[orderKey(kind,pinned)]=createHash("sha256").update(JSON.stringify(entries.filter(e=>e.kind===kind&&e.pinned===pinned).map(e=>[e.id,e.revision]))).digest("hex");return versions;
}
export function reorderEntries(input:EntryOrderMove){
 if(!sortableKind(input.kind))categoryFailure("这类内容不支持拖动排序");
 db.exec("BEGIN IMMEDIATE");
 try{
  const entries=listEntries(true),source=entries.find(e=>e.id===input.id),target=entries.find(e=>e.id===input.targetId);
  if(!source||!target)categoryFailure("记录已删除，请刷新后重试",409);
  if(source.kind!==input.kind||target.kind!==input.kind||source.pinned!==input.pinned||target.pinned!==input.pinned)categoryFailure("只能在同一页面的置顶组或非置顶组内排序",409);
  const key=orderKey(input.kind,input.pinned);if(entryOrderVersions(entries)[key]!==input.version)categoryFailure("顺序或内容已在其他位置更新，请刷新后重试",409);
  const ids=entries.filter(e=>e.kind===input.kind&&e.pinned===input.pinned).map(e=>e.id),next=moveEntryIds(ids,input.id,input.targetId,input.position);
  if(next.some((id,index)=>id!==ids[index]))setSetting("entry_order:"+key,JSON.stringify(next));
  const ordered=listEntries(true),versions=entryOrderVersions(ordered);db.exec("COMMIT");return{entries:ordered,orderVersions:versions};
 }catch(error){db.exec("ROLLBACK");throw error;}
}
export function saveEntry(input:Omit<Entry,"id"|"revision"|"createdAt"|"updatedAt">,id?:string,expectedRevision?:number){
 const previous=id?findEntry(id):undefined;
 if(id&&!previous)throw Object.assign(new Error("记录不存在"),{status:404});
 if(previous&&expectedRevision!==previous.revision)throw Object.assign(new Error("内容已在其他位置更新，请刷新后再保存"),{status:409});
 const value={...input};
 if(value.kind==="memo"||value.kind==="todo"){value.visibility="private";value.published=false;value.url="";}
 else{value.visibility="public";value.published=true;if(value.kind==="article")value.publishedAt="";}
 if(!categories(value.kind).some(c=>c.id===value.categoryId))throw new Error("分类不属于当前页面，请重新选择");
 if(value.relatedId&&!findEntry(value.relatedId))throw new Error("关联记录不存在");
 if(value.kind==="paper"){
  const reference=value.url?paperReference(value.url):null;if(value.url&&!reference)throw new Error("请填写有效的论文链接或 DOI");value.url=reference?.url||"";
  value.paper={...emptyPaper(),...value.paper};
  if(reference?.doi&&value.paper.doi&&reference.doi!==value.paper.doi.toLowerCase())throw new Error("论文链接与 DOI 不一致，请核对");
  value.paper.doi=reference?.doi||value.paper.doi.toLowerCase();if(!value.url&&value.paper.doi)value.url="https://doi.org/"+value.paper.doi;value.publishedAt="";
  if(value.paper.fileHash&&listEntries(true,"paper").some(e=>e.id!==id&&e.paper?.fileHash===value.paper!.fileHash))throw Object.assign(new Error("该论文文件已经收藏过了"),{status:409});
  if(value.paper.venueType==="conference"||value.paper.venueType==="preprint"){value.paper.sci={value:"",year:"",sourceUrl:"",evidence:""};value.paper.impactFactor={value:"",year:"",sourceUrl:"",evidence:""};}
  if(value.paper.venueType==="preprint")value.paper.ccf={value:"",year:"",sourceUrl:"",evidence:""};
 }
 const canonical=value.kind==="paper"?(value.paper?.doi||value.url?canonicalUrl(value.paper?.doi?"https://doi.org/"+value.paper.doi:value.url):"paper-local:"+createHash("sha256").update(value.paper?.fileHash||[value.title.normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim(),value.paper?.year,...value.paper?.authors||[]].join("|")).digest("hex")):(value.kind==="bookmark"||value.kind==="article")?canonicalUrl(value.url):"";
 const now=new Date().toISOString(),entryId=id||randomUUID();
 const json=JSON.stringify(value);
 try{
 if(previous){
   const r=db.prepare("UPDATE entries SET data=?,canonical_url=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?").run(json,canonical,now,entryId,expectedRevision!);
   if(!r.changes)throw Object.assign(new Error("内容已更新，请刷新重试"),{status:409});
 }else db.prepare("INSERT INTO entries(id,kind,data,canonical_url,revision,created_at,updated_at) VALUES(?,?,?,?,1,?,?)").run(entryId,value.kind,json,canonical,now,now);
 }catch(e){if(String(e).includes("UNIQUE"))throw Object.assign(new Error("该网址已经收藏过了"),{status:409});throw e;}
 return findEntry(entryId)!;
}
export function deleteEntry(id:string,revision:number){
 const e=findEntry(id);if(!e)throw Object.assign(new Error("记录不存在"),{status:404});
 if(e.revision!==revision)throw Object.assign(new Error("记录已更新，请刷新重试"),{status:409});
 db.prepare("DELETE FROM entries WHERE id=? AND revision=?").run(id,revision);
 // Clear obsolete links without changing unrelated record content.
 for(const linked of listEntries(true).filter(x=>x.relatedId===id)){const{id:lid,revision:lr,createdAt,updatedAt,...data}=linked;void createdAt;void updatedAt;saveEntry({...data,relatedId:""},lid,lr);}
}
export function getSetting(key:string){return (db.prepare("SELECT value FROM settings WHERE key=?").get(key) as {value:string}|undefined)?.value;}
export function setSetting(key:string,value:string){db.prepare("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key,value);}
export function consumeLimit(key:string,limit:number,windowMs:number){
 const now=Date.now();db.prepare("DELETE FROM rate_limits WHERE expires_at<?").run(now);
 db.prepare("INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1").run(key,now+windowMs);
 const row=db.prepare("SELECT count FROM rate_limits WHERE key=?").get(key) as {count:number};
 if(row.count>limit)throw Object.assign(new Error("操作较频繁，请稍后再试"),{status:429});
}
if(!getSetting("seeded")){
 const seeds=[
 ["GitHub","https://github.com","全球开发者的代码协作平台，发现开源项目，也记录自己的创造。","development",["开源社区"],true],
 ["Hugging Face","https://huggingface.co","探索模型、数据集与机器学习应用，让想法更快走向实践。","ai",["机器学习"],true],
 ["arXiv","https://arxiv.org","开放获取的学术论文预印本平台，追踪值得深入阅读的研究。","research",["论文检索"],true],
 ["MDN Web Docs","https://developer.mozilla.org","由 Mozilla 维护的 Web 开发文档，从基础知识到浏览器实践。","development",["Web 开发"],false],
 ["Figma","https://www.figma.com","在线界面设计与协作工具，让想法在画布上逐渐清晰。","design",["界面设计"],false],
 ["Vercel","https://vercel.com","前端部署与开发平台，了解现代 Web 应用的发布与运行。","development",["前端部署"],false],
 ] as const;
 for(const [title,url,description,categoryId,tags,pinned]of seeds)saveEntry({...emptyEntry("bookmark"),title,url,description,categoryId,tags:[...tags],pinned,visibility:"public",published:true});
 const articles=[
 ["Next.js 自托管指南","https://nextjs.org/docs/app/guides/self-hosting","从反向代理到缓存与流式响应，整理应用自行部署时需要理解的关键环节。","Next.js","development",["部署实践"]],
 ["SQLite 适用场景","https://sqlite.org/whentouse.html","了解嵌入式数据库如何服务个人应用，以及何时需要独立数据库服务。","SQLite","development",["数据存储"]],
 ["机器人研究的开放入口","https://arxiv.org/list/cs.RO/recent","通过机器人学预印本列表，寻找下一篇值得精读的论文。","arXiv","research",["机器人"]],
 ] as const;
 for(const [title,url,description,source,categoryId,tags]of articles)saveEntry({...emptyEntry("article"),title,url,description,source,categoryId,tags:[...tags],visibility:"public",published:true});
 setSetting("seeded","1");
}
