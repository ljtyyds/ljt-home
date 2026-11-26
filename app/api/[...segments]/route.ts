import { NextRequest } from "next/server";
import { z } from "zod";
import { identity, requireAdmin, verifyOrigin, body, json, failure, login, logout, AppError } from "@/server/auth";
import { categories,categoryCatalog, addCategory, renameCategory, deleteCategory, listEntries, findEntry, saveEntry, deleteEntry, visible,entryOrderVersions,reorderEntries } from "@/server/db";
import { entryData, entryUpdate,entryOrderInput } from "@/server/validation";
import { kinds } from "@/shared/types";
import {importPaper,paperImportInput} from "@/server/papers";
import {paperSearchInput,searchPapers} from "@/server/paperSearch";
import {pdfAsset} from "@/server/pdfAssets";
import {paperMetricsInput,queryPaperMetrics} from "@/server/paperMetrics";
import {withAiSession} from "@/server/aiTransport";
import {memoImagesInput,saveMemoImages,readMemoImage} from "@/server/memoImages";
import {consumeLimit} from "@/server/db";
import { publicConfig, updateConfig, configInput, configured, checkConnection, chatInput, chatResponse, aiLimit, aiConfig, classify, undoClassification, classifyDraft, draftClassificationInput } from "@/server/ai";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{segments:string[]}>};
async function handle(req:NextRequest,ctx:Context){
 try{
 const segments=(await ctx.params).segments,path=segments.join("/"),method=req.method;
 const user=identity(req);
 if(path==="memo-images"&&method==="POST"){requireAdmin(req);verifyOrigin(req);const data=await body(req,memoImagesInput,7_000_000);consumeLimit("memo-image-upload",30,60_000);return json(saveMemoImages(data),201);}
 if(segments[0]==="memo-images"&&segments.length===2&&method==="GET"){requireAdmin(req);return readMemoImage(segments[1]);}
 if(method==="GET"&&segments.length===2&&segments[0]==="paper-pdf-assets"){const asset=pdfAsset(segments[1]);if(asset)return asset;throw new AppError("资源不存在",404);}
 if(method==="GET"&&path==="health")return json({ok:true});
 if(method==="GET"&&path==="session"){const{admin,username,setupNeeded}=user;return json({admin,username,setupNeeded});}
 if(method==="POST"&&path==="login")return await login(req);
 if(method==="POST"&&path==="logout")return logout(req);
 if(method==="GET"&&path==="categories"){const kind=z.enum(kinds).parse(req.nextUrl.searchParams.get("kind")||"bookmark");if(kind==="memo"||kind==="todo")requireAdmin(req);return json({categories:categories(kind),byKind:categoryCatalog(user.admin)});}
 if(path==="categories"&&method==="POST"){
  requireAdmin(req);verifyOrigin(req);const data=await body(req,z.object({name:z.string().trim().min(1).max(30),kind:z.enum(kinds).default("bookmark")}).strict());
  const category=addCategory(data.name,data.kind);return json({category,categories:categories(data.kind),byKind:categoryCatalog()},201);
 }
 if(path==="categories"&&method==="PUT"){
  requireAdmin(req);verifyOrigin(req);const data=await body(req,z.object({id:z.string().min(1).max(60),name:z.string().trim().min(1).max(30),expectedName:z.string().min(1).max(30),kind:z.enum(kinds).default("bookmark")}).strict());
  const category=renameCategory(data.id,data.name,data.expectedName,data.kind);return json({category,categories:categories(data.kind),byKind:categoryCatalog()});
 }
 if(path==="categories"&&method==="DELETE"){
  requireAdmin(req);verifyOrigin(req);const data=await body(req,z.object({id:z.string().min(1).max(60),targetId:z.string().min(1).max(60),expectedName:z.string().min(1).max(30),kind:z.enum(kinds).default("bookmark")}).strict());
  const result=deleteCategory(data.id,data.targetId,data.expectedName,data.kind);return json({...result,categories:categories(data.kind),byKind:categoryCatalog()});
 }
 if(path==="entries"&&method==="GET"){
  const kind=req.nextUrl.searchParams.get("kind");if(kind&&!kinds.includes(kind as typeof kinds[number]))throw new AppError("内容类型不正确");
  return json({entries:listEntries(user.admin,kind as typeof kinds[number]|undefined),...(user.admin?{orderVersions:entryOrderVersions()}: {})});
 }
 if(path==="entries/reorder"&&method==="POST"){requireAdmin(req);verifyOrigin(req);return json(reorderEntries(await body(req,entryOrderInput)));}
 if(segments[0]==="entries"&&segments.length===2&&method==="GET"){
  const entry=findEntry(segments[1]);if(!entry||!visible(entry,user.admin))throw new AppError("记录不存在",404);return json({entry});
 }
 if(path==="entries"&&method==="POST"){requireAdmin(req);verifyOrigin(req);return json({entry:saveEntry(await body(req,entryData))},201);}
 if(path==="entries"&&method==="PUT"){requireAdmin(req);verifyOrigin(req);const data=await body(req,entryUpdate);const current=findEntry(data.id);if(current&&current.kind!==data.data.kind)throw new AppError("不能更改记录类型");return json({entry:saveEntry(data.data,data.id,data.revision)});}
 if(path==="entries"&&method==="DELETE"){requireAdmin(req);verifyOrigin(req);const data=await body(req,z.object({id:z.string().max(80),revision:z.number().int().positive()}).strict());deleteEntry(data.id,data.revision);return json({ok:true});}
 if(path==="ai/status"&&method==="GET"){const c=publicConfig();return json(user.admin?c:{configured:c.configured,publicChat:c.publicChat});}
 if(path==="settings/ai"&&method==="GET"){requireAdmin(req);return json(publicConfig());}
 if(path==="settings/ai"&&method==="PUT"){requireAdmin(req);verifyOrigin(req);return json(updateConfig(await body(req,configInput)));}
 if(path==="settings/ai/test"&&method==="POST"){requireAdmin(req);verifyOrigin(req);aiLimit(req,true);return json(await checkConnection());}
 if(path==="ai/classify-draft"&&method==="POST"){
  requireAdmin(req);verifyOrigin(req);const data=await body(req,draftClassificationInput,7000000);configured();aiLimit(req,true);return json(await classifyDraft(data,req.signal));
 }
 if(path==="ai/import-paper"&&method==="POST"){
  requireAdmin(req);verifyOrigin(req);const data=await body(req,paperImportInput,7000000);configured();aiLimit(req,true);return json(await importPaper(data,req.signal));
 }
 if(path==="ai/search-papers"&&method==="POST"){
  requireAdmin(req);verifyOrigin(req);const data=await body(req,paperSearchInput);aiLimit(req,true);return json(await searchPapers(data.title,req.signal));
 }
 if(path==="ai/paper-metrics"&&method==="POST"){
  requireAdmin(req);verifyOrigin(req);const data=await body(req,paperMetricsInput,500000);aiLimit(req,true);return json(await queryPaperMetrics(data,req.signal));
 }
 if(path==="ai/classify"&&method==="POST"){requireAdmin(req);verifyOrigin(req);const data=await body(req,z.object({ids:z.array(z.string().min(1).max(80)).min(1).max(10)}).strict());configured();aiLimit(req,true);return json(await classify(data.ids));}
 if(path==="ai/undo"&&method==="POST"){requireAdmin(req);verifyOrigin(req);const data=await body(req,z.object({jobId:z.string().uuid()}).strict());return json(undoClassification(data.jobId));}
 if(path==="ai/chat"&&method==="POST"){
  verifyOrigin(req);const data=await body(req,chatInput,7000000);
  if(!user.admin&&(data.action!=="auto"||data.material||data.url||data.contextUrl))throw new AppError("外部网页读取和整理需要管理员权限",403);
  if(!user.admin&&!aiConfig().publicChat)throw new AppError("读者对话暂未开放",403);
  configured();aiLimit(req,user.admin);return await chatResponse(data,user.admin,req.signal);
 }
 throw new AppError("接口不存在",404);
 }catch(e){return failure(e);}
}
function sessionHandle(req:NextRequest,ctx:Context){return withAiSession(req.headers.get("x-ljt-ai-session"),()=>handle(req,ctx));}
export const GET=sessionHandle;
export const POST=sessionHandle;
export const PUT=sessionHandle;
export const DELETE=sessionHandle;
