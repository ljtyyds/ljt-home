"use client";
import { X,Star,ExternalLink,Pin, Pencil,Trash2,BookOpen,LockKeyhole } from "lucide-react";
import { useEffect,useId,useRef } from "react";
import type { Entry,Category } from "@/shared/types";
import {EntryOrderHandle} from "./EntryOrder";
export function Brand(){return <div className="brand"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 1C23 15 25 17 39 20C25 23 23 25 20 39C17 25 15 23 1 20C15 17 17 15 20 1Z" fill="currentColor"/></svg><div><strong>个人知识门户</strong></div></div>;}
export function Dialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){
 const titleId=useId(),ref=useRef<HTMLDialogElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{const d=ref.current;d?.showModal();const cancel=(e:Event)=>{e.preventDefault();closeRef.current();};d?.addEventListener("cancel",cancel);return()=>{d?.removeEventListener("cancel",cancel);d?.close();};},[]);
 return <dialog ref={ref} aria-labelledby={titleId} className={"modal "+(wide?"wide":"")} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}><div className="modal-head"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="关闭窗口" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
const colors=["#466d98","#8b62a2","#c97647","#467d69","#9a5a65"];
export function SiteMark({entry}:{entry:Entry}){
 const host=(()=>{try{return new URL(entry.url).hostname;}catch{return "";}})();
 const brands:Record<string,{text:string;color:string;bg:string}>={
 "chatgpt.com":{text:"C",color:"#f4ffff",bg:"#168b77"},"youtube.com":{text:"Y",color:"#fff",bg:"#bd4a42"},"www.youtube.com":{text:"Y",color:"#fff",bg:"#bd4a42"},
 "github.com":{text:"GH",color:"#fff",bg:"#1d252b"},"huggingface.co":{text:"HF",color:"#885d0b",bg:"#fff0bd"},"arxiv.org":{text:"X",color:"#b51f31",bg:"#fff1f2"},"developer.mozilla.org":{text:"M",color:"#fff",bg:"#182426"},"www.figma.com":{text:"F",color:"#a35ae6",bg:"#f4e8ff"},"vercel.com":{text:"▲",color:"#fff",bg:"#20282a"}
 };
 const b=brands[host];return <span className="site-mark" style={{color:b?.color||colors[entry.title.length%colors.length],background:b?.bg||"#edf2f4"}}>{b?.text||entry.title.slice(0,1).toUpperCase()}</span>;
}
export function EntryActions({entry,onEdit,onDelete,onPin}:{entry:Entry;onEdit:(e:Entry)=>void;onDelete:(e:Entry)=>void;onPin:(e:Entry)=>void}){
 return <div className="entry-actions"><EntryOrderHandle entry={entry}/><button className={"icon-button "+(entry.pinned?"active":"")} onClick={()=>onPin(entry)} aria-label={(entry.pinned?"取消置顶 ":"置顶 ")+entry.title}><Pin size={15}/></button><button className="icon-button" onClick={()=>onEdit(entry)} aria-label={"编辑 "+entry.title}><Pencil size={15}/></button><button className="icon-button danger" onClick={()=>onDelete(entry)} aria-label={"删除 "+entry.title}><Trash2 size={15}/></button></div>;
}
export function Tags({entry,categories}:{entry:Entry;categories:Category[]}){
 return <div className="tags"><span className="tag category">{categories.find(c=>c.id===entry.categoryId)?.name||"其他"}</span>{entry.tags.slice(0,3).map(t=><span className="tag" key={t}>{t}</span>)}</div>;
}
export function Visibility({entry}:{entry:Entry}){return entry.visibility==="private"?<span className="visibility"><LockKeyhole size={11}/>私有</span>:!entry.published?<span className="visibility">草稿</span>:null;}
export function Empty({title,text,action}:{title:string;text:string;action?:React.ReactNode}){return <div className="empty"><BookOpen size={34}/><h3>{title}</h3><p>{text}</p>{action}</div>;}
export function External({entry}:{entry:Entry}){return <a href={entry.url} target="_blank" rel="noreferrer noopener" aria-label={"访问 "+entry.title} className="external"><ExternalLink size={18}/></a>;}
export function StarIcon(){return <Star size={16}/>;}
