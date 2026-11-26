"use client";
import { useState } from "react";
import type { OrganizedDraft,PublicKind } from "@/shared/organize";
import type { Category,Entry } from "@/shared/types";
import type {CategoryCatalog} from "@/shared/categories";
import { kindLabels } from "@/shared/types";
import { api,send } from "./api";
import { makeEntry,dataOf,Markdown } from "./EntryEditor";
export default function OrganizeCard({result,catalog,onSaved,onEdit}:{result:OrganizedDraft;catalog:CategoryCatalog;onSaved:(entry:Entry)=>void;onEdit:(entry:Entry)=>void}){
 const[kind,setKind]=useState<PublicKind>(result.suggestion.kind),[category,setCategory]=useState(result.suggestion.categoryId),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState("");
 const categories=catalog[kind];
 const entry={...(result.existing||makeEntry(kind)),...result.suggestion,kind,categoryId:category};
 async function save(){if(busy||saved||result.needsContent)return;setBusy(true);setError("");try{const response=await api<{entry:Entry}>("entries",send(entry.id?"PUT":"POST",entry.id?{id:entry.id,revision:entry.revision,data:dataOf(entry)}:dataOf(entry)));onSaved(response.entry);setSaved(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="organize-card" aria-label="链接整理草稿"><strong>{result.needsContent?"需要补充文章内容":result.existing?"已有收藏的整理建议":"链接整理草稿"}</strong><a href={result.suggestion.url} target="_blank" rel="noreferrer noopener">{result.suggestion.title||result.suggestion.url}</a><p className="organize-source" role="status">{result.acquisition.message}</p>{result.needsContent?<p>请直接在聊天中粘贴原文或导入截图，并说明“继续分类”。</p>:<><div className="form-row"><label>保存位置<select aria-label="草稿保存位置" value={kind} disabled={!!result.existing||busy||saved} onChange={e=>{setKind(e.target.value as PublicKind);setCategory("other");}}><option value="bookmark">关注网站</option><option value="article">行业前沿</option></select></label><label>分类<select aria-label="草稿分类" value={category} disabled={busy||saved} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><Markdown>{result.suggestion.description}</Markdown><p className="organize-tags">{result.suggestion.tags.join(" · ")}</p><div className="organize-actions"><button className="button secondary" disabled={busy||saved} onClick={()=>onEdit(entry)}>编辑草稿</button><button className="button primary" disabled={busy||saved||!entry.title.trim()} onClick={()=>void save()}>{busy?"保存中…":saved?"已保存":result.existing?"应用到已有记录":"保存为"+kindLabels[kind]}</button></div>{!result.existing?<small>保存后会出现在读者端；保存前可以编辑核对。</small>:null}</>}{error?<p role="alert" className="form-error">{error}</p>:null}</section>;
}
