import { extractWeb } from "./web";
import { canonicalUrl,listEntries } from "./db";
import type { Acquisition,PublicKind } from "@/shared/organize";
export type WebReader=typeof extractWeb;
type Input={url:string;title?:string;description?:string;content?:string;kind?:PublicKind|"auto";contentSource?:"provided"|"saved"};
export function blockedPage(meta:{title:string;description:string;text:string}){
 const text=(meta.title+" "+meta.description+" "+meta.text).trim();
 return text.length<1800&&/当前环境异常|环境异常.{0,50}验证|完成验证后|访问过于频繁|请输入验证码|安全验证|访问已被拦截|verify you are human|just a moment|access denied|enable javascript and cookies/i.test(text);
}
export function inferKind(url:string):PublicKind{const u=new URL(url);return /(^|\.)mp\.weixin\.qq\.com$/i.test(u.hostname)||/\/(?:s\/|articles?\/|news\/|posts?\/|papers?\/|abs\/|blog\/[^/])/i.test(u.pathname)?"article":"bookmark";}
export function exactEntry(url:string,admin:boolean){const key=canonicalUrl(url);return listEntries(admin).find(e=>(e.kind==="bookmark"||e.kind==="article")&&canonicalUrl(e.url)===key);}
export async function resolveContent(input:Input,readWeb:WebReader=extractWeb){
 let title=(input.title||"").trim(),description=input.description||"",content=input.content||"";
 const host=new URL(input.url).hostname;
 if(title===host||/^https?:\/\//i.test(title))title="";
 if(!content.trim()&&/环境异常.{0,100}验证|未获取.{0,15}正文|未读取.{0,15}原文|无法判断.{0,10}主题/.test(description))description="";
 let acquisition:Acquisition={status:"failed",source:"web",message:"网页暂时无法读取，请补充真实标题、摘要或正文。"};
 let metadataRead=false;
 if(content.trim())acquisition={status:"ok",source:input.contentSource||"provided",message:input.contentSource==="saved"?"使用已保存正文整理，未再次抓取网页。":"使用你提供的正文整理，未再次抓取网页。"};
 else{
  try{
   const meta=await readWeb(input.url);
   if(blockedPage(meta))acquisition={status:"blocked",source:"web",message:"网页返回验证或访问限制页面，尚未读到原文。请粘贴正文，或补充真实标题与摘要。"};
   else{
    title=title||meta.title;description=description||meta.description;content=meta.text;metadataRead=true;
    acquisition={status:meta.text.trim().length>=160?"ok":"partial",source:"web",message:meta.text.trim().length>=160?"已读取网页内容，可检查建议后保存。":"仅获取到部分网页信息，请检查分类依据。"};
   }
  }catch{}
 }
 const usable=!!(title||description.trim()||content.trim());
 if(!content.trim()&&usable)acquisition={...acquisition,status:"partial",source:"provided",message:acquisition.message+" 本次仅依据已有标题和摘要。"};
 return{url:input.url,title,description,content:content.slice(0,50000),kind:input.kind&&input.kind!=="auto"?input.kind:inferKind(input.url),acquisition,metadataRead,usable};
}
