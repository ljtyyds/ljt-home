"use client";
import {memoExcerpt} from "@/shared/memoEditor";
import { Circle,CheckCircle2,Clock3,Link2,CalendarDays,ArrowUpRight,Check } from "lucide-react";
import type { Entry,Category } from "@/shared/types";
import { SiteMark,External,Tags,EntryActions,Empty } from "./Primitives";
import { dateLabel } from "./api";
import {useEntryOrder} from "./EntryOrder";
import {articleMark} from "@/shared/articleMark";
type Props={entries:Entry[];categories:Category[];admin:boolean;selected:string[];onSelect:(id:string)=>void;onEdit:(e:Entry)=>void;onDelete:(e:Entry)=>void;onPin:(e:Entry)=>void};
function SelectBox({entry,props}:{entry:Entry;props:Props}){return props.admin?<button className={"select-box "+(props.selected.includes(entry.id)?"checked":"")} aria-label={"选择 "+entry.title} aria-pressed={props.selected.includes(entry.id)} onClick={()=>props.onSelect(entry.id)}>{props.selected.includes(entry.id)?<Check size={11}/>:null}</button>:null;}
export function Bookmarks(props:Props&{list:boolean}){
 const{entries}=props,order=useEntryOrder();const pinned=entries.filter(e=>e.pinned),others=entries.filter(e=>!e.pinned);
 if(!entries.length)return <Empty title="这里还没有收藏" text="换一个关键词，或添加一个值得反复访问的网站。"/>;
 function group(items:Entry[],title:string){if(!items.length)return null;return <section className="content-section"><h2>{title}<span>{items.length}</span></h2><div className={"bookmark-grid "+(props.list?"list-layout":"")}>{items.map(e=><article className="bookmark-card" key={e.id} {...order.cardProps(e)}><div className="card-heading"><SelectBox entry={e} props={props}/><SiteMark entry={e}/><div className="site-heading"><a href={e.url} target="_blank" rel="noreferrer noopener">{e.title}</a><span>{new URL(e.url).hostname.replace(/^www\./,"")}</span></div><External entry={e}/></div><p>{e.description||"还没有简介，等你来补充。"}</p><div className="card-bottom"><Tags entry={e} categories={props.categories}/></div>{props.admin?<div className="card-admin"><EntryActions entry={e} {...props}/></div>:null}</article>)}</div></section>;}
 return <>{group(pinned,"置顶收藏")}{group(others,pinned.length?"更多发现":"全部收藏")}</>;
}
export function Articles(props:Props){
 const order=useEntryOrder();
 if(!props.entries.length)return <Empty title="还没有找到这条线索" text="换个关键词，或收藏一篇值得关注的内容。"/>;
 return <section className="article-list">{props.entries.map(e=><article className="article-row" key={e.id} {...order.cardProps(e)}><div className="article-source-mark" aria-hidden="true">{articleMark(e)}</div><div className="article-body"><div className="article-meta"><span>{e.source||"收藏资讯"}{e.pinned?" · 置顶":""}</span></div><a className="article-title" href={e.url} target="_blank" rel="noreferrer noopener">{e.title}<ArrowUpRight size={17}/></a><p>{e.description}</p><Tags entry={e} categories={props.categories}/></div>{props.admin?<div className="article-admin"><SelectBox entry={e} props={props}/><EntryActions entry={e} {...props}/></div>:null}</article>)}</section>;
}
export function Memos(props:Props){
 if(!props.entries.length)return <Empty title="留一点空间，给新的想法" text="创建一份备忘录，Markdown 编辑与自动保存会陪你一起记录。"/>;
 return <div className="memo-grid">{props.entries.map(e=><article className="memo-card" key={e.id}><button className="memo-open" onClick={()=>props.onEdit(e)}><span className="memo-date">{dateLabel(e.updatedAt)}</span><h2>{e.title}</h2><p>{memoExcerpt(e.content)||"这份备忘录还没有正文。"}</p></button><div className="card-bottom"><Tags entry={e} categories={props.categories}/><EntryActions entry={e} {...props}/></div></article>)}</div>;
}
export function Todos(props:Props&{allEntries:Entry[];onStatus:(e:Entry,status:Entry["status"])=>void}){
 const statuses=[["todo","待开始"],["doing","进行中"],["done","已完成"]] as const;
 return <div className="todo-board">{statuses.map(([status,label])=>{const items=props.entries.filter(e=>e.status===status).sort((a,b)=>Number(b.pinned)-Number(a.pinned));return <section className={"todo-column "+status} key={status}><h2><span className="status-dot"/>{label}<span>{items.length}</span></h2>{items.length?items.map(e=>{const related=props.allEntries.find(r=>r.id===e.relatedId),overdue=!!e.dueAt&&new Date(e.dueAt)<new Date()&&e.status!=="done";return <article className="todo-card" key={e.id}><div className="todo-title"><button className="icon-button" onClick={()=>props.onStatus(e,status==="done"?"todo":"done")} aria-label={(status==="done"?"重新打开 ":"完成 ")+e.title}>{status==="done"?<CheckCircle2 size={19}/>:<Circle size={19}/>}</button><button className="text-button" onClick={()=>props.onEdit(e)}>{e.title}</button></div>{e.description?<p className="todo-note-excerpt">{memoExcerpt(e.description)}</p>:null}<div className="todo-details"><span className={"priority "+e.priority}>{({low:"低优先级",medium:"中优先级",high:"高优先级"})[e.priority]}</span>{e.dueAt?<span className={overdue?"overdue":""}><CalendarDays size={12}/>{dateLabel(e.dueAt,true)}</span>:null}</div>{related?<button className="related-link" onClick={()=>props.onEdit(related)}><Link2 size={12}/>{related.title}</button>:null}<div className="todo-bottom"><select aria-label={e.title+" 的状态"} value={status} onChange={ev=>props.onStatus(e,ev.target.value as Entry["status"])}>{statuses.map(([s,l])=><option key={s} value={s}>{l}</option>)}</select><EntryActions entry={e} {...props}/></div></article>;}):<div className="todo-empty"><Clock3 size={22}/><span>{status==="done"?"完成的事，会在这里留下足迹。":"暂时没有事项"}</span></div>}</section>;})}</div>;
}
