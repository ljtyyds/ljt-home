import type {RegistryPaper} from "./papers";
import {paperReference} from "@/shared/papers";
import {crossrefMetadata} from "./papers";

export type PublicationReader=(url:string,signal?:AbortSignal)=>Promise<string>;
type Seed=Pick<RegistryPaper,"title"|"authors"|"year">;
export function titleKey(text:string){return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");}
function clean(text:string){return text.replace(/<[^>]*>/g," ").replace(/&#(\d+);/g,(_,n)=>{const v=Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):" ";}).replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();}
export const publisherHosts=["proceedings.mlr.press","openaccess.thecvf.com","proceedings.neurips.cc","papers.nips.cc","aclanthology.org","ojs.aaai.org","proceedings.iclr.cc"];
export function publisherUrl(input:string){try{const u=new URL(input);if(!publisherHosts.includes(u.hostname)||u.username||u.password||u.port||!['http:','https:'].includes(u.protocol)||/\.pdf$/i.test(u.pathname))return null;u.protocol="https:";u.hash="";return u.toString();}catch{return null;}}
/** An exact title alone is insufficient to merge two works with different authors. */
export function sameWork(seed:Seed,record:Seed){
 if(!seed.title||titleKey(seed.title)!==titleKey(record.title)||!seed.authors.length||!record.authors.length)return false;
 const key=(author:string)=>{const parts=author.replace(/\s+\d{4}$/,"").split(",");return titleKey(parts.length===2?parts[1]+" "+parts[0]:author);};
 const a=seed.authors.map(key),b=record.authors.map(key);return a[0]===b[0]&&a.filter(name=>b.includes(name)).length>=Math.min(2,a.length,b.length);
}
/** Read citation tags from the actual proceedings page; do not infer venue from its hostname. */
export function publisherMetadata(html:string,url:string):RegistryPaper|undefined{
 const sourceUrl=publisherUrl(url);if(!sourceUrl)return;
 const tags=new Map<string,string[]>();for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const attrs=new Map<string,string>();for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs.set(m[1].toLowerCase(),clean(m[2]??m[3]));const name=(attrs.get("name")||attrs.get("property")||"").toLowerCase(),content=attrs.get("content");if(content)tags.set(name,[...(tags.get(name)||[]),content]);}
 const get=(name:string)=>tags.get(name)?.[0]||"",title=get("citation_title"),authors=tags.get("citation_author")||[],conference=get("citation_conference_title")||get("citation_inbook_title"),journal=get("citation_journal_title"),year=(get("citation_publication_date")||get("citation_date")).match(/^(?:19|20)\d{2}/)?.[0]||"";
 if(!title||!authors.length||!(conference||journal)||!year)return;
 const abstract=clean(html.match(/<(?:div|section|p)\b[^>]*\b(?:id|class)=["'](?:abstract|abstract-content)["'][^>]*>([\s\S]*?)<\/(?:div|section|p)>/i)?.[1]||get("citation_abstract"));
 return{title:title.slice(0,200),authors:authors.slice(0,200),venue:(conference||journal).slice(0,500),venueType:conference?"conference":"journal",year,doi:paperReference(get("citation_doi"))?.doi||"",abstract:abstract.slice(0,18000),source:new URL(sourceUrl).hostname==="proceedings.mlr.press"?"PMLR 正式会议论文集":"正式出版页面（书目元数据）",sourceUrl};
}
const caches=new WeakMap<PublicationReader,Map<string,{until:number;text:string}>>();
async function cached(url:string,read:PublicationReader,signal?:AbortSignal){
 if(signal?.aborted)throw signal.reason;let cache=caches.get(read);if(!cache){cache=new Map();caches.set(read,cache);}const hit=cache.get(url);if(hit&&hit.until>Date.now())return hit.text;
 const text=await read(url,signal);if(cache.size>=8)cache.delete(cache.keys().next().value!);cache.set(url,{until:Date.now()+300000,text});return text;
}
/** Bounded lookup in the publisher's own volume directories, including papers without a DOI. */
export async function pmlrPublication(seed:Seed,read:PublicationReader,signal?:AbortSignal){
 if(!/^(?:19|20)\d{2}$/.test(seed.year))return;
 const index=await cached("https://proceedings.mlr.press/",read,signal);
 const volumes=[...index.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].flatMap(m=>{const path=m[1].match(/href=["'](?:https:\/\/proceedings\.mlr\.press\/)?(v\d+)\/?["']/)?.[1],label=clean(m[1]);return path&&new RegExp("\\b"+seed.year+"\\b").test(label)?[{path,label}]:[];}).sort((a,b)=>Number(/workshop|competition/i.test(a.label))-Number(/workshop|competition/i.test(b.label))||Number(!/ICML|CoRL|AISTATS|COLT|UAI/i.test(a.label))-Number(!/ICML|CoRL|AISTATS|COLT|UAI/i.test(b.label))).slice(0,8);
 for(let start=0;start<volumes.length;start+=4){
  const results=await Promise.allSettled(volumes.slice(start,start+4).map(async volume=>{
   const url="https://proceedings.mlr.press/"+volume.path+"/",html=await cached(url,read,signal);
   for(const block of html.split(/<div\s+class=["']paper["']>/i).slice(1)){const title=clean(block.match(/<p\s+class=["']title["']>([\s\S]*?)<\/p>/i)?.[1]||"");if(titleKey(title)!==titleKey(seed.title))continue;
    const authors=clean(block.match(/<span\s+class=["']authors["']>([\s\S]*?)<\/span>/i)?.[1]||"").split(",").map(a=>a.trim()).filter(Boolean);if(!sameWork(seed,{title,authors,year:seed.year}))continue;
    const target=block.match(/href=["']([^"']+\.html)["'][^>]*>abs<\/a>/i)?.[1];if(!target)continue;const page=publisherUrl(new URL(target,url).toString());if(!page)continue;
    const record=publisherMetadata(await read(page,signal),page);if(record&&sameWork(seed,record))return record;
   }
  }));
  const records=results.flatMap(r=>r.status==="fulfilled"&&r.value?[r.value]:[]);if(records.length===1)return records[0];if(records.length>1)return;
 }
}
/** DBLP locates proceedings links; only the primary page's citation metadata is authoritative. */
export async function dblpPublication(seed:Seed,read:PublicationReader,signal?:AbortSignal){
 const json=JSON.parse(await read("https://dblp.org/search/publ/api?q="+encodeURIComponent(seed.title)+"&format=json&h=10",signal));
 const hits=json?.result?.hits?.hit;if(!Array.isArray(hits))return;
 const matches:RegistryPaper[]=[];
 for(const hit of hits.slice(0,10)){
  const info=hit?.info;if(!info||!["Conference and Workshop Papers","Journal Articles"].includes(info.type)||typeof info.title!=="string")continue;
  const raw=info.authors?.author,authors=(Array.isArray(raw)?raw:raw?[raw]:[]).map(a=>typeof a==="string"?a:a?.text).filter((a):a is string=>typeof a==="string");if(!sameWork(seed,{title:clean(info.title),authors,year:String(info.year||"")}))continue;
  const links=Array.isArray(info.ee)?info.ee:[info.ee];for(const value of links.slice(0,3)){const url=publisherUrl(typeof value==="string"?value:value?.text||"");if(!url)continue;try{const record=publisherMetadata(await read(url,signal),url);if(record&&sameWork(seed,record)&&!matches.some(r=>r.sourceUrl===record.sourceUrl))matches.push(record);}catch{}}
 }
 return matches.length===1?matches[0]:undefined;
}
export async function resolvePublication(seed:Seed,read:PublicationReader,signal?:AbortSignal):Promise<RegistryPaper|undefined>{
 if(!seed.title||!seed.authors.length)return;
 // Independent sources fail independently; verification pages and downtime never become metadata.
 const results=await Promise.allSettled([dblpPublication(seed,read,signal),pmlrPublication(seed,read,signal),(async()=>{
  const json=JSON.parse(await read("https://api.crossref.org/works?query.title="+encodeURIComponent(seed.title)+"&rows=12&select=DOI,title,author,container-title,type,published-print,published,issued,abstract",signal));
  const items=json?.message?.items;if(!Array.isArray(items))return;
  const records=items.slice(0,12).flatMap(item=>{try{if(!["journal-article","proceedings-article"].includes(item.type))return[];const record=crossrefMetadata({message:item},item.DOI);return record.venue&&sameWork(seed,record)?[record]:[];}catch{return[];}});
  return records.length===1?records[0]:undefined;
 })()]);
 if(signal?.aborted)throw signal.reason;
 const records=results.flatMap(r=>r.status==="fulfilled"&&r.value?[r.value]:[]),unique=[...new Map(records.map(r=>[r.sourceUrl,r])).values()];
 const primary=unique.filter(r=>publisherUrl(r.sourceUrl));return primary.length===1?primary[0]:!primary.length&&unique.length===1?unique[0]:undefined;
}
