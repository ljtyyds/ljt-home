import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";
export function isPublicAddress(address:string){
 try{return ipaddr.process(address).range()==="unicast";}catch{return false;}
}
export async function extractWeb(input:string,redirects=0,deadline=Date.now()+8000):Promise<{title:string;description:string;text:string}>{
 if(Date.now()>=deadline)throw new Error("网页读取预算已用完");
 if(redirects>3)throw new Error("网页重定向过多");
 const url=new URL(input),host=url.hostname.replace(/^\[|\]$/g,"");
 if(!["https:","http:"].includes(url.protocol)||url.username||url.password||url.port&&!["80","443"].includes(url.port))throw new Error("网页地址不受支持");
 const addresses=await Promise.race([lookup(host,{all:true}),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("DNS 查询超时")),Math.max(1,Math.min(2000,deadline-Date.now()))).unref())]);
 if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new Error("仅允许读取公开互联网网页");
 const result=await new Promise<{html?:string;redirect?:string}>((resolve,reject)=>{
  const address=addresses[0];
  const request=url.protocol==="https:"?httpsRequest:httpRequest;
  // Pin DNS to a checked address, including on every redirect.
  const req=request(url,{
   lookup:(_hostname,options,callback)=>{
    if(typeof options==="object"&&options.all)callback(null,[address]);
    else callback(null,address.address,address.family);
   },
   headers:{"User-Agent":"XingyuPortal/1.0 (bookmark metadata)","Accept":"text/html,text/plain;q=0.9"},
   timeout:Math.max(1,Math.min(5000,deadline-Date.now())),
  },res=>{
   if(res.statusCode&&[301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.resume();resolve({redirect:new URL(res.headers.location,url).toString()});return;}
   if(res.statusCode!==200){res.resume();reject(new Error("网页暂时不可访问"));return;}
   if(!/text\/html|text\/plain/i.test(res.headers["content-type"]||"")){res.resume();reject(new Error("仅支持文字网页"));return;}
   const chunks:Buffer[]=[];let total=0;
    res.on("data",(chunk:Buffer)=>{total+=chunk.length;if(total>1048576){res.destroy(new Error("网页内容过大"));return;}chunks.push(chunk);});
   res.on("end",()=>resolve({html:Buffer.concat(chunks).toString("utf8")}));res.on("error",reject);
  });
  const budget=setTimeout(()=>req.destroy(new Error("网页读取预算已用完")),Math.max(1,deadline-Date.now()));budget.unref();
  req.once("close",()=>clearTimeout(budget));
  req.on("timeout",()=>req.destroy(new Error("网页读取超时")));req.on("error",reject);req.end();
 });
 if(result.redirect)return extractWeb(result.redirect,redirects+1,deadline);
 const html=result.html||"";
 const clean=(s:string)=>s.replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
  let title=clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").slice(0,200);
 const metas=html.match(/<meta\b[^>]*>/gi)||[];
  if(!title){const titleMeta=metas.find(t=>/(?:name|property)\s*=\s*["']og:title["']/i.test(t))||"";title=clean(titleMeta.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]||"").slice(0,200);}
 const meta=metas.find(t=>/(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(t))||"";
 const description=clean(meta.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]||"").slice(0,2000);
 const text=clean(html.replace(/<(script|style|nav|footer|header)\b[\s\S]*?<\/\1>/gi," ")).slice(0,10000);
 return{title,description,text};
}
