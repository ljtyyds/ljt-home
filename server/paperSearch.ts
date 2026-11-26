import {z} from "zod";
import {registryText,crossrefMetadata,arxivMetadata} from "./papers";
import {paperReference} from "@/shared/papers";
import {AppError} from "./auth";
import {resolvePublication,titleKey} from "./publications";
export {titleKey} from "./publications";
export const paperSearchInput=z.object({title:z.string().trim().min(3,"论文名至少填写 3 个字符").max(300)}).strict();
export type PaperCandidate={reference:string;title:string;authors:string[];venue:string;year:string;source:"Crossref"|"arXiv"|"正式论文集";match?:"exact"|"similar"};
export function titleScore(query:string,title:string){const a=titleKey(query),b=titleKey(title);if(a===b)return 100;const pairs=(value:string)=>new Set(Array.from({length:Math.max(0,value.length-1)},(_,i)=>value.slice(i,i+2)));const first=pairs(a),second=pairs(b);let common=0;for(const part of first)if(second.has(part))common++;return first.size+second.size?90*2*common/(first.size+second.size):0;}
export async function searchPapers(title:string,signal?:AbortSignal,read:typeof registryText=registryText){
 const query=paperSearchInput.parse({title}).title;const sources=await Promise.allSettled([
  (async()=>{const text=await read("https://api.crossref.org/works?query.bibliographic="+encodeURIComponent(query)+"&rows=25&filter=type:journal-article,type:proceedings-article,type:posted-content,type:book-chapter&select=DOI,title,author,container-title,type,published-print,published,issued",signal);const result=z.object({message:z.object({items:z.array(z.unknown()).max(30)})}).parse(JSON.parse(text));return result.message.items.flatMap(item=>{try{const parsed=z.object({DOI:z.string(),type:z.string().optional()}).parse(item);if(parsed.type&&!["journal-article","proceedings-article","posted-content","book-chapter"].includes(parsed.type))return[];const doi=parsed.DOI,reference=paperReference(doi);if(!reference)return[];const paper=crossrefMetadata({message:item},doi);return paper.title?[{reference:reference.url,title:paper.title,authors:paper.authors.slice(0,6),venue:paper.venue,year:paper.year,source:"Crossref" as const}]:[];}catch{return[];}});})(),
  (async()=>{const text=await read('https://export.arxiv.org/api/query?search_query='+encodeURIComponent('ti:"'+query.replace(/["\\]/g," ")+'"')+'&max_results=5',signal);return [...text.matchAll(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi)].flatMap(match=>{try{const url=match[0].match(/<id\b[^>]*>([^<]*)<\/id>/i)?.[1]||"",reference=paperReference(url);if(!reference?.arxiv)return[];const paper=arxivMetadata('<feed>'+match[0]+'</feed>',reference.arxiv);return[{reference:reference.url,title:paper.title,authors:paper.authors.slice(0,6),venue:paper.venue,year:paper.year,source:"arXiv" as const}];}catch{return[];}});})(),
 ]);
 if(signal?.aborted)throw new AppError("已取消论文检索",499);
 const candidates:PaperCandidate[]=[],seen=new Set<string>();for(const result of sources)if(result.status==="fulfilled")for(const candidate of result.value){const key=candidate.reference;if(!seen.has(key)){seen.add(key);candidates.push(candidate);}}
 const exact=candidates.find(c=>titleKey(c.title)===titleKey(query));if(exact)try{const formal=await resolvePublication(exact,read,signal);if(formal&&!seen.has(formal.sourceUrl)){candidates.unshift({reference:formal.doi?"https://doi.org/"+formal.doi:formal.sourceUrl,title:formal.title,authors:formal.authors.slice(0,6),venue:formal.venue,year:formal.year,source:"正式论文集"});}}catch{if(signal?.aborted)throw new AppError("已取消论文检索",499);}
 if(!candidates.length)throw new AppError(sources.every(r=>r.status==="rejected")?"论文检索接口暂不可用，可导入 PDF、文献文件或粘贴摘要继续。":"未找到可靠匹配，请补充完整论文名、DOI，或导入论文文件。",422);
 const ranked=candidates.map(candidate=>({...candidate,match:titleKey(candidate.title)===titleKey(query)?"exact" as const:"similar" as const})).sort((a,b)=>titleScore(query,b.title)-titleScore(query,a.title)||Number(a.source==="arXiv")-Number(b.source==="arXiv")).slice(0,8);
 return{candidates:ranked,message:(ranked.some(c=>c.match==="exact")?"已找到标题一致的候选。":"未找到完全一致的标题，以下为相近匹配。")+"请核对作者、年份后选择一篇；检索结果尚未保存。"};
}
