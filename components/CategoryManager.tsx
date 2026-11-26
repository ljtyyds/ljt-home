"use client";
import { useState } from "react";
import { FolderTree,Plus,Pencil,Trash2,Check,X,LoaderCircle } from "lucide-react";
import {kindLabels,kinds,type Kind} from "@/shared/types";
import type {CategoryCatalog} from "@/shared/categories";
import type { Category,Entry,Notice } from "@/shared/types";
import { api,send } from "./api";
import { Dialog } from "./Primitives";
type Props={catalog:CategoryCatalog;entries:Entry[];onChanged:(catalog:CategoryCatalog)=>Promise<void>;notify:(notice:Notice)=>void};
export default function CategoryManager({catalog,entries,onChanged,notify}:Props){
 const[kind,setKind]=useState<Kind>("bookmark");const categories=catalog[kind];
 const[name,setName]=useState(""),[editing,setEditing]=useState<Category|null>(null),[editName,setEditName]=useState("");
 const[deleting,setDeleting]=useState<Category|null>(null),[target,setTarget]=useState("other"),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const count=(id:string)=>entries.filter(entry=>entry.kind===kind&&entry.categoryId===id).length;
 async function create(event:React.FormEvent){
  event.preventDefault();if(busy||!name.trim())return;setBusy(true);setError("");
  try{const result=await api<{categories:Category[];byKind:CategoryCatalog}>("categories",send("POST",{name,kind}));await onChanged(result.byKind);setName("");notify({kind:"success",message:"新分类已添加，可用于手动选择和 AI 分类"});}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function rename(event:React.FormEvent){
  event.preventDefault();if(!editing||busy)return;setBusy(true);setError("");
  try{const result=await api<{categories:Category[];byKind:CategoryCatalog}>("categories",send("PUT",{id:editing.id,name:editName,expectedName:editing.name,kind}));await onChanged(result.byKind);setEditing(null);notify({kind:"success",message:"分类名称已更新"});}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function remove(){
  if(!deleting||busy)return;setBusy(true);setError("");
  try{const result=await api<{categories:Category[];byKind:CategoryCatalog;movedCount:number}>("categories",send("DELETE",{id:deleting.id,targetId:target,expectedName:deleting.name,kind}));await onChanged(result.byKind);setDeleting(null);setEditing(null);notify({kind:"success",message:"分类已删除，"+result.movedCount+" 条内容已转入接收分类"});}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="settings-panel category-manager" aria-label="分类管理"><div className="panel-title"><FolderTree size={21}/><div><h2>自定义分类</h2><p>各页面独立维护分类；新增、重命名和删除只影响当前页面。AI 使用对应页面的列表。</p></div></div>
  <div className="category-scope-tabs" role="group" aria-label="分类所属页面">{kinds.map(scope=><button type="button" key={scope} className={scope===kind?"active":""} aria-label={"管理"+kindLabels[scope]+"分类"} aria-pressed={scope===kind} disabled={busy} onClick={()=>{setKind(scope);setEditing(null);setDeleting(null);setName("");setError("");}}>{kindLabels[scope]}</button>)}</div>
  <form className="category-create" onSubmit={e=>void create(e)}><label>新分类名称<input aria-label="新分类名称" maxLength={30} value={name} onChange={e=>setName(e.target.value)} placeholder="例如：机器人、课程笔记" disabled={busy}/></label><button className="button primary" disabled={busy||!name.trim()}><Plus size={16}/>新增分类</button></form>
  <ul className="category-manager-list">{categories.map(category=><li key={category.id} className="category-manager-row">{editing?.id===category.id?<form className="category-rename" onSubmit={e=>void rename(e)}><input aria-label={"重命名分类 "+category.name} autoFocus maxLength={30} value={editName} disabled={busy} onChange={e=>setEditName(e.target.value)}/><button className="icon-button" aria-label="保存分类名称" disabled={busy||!editName.trim()}><Check size={17}/></button><button className="icon-button" type="button" aria-label="取消分类重命名" disabled={busy} onClick={()=>setEditing(null)}><X size={17}/></button></form>:<><div className="category-manager-name"><strong>{category.name}</strong><span>{count(category.id)} 条内容{category.id==="other"?" · 保留分类":""}</span></div>{category.id!=="other"?<div className="category-manager-actions"><button className="icon-button" aria-label={"重命名 "+category.name} disabled={busy} onClick={()=>{setEditing(category);setEditName(category.name);setError("");}}><Pencil size={16}/></button><button className="icon-button danger" aria-label={"删除分类 "+category.name} disabled={busy} onClick={()=>{setDeleting(category);setTarget("other");setError("");}}><Trash2 size={16}/></button></div>:null}</>}</li>)}</ul>
  <p className="hint">分类名最多 30 个字符；“其他”作为兜底分类保留。删除分类时会转移内容，内容本身会保留。</p>
  {error&&!deleting?<p className="form-error" role="alert">{error}</p>:null}
  {deleting?<Dialog title={"删除分类："+deleting.name} onClose={()=>{if(!busy)setDeleting(null);}}><div className="form-stack"><p className="muted">这个分类下的 {count(deleting.id)} 条内容将移入你选择的分类，内容本身会保留；其他页面不受影响。</p><label>接收分类<select aria-label="接收分类" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}>{categories.filter(c=>c.id!==deleting.id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{error?<p className="form-error" role="alert">{error}</p>:null}<div className="modal-actions"><button className="button secondary" disabled={busy} onClick={()=>setDeleting(null)}>取消</button><button className="button primary" disabled={busy} onClick={()=>void remove()}>{busy?<LoaderCircle size={16} className="spin"/>:<Trash2 size={16}/>}确认删除分类</button></div></div></Dialog>:null}
 </section>;
}
