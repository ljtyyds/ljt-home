import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { db, dataDir, masterKey, hasAdmin, consumeLimit } from "./db";
import { z } from "zod";

export class AppError extends Error {constructor(message:string,public status=400){super(message);}}
export function hashPassword(password:string){const salt=randomBytes(16).toString("hex");return salt+":"+scryptSync(password,salt,64).toString("hex");}
export function verifyPassword(password:string,stored:string){
 try{const[salt,hash]=stored.split(":");const a=Buffer.from(hash,"hex"),b=scryptSync(password,salt,64);return a.length===b.length&&timingSafeEqual(a,b);}catch{return false;}
}
export function createAdmin(username:string,password:string){
 if(hasAdmin())throw new AppError("管理员已创建",409);
 db.prepare("INSERT INTO users VALUES(?,?,?)").run(randomUUID(),username,hashPassword(password));
 const p=path.join(dataDir,"setup-token.txt");if(fs.existsSync(p))fs.unlinkSync(p);
}
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
export function identity(req:NextRequest){
 const token=req.cookies.get("xingyu_session")?.value;
 if(!token)return {admin:false,setupNeeded:!hasAdmin()};
 db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
 const row=db.prepare("SELECT users.id,users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND expires_at>?").get(digest(token),Date.now()) as {id:string;username:string}|undefined;
 return row?{admin:true,username:row.username,userId:row.id,setupNeeded:false}:{admin:false,setupNeeded:!hasAdmin()};
}
export function requireAdmin(req:NextRequest){const user=identity(req);if(!user.admin)throw new AppError("请先登录管理员账号",401);return user;}
export function verifyOrigin(req:NextRequest){
 const origin=req.headers.get("origin");
 const expected=process.env.APP_ORIGIN||new URL(req.url).origin;
 if(!origin||origin!==new URL(expected).origin)throw new AppError("请求来源验证失败",403);
}
export async function body<T>(req:NextRequest,schema:z.ZodType<T>,limit=100_000):Promise<T>{
 if(!req.headers.get("content-type")?.includes("application/json"))throw new AppError("仅支持 JSON 请求",415);
 if(Number(req.headers.get("content-length")||0)>limit)throw new AppError("请求内容过大",413);
 const reader=req.body?.getReader();if(!reader)throw new AppError("请求体为空");
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new AppError("请求内容过大",413);}chunks.push(value);}
 let parsed:unknown;try{parsed=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new AppError("JSON 格式有误");}
 const result=schema.safeParse(parsed);if(!result.success)throw new AppError(result.error.issues[0]?.message||"参数有误");return result.data;
}
export function json(data:unknown,status=200){return NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});}
export function failure(e:unknown){
 if(e instanceof AppError)return json({error:e.message},e.status);
 if(e instanceof Error){const status=(e as Error&{status?:number}).status;
 if(status||/分类不存在|关联记录不存在|有效的 HTTP/.test(e.message))return json({error:e.message},status||400);}
 console.error("[request]",e instanceof Error?e.name:"unknown");
 return json({error:"操作未完成，请稍后重试"},500);
}
export function ipKey(req:NextRequest){return createHash("sha256").update(masterKey).update(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"local").digest("hex").slice(0,24);}
export async function login(req:NextRequest){
 verifyOrigin(req);consumeLimit("login:"+ipKey(req),10,15*60_000);
 const data=await body(req,z.object({username:z.string().trim().min(2).max(40),password:z.string().min(12).max(128),setupToken:z.string().max(100).optional()}).strict());
 if(!hasAdmin()){
  const p=path.join(dataDir,"setup-token.txt"),stored=fs.existsSync(p)?fs.readFileSync(p,"utf8").trim():"";
  const provided=Buffer.from(data.setupToken||"");const expected=Buffer.from(stored);
  if(!expected.length||provided.length!==expected.length||!timingSafeEqual(provided,expected))throw new AppError("首次创建需要本机 data/setup-token.txt 中的初始化码",403);
  createAdmin(data.username,data.password);
 }
 const row=db.prepare("SELECT * FROM users WHERE username=?").get(data.username) as {id:string;password_hash:string}|undefined;
 const valid=verifyPassword(data.password,row?.password_hash||"00000000000000000000000000000000:"+ "00".repeat(64));
 if(!row||!valid)throw new AppError("用户名或密码不正确",401);
 const token=randomBytes(32).toString("hex"),expires=Date.now()+7*86400_000;
 db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(digest(token),row.id,expires);
 const res=json({ok:true,username:data.username});
 res.cookies.set("xingyu_session",token,{httpOnly:true,sameSite:"strict",secure:process.env.COOKIE_SECURE==="true"||(process.env.COOKIE_SECURE!=="false"&&process.env.NODE_ENV==="production"),path:"/",expires:new Date(expires)});
 return res;
}
export function logout(req:NextRequest){
 verifyOrigin(req);const token=req.cookies.get("xingyu_session")?.value;if(token)db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
 const res=json({ok:true});res.cookies.set("xingyu_session","",{httpOnly:true,sameSite:"strict",path:"/",maxAge:0});return res;
}
