"use client";
import { useState } from "react";
import { LogIn,ShieldCheck,Eye,EyeOff } from "lucide-react";
import { Dialog } from "./Primitives";
import { api,send } from "./api";
export default function AuthDialog({setupNeeded,onClose,onSuccess}:{setupNeeded:boolean;onClose:()=>void;onSuccess:()=>void}){
 const[busy,setBusy]=useState(false),[error,setError]=useState(""),[show,setShow]=useState(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");const f=new FormData(event.currentTarget);
 try{await api("login",send("POST",{username:f.get("username"),password:f.get("password"),...(setupNeeded?{setupToken:f.get("setupToken")}:{})}));onSuccess();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog title={setupNeeded?"创建你的管理员账号":"回到你的私人空间"} onClose={onClose}><form onSubmit={submit} className="form-stack"><div className="auth-illustration"><ShieldCheck size={32}/></div><p className="muted">{setupNeeded?"首次使用需输入本机 data/setup-token.txt 中的初始化码。账号创建后，该码立即失效。":"登录后管理收藏、记录灵感，也照顾好每一件待办。"}</p>
 {setupNeeded?<label>初始化码<input name="setupToken" required autoComplete="off" placeholder="从本机文件中复制" maxLength={100}/></label>:null}
 <label>用户名<input name="username" required autoComplete="username" minLength={2} maxLength={40} placeholder="你的管理员用户名"/></label>
 <label>密码<div className="password-input"><input name="password" type={show?"text":"password"} required minLength={12} maxLength={128} autoComplete={setupNeeded?"new-password":"current-password"} placeholder="至少 12 个字符"/><button type="button" className="icon-button" onClick={()=>setShow(!show)} aria-label={show?"隐藏密码":"显示密码"}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>
 {error?<p className="form-error" role="alert">{error}</p>:null}<button className="button primary full" disabled={busy}><LogIn size={17}/>{busy?"正在进入…":setupNeeded?"创建并进入管理":"进入管理工作区"}</button><p className="form-footnote">读者可以直接浏览公开内容，无需注册。</p></form></Dialog>;
}
