"use client";
import {BookOpen,ArrowUpRight,Users,CalendarDays} from "lucide-react";
import type {Entry,Category} from "@/shared/types";
import {emptyPaper,metricLabels,paperTitleUrl} from "@/shared/papers";
import {EntryActions,Tags,Empty} from "./Primitives";
import {useEntryOrder} from "./EntryOrder";
export default function Papers({entries,categories,admin,onEdit,onDelete,onPin}:{entries:Entry[];categories:Category[];admin:boolean;onEdit:(e:Entry)=>void;onDelete:(e:Entry)=>void;onPin:(e:Entry)=>void}){
 const order=useEntryOrder();
 if(!entries.length)return <Empty title="让第一篇论文在这里落下" text={admin?"点击新增论文，粘贴 DOI、arXiv 或论文链接，让 AI 辅助整理，也可以手动录入。":"这里还没有论文，换个关键词试试。"}/>;
 const sorted=[...entries].sort((a,b)=>Number(b.pinned)-Number(a.pinned));
 return <section className="paper-grid" aria-label="论文列表">{sorted.map(entry=>{const paper=entry.paper||emptyPaper(),url=paperTitleUrl(entry);return <article className="paper-card" key={entry.id} {...order.cardProps(entry)}>
  <div className="paper-heading"><span className="paper-symbol"><BookOpen size={21}/></span><div className="paper-heading-text"><div className="paper-eyebrow"><span>{paper.venueType==="preprint"?"预印本":paper.venueType==="conference"?"会议论文":paper.venueType==="journal"?"期刊论文":"论文"}</span>{entry.pinned?<span>置顶</span>:null}</div>{url?<a className="paper-title" href={url} target="_blank" rel="noreferrer noopener">{entry.title}<ArrowUpRight size={17}/></a>:<span className="paper-title" title="暂无论文链接，可由管理员编辑补充">{entry.title}</span>}</div></div>
  <dl className="paper-facts"><div><dt><Users size={13}/>作者</dt><dd>{paper.authors.join("；")||"未提供"}</dd></div><div><dt>期刊 / 会议</dt><dd>{paper.venue||"未核实"}</dd></div><div><dt><CalendarDays size={13}/>出版年份</dt><dd>{paper.year||"未核实"}{paper.venueType==="preprint"&&paper.year?<span className="muted"> · 预印本记录年份</span>:null}</dd></div><div><dt>大致领域</dt><dd>{paper.field||"未提供"}</dd></div></dl>
  <div className="paper-metrics">{(["sci","ccf","impactFactor"] as const).map(key=>{const metric=paper[key];const unavailable=paper.venueType==="preprint"||key!=="ccf"&&paper.venueType==="conference";return <div className="paper-metric" key={key}><span>{metricLabels[key]}</span><strong>{metric.value?(key==="sci"?paper.sciScheme+" ":"")+metric.value:unavailable?"不适用":"未核实"}</strong>{metric.value?<small>{metric.year||"年份未提供"} · {key==="ccf"?"目录年度":"指标年度"}</small>:null}</div>;})}</div>
  <div className="paper-summary"><span>大致摘要</span><p>{entry.description||"尚未获取摘要，可由管理员补充。"}</p></div>
  {(paper.sci.value||paper.ccf.value||paper.impactFactor.value)?<details className="paper-evidence"><summary>指标年度与来源</summary>{(["sci","ccf","impactFactor"] as const).filter(key=>paper[key].value).map(key=><div key={key}><strong>{metricLabels[key]} · {paper[key].year||"年份未提供"}</strong>{paper[key].sourceUrl?<a href={paper[key].sourceUrl} target="_blank" rel="noreferrer noopener">查看来源 ↗</a>:<span>来源未提供</span>}<p>{paper[key].evidence||"未提供依据原句，请人工核实。"}</p></div>)}</details>:null}
  <div className="paper-provenance">{paper.fileName?<span>文件：{paper.fileName}</span>:null}{paper.doi?<span>DOI: {paper.doi}</span>:null}{paper.metadataUrl?<a href={paper.metadataUrl} target="_blank" rel="noreferrer noopener">{paper.metadataSource||"书目来源"} ↗</a>:paper.metadataSource?<span>{paper.metadataSource}</span>:null}</div>
  <div className="paper-bottom"><Tags entry={entry} categories={categories}/>{admin?<EntryActions entry={entry} onEdit={onEdit} onDelete={onDelete} onPin={onPin}/>:null}</div>
 </article>;})}</section>;
}
