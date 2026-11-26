import {categories,listEntries,canonicalUrl} from "./db";
import {kindLabels,kinds,type Entry,type Kind} from "@/shared/types";
import {paperReference,paperSearch} from "@/shared/papers";
import {messageLinks} from "@/shared/organize";
import {isContextFollowup,type SiteContextInfo} from "@/shared/siteContext";

type Options={pageKind?:Kind|"all";history?:Array<{role:string;content:string}>;offset?:number;contextIds?:string[]};
const scopePatterns:Array<[Kind,RegExp]>=[["paper",/论文|文献|paper(?:s)?\b|\bpdf\b/i],["memo",/备忘|笔记|\bmemos?\b|\bnotes?\b/i],["todo",/待办|任务|日程|计划|\btodos?\b|\btasks?\b/i],["bookmark",/关注网站|收藏网站|网站收藏|书签|网址|\bbookmarks?\b/i],["article",/行业前沿|资讯|推文|新闻|\barticles?\b|\bnews\b/i]];
export function siteScopes(message:string):Kind[]|undefined{
 message=message.replace(/https?:\/\/\S+/g," ");
 const found=scopePatterns.filter(([,pattern])=>pattern.test(message)).map(([kind])=>kind);if(found.length)return found;
 if(/全站|整个网站|(?:所有|全部)(?:站内)?(?:的)?(?:资料|记录|内容|文件)|站内(?:所有|全部)?(?:的)?(?:资料|记录|内容|文件)|all\s+(?:saved\s+)?(?:records|content|materials)/i.test(message))return [...kinds];
}
export function isSiteRequest(message:string){return !!siteScopes(message)&&/总结|汇总|概览|梳理|归纳|分析|比较|对比|读|查|有哪|多少|列出|清单|推荐|summari[sz]e|overview|list|compare/i.test(message);}
function wholeCollection(message:string){
 const match=message.match(/(?:论文库|备忘录|待办事项|关注网站|行业前沿|(?:所有|全部)(?:的)?(?:论文|文献|笔记|待办|资讯|网站|记录|资料)|(?:全站|站内)(?:的)?(?:所有|全部)?(?:资料|记录|内容|文件))(?:的)?(?:资料|内容|记录|资讯)?(?=[，。；！？!?]|$|并|然后|请)/i);
 // Instructions after an overview phrase are not topic filters; a topic before it still is.
 return !!match&&terms(message.slice(0,match.index)).length===0;
}
function terms(message:string){
 const cleaned=message.toLowerCase().replace(/https?:\/\/\S+/g," ").replace(/第[\d一二三四五六七八九十两]+(?:篇|条|个|项)/g," ").replace(/总结|汇总|概览|概述|梳理|归纳|分析|比较|对比|读取|阅读|查找|查询|列出|清单|推荐|论文库|论文|文献|备忘录|备忘|笔记|待办事项|待办|任务|日程|计划|关注网站|收藏网站|网站收藏|行业前沿|资讯|推文|新闻|书签|资料|记录|内容|文件|全站|站内|当前|全部|所有|这些|那些|其中|一下|帮我|请你|我的|我在|保存|的|里面|剩余|继续|详细|完整|全文|\b(?:summari[sz]e|summary|overview|list|compare|papers?|pdf|memos?|notes?|todos?|tasks?|bookmarks?|articles?|news|all|my|saved|records?|content|materials?|the|please)\b/gi," ");
 const result=new Set(cleaned.match(/[a-z0-9_]{2,}/g)||[]);for(const run of cleaned.match(/[\u4e00-\u9fff]{2,}/g)||[]){result.add(run);for(let i=0;i<run.length-1;i++)result.add(run.slice(i,i+2));}return [...result].slice(0,100);
}
function urlKey(url:string){try{return canonicalUrl(paperReference(url)?.url||url);}catch{return "";}}
function ordinal(message:string){const text=message.match(/第([\d一二三四五六七八九十两]+)(?:篇|条|个|项)/)?.[1];if(!text)return;const digits:Record<string,number>={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};if(/^\d+$/.test(text))return Number(text);if(text.includes("十")){const[a,b]=text.split("十");return(a?digits[a]:1)*10+(b?digits[b]:0);}return digits[text];}
export const SITE_CONTEXT_LIMIT=64000;
/** Server identity is authoritative; page hints, cursors and history never grant access. */
export function buildSiteContext(message:string,admin:boolean,options:Options={}){
 const allowed=listEntries(admin),notes:string[]=[],followup=isContextFollowup(message);
 let origin=message;if(followup){const previous=[...(options.history||[])].reverse().find(m=>m.role==="user"&&!isContextFollowup(m.content));if(previous)origin=previous.content;}
 const requested=siteScopes(message)||siteScopes(origin)||(options.pageKind&&options.pageKind!=="all"?[options.pageKind]:kinds.filter(k=>admin||!["memo","todo"].includes(k)));
 let scope=requested.filter(kind=>admin||!["memo","todo"].includes(kind));const denied=scope.length!==requested.length;
 if(denied)notes.push("当前身份不能读取私人备忘录与待办；未提供任何私有记录，也不能据此推断私人资料是否存在。");
 let scoped=allowed.filter(e=>scope.includes(e.kind)).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
 const links=messageLinks(message),query=terms(followup?origin:message),overview=/总结|汇总|概览|梳理|归纳|分析|比较|对比|全部|所有|有哪|多少|列出|清单|summari[sz]e|overview|list|compare/i.test(message);
 let selected:Entry[];
 if(links.length){const keys=links.map(urlKey);selected=allowed.filter(e=>e.url&&keys.includes(urlKey(e.url)));if(selected.length){scope=[...new Set(selected.map(e=>e.kind))];scoped=allowed.filter(e=>scope.includes(e.kind));}}
 else if(!query.length||overview&&wholeCollection(followup?origin:message))selected=scoped;
 else{selected=scoped.map(e=>{const title=e.title.toLowerCase(),tags=e.tags.join(" ").toLowerCase(),text=(e.description+" "+e.content+" "+paperSearch(e.paper)).toLowerCase();return{e,score:query.reduce((score,t)=>score+(title.includes(t)?6:0)+(tags.includes(t)?4:0)+(text.includes(t)?1:0),0)};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).map(r=>r.e);
  if(!selected.length&&overview&&scoped.length){selected=scoped;notes.push("主题词未直接命中，已按请求范围提供站内记录供分析；不能把本次关键词未命中说成资料库为空。");}}
 const number=ordinal(message);if(number){const previous=followup&&options.contextIds?.length?options.contextIds.map(id=>allowed.find(e=>e.id===id)).filter((e):e is Entry=>!!e&&scope.includes(e.kind)):selected;selected=previous[number-1]?[previous[number-1]]:[];if(!selected.length)notes.push("指定序号不在当前可访问资料中，请提供标题或先列出资料。");}
 else if(followup&&/^(?:请)?(?:这篇|这条|这个|它(?!们))/.test(message.trim())&&options.contextIds?.length===1){selected=allowed.filter(e=>e.id===options.contextIds![0]&&scope.includes(e.kind));}
 const matched=selected.length,offset=number?0:Math.min(Math.max(0,options.offset||0),matched),labels=new Map(kinds.flatMap(kind=>categories(kind).map(c=>[kind+":"+c.id,c.name])));
 const records:Array<{reference:string;id:string;kind:Kind;title:string;category:string;tags:string[];summary:string;content:string;contentLength:number;contentTruncated:boolean;url:string;visibility:string;paper?:Entry["paper"];status?:string;priority?:string;dueAt?:string;updatedAt:string;basis:string}>=[];
 const recordBudget=SITE_CONTEXT_LIMIT-2500;let size=0;for(const e of selected.slice(offset,offset+100)){
  const record={reference:"S"+(offset+records.length+1),id:e.id,kind:e.kind,title:e.title,category:labels.get(e.kind+":"+e.categoryId)||e.categoryId,tags:e.tags,summary:e.description,content:e.content.slice(0,50000),contentLength:e.content.length,contentTruncated:false,url:e.url,visibility:e.visibility,paper:e.kind==="paper"?e.paper:undefined,status:e.kind==="todo"?e.status:undefined,priority:e.kind==="todo"?e.priority:undefined,dueAt:e.dueAt||undefined,updatedAt:e.updatedAt,basis:e.kind==="paper"&&!e.content?"已保存的论文书目信息与摘要；文件名不代表原PDF已保存，未读取PDF全文":e.content?"站内已保存正文":"站内已保存标题与摘要"};
  record.contentTruncated=record.content.length<e.content.length;let length=JSON.stringify(record).length;
  if(size+length>recordBudget){if(records.length)break;record.content=record.content.slice(0,Math.max(0,recordBudget-(length-record.content.length)-32));record.contentTruncated=record.content.length<e.content.length;length=JSON.stringify(record).length;}
  if(size+length>recordBudget)break;records.push(record);size+=length;
 }
 const nextOffset=offset+records.length<matched?offset+records.length:null,partialRecords=records.filter(r=>r.contentTruncated).length;
 if(partialRecords)notes.push("部分长正文仅提供节选，不能声称已阅读全文；可指定某条记录要求详细总结。");
 if(records.some(r=>r.kind==="paper"&&!r.content))notes.push("论文依据为已保存的书目信息与摘要，原PDF未作为附件保存；可以总结现有资料，但不能声称读过未保存的PDF全文。");
 if(nextOffset!==null)notes.push("本批未覆盖全部匹配记录；可继续读取剩余资料，不要把本批称为全库内容。");
 const info:SiteContextInfo={scope,scopeLabel:scope.length===kinds.length?"全站资料":scope.map(k=>kindLabels[k]).join("、")||"无权访问的资料",totalAvailable:scoped.length,matched,included:records.length,offset,nextOffset,partialRecords,denied,notes,records:records.map(({id,kind,title,url,reference})=>({id,kind,title,url,reference}))};
 return{records,info};
}
