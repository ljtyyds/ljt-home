"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { Save,PenLine,Check,LoaderCircle,Sparkles,Link2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Entry,Kind,Category } from "@/shared/types";
import {emptyPaper} from "@/shared/papers";
import { kindLabels } from "@/shared/types";
import { Dialog } from "./Primitives";
import { api,send } from "./api";
import { droppedLink,parseLink } from "@/shared/links";
import type { OrganizedDraft } from "@/shared/organize";
import ImageAttachments,{ importImages } from "./ImageAttachments";
import type { ImageAttachment } from "@/shared/images";
import MemoEditor from "./MemoEditor";
import {memoImagePath,imageLayout} from "@/shared/memoEditor";
export function makeEntry(kind:Kind):Entry{return{id:"",kind,title:"",url:"",description:"",content:"",categoryId:"other",tags:[],pinned:false,visibility:kind==="memo"||kind==="todo"?"private":"public",published:kind!=="memo"&&kind!=="todo",source:"",publishedAt:"",dueAt:"",priority:"medium",status:"todo",relatedId:"",...(kind==="paper"?{paper:emptyPaper()}:{}),revision:0,createdAt:"",updatedAt:""};}
export function dataOf(entry:Entry){const{id,revision,createdAt,updatedAt,...data}=entry;void id;void revision;void createdAt;void updatedAt;if(data.kind==="bookmark"||data.kind==="article"||data.kind==="paper"){data.visibility="public";data.published=true;if(data.kind==="article")data.publishedAt="";}return data;}
export function Markdown({children,memo=false}:{children:string;memo?:boolean}){return <div className={"markdown"+(memo?" memo-markdown":"")}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{a:props=><a {...props} target="_blank" rel="noreferrer noopener"/>,...(memo?{img:({src,alt,title}:{src?:string|Blob;alt?:string;title?:string})=>{const layout=imageLayout(title);return typeof src==="string"&&memoImagePath.test(src)?<img src={src} alt={alt||"备忘录图片"} loading="lazy" style={{width:layout.width+"%",marginLeft:layout.align==="left"?0:"auto",marginRight:layout.align==="right"?0:"auto"}}/>:<span className="muted">[请通过上传按钮插入备忘录图片]</span>;}}: {})}}>{children}</ReactMarkdown></div>;}
function localDate(value:string){if(!value)return "";const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
export default function EntryEditor({initial,categories,entries,onClose,onSaved}:{initial:Entry;categories:Category[];entries:Entry[];onClose:()=>void;onSaved:(e:Entry)=>void}){
 const[form,setForm]=useState(initial),[tags,setTags]=useState(initial.tags.join("，")),[saving,setSaving]=useState(false),[error,setError]=useState(""),[preview,setPreview]=useState(false),[autoPaused,setAutoPaused]=useState(false),[saved,setSaved]=useState("");
 const[mode,setMode]=useState<"manual"|"ai">(!initial.id&&initial.url?"ai":"manual"),[aiBusy,setAiBusy]=useState(false),[aiMessage,setAiMessage]=useState(""),[dragging,setDragging]=useState(false);
 const[showMaterial,setShowMaterial]=useState(false);
 const[images,setImages]=useState<ImageAttachment[]>([]),[imageLoading,setImageLoading]=useState(false);
 const draftVersion=useRef(0),aiSequence=useRef(0),aiAbort=useRef<AbortController|null>(null);
 useEffect(()=>()=>{aiSequence.current++;aiAbort.current?.abort();},[]);
 const identity=useRef({id:initial.id,revision:initial.revision}),saveLock=useRef(false),memoUploadLock=useRef(false);
 const[memoUploading,setMemoUploading]=useState(false);
 const lastSaved=useRef(JSON.stringify({...dataOf(initial),tags:initial.tags}));
 const isPublicKind=form.kind==="bookmark"||form.kind==="article";
 const data={...dataOf(form),tags:tags.split(/[,，]/).map(v=>v.trim()).filter(Boolean)};
 const serialized=JSON.stringify(data),dirty=serialized!==lastSaved.current;
 const latestDirty=useRef(dirty);latestDirty.current=dirty;
 const set=<K extends keyof Entry>(key:K,value:Entry[K])=>{draftVersion.current++;setAiMessage("");setForm(f=>({...f,[key]:value}));setAutoPaused(false);};
 function dropLink(event:React.DragEvent<HTMLElement>){
  event.preventDefault();event.stopPropagation();setDragging(false);const link=droppedLink(event.dataTransfer);
  if(!link){setError("请拖入有效的 HTTP / HTTPS 网页链接");return;}
  draftVersion.current++;setForm(current=>({...current,url:link.url,title:current.title||link.title}));setMode("ai");setError("");setAiMessage("");
 }
 function dragOver(event:React.DragEvent<HTMLElement>){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect="copy";setDragging(true);}
 function manual(){aiSequence.current++;aiAbort.current?.abort();setAiBusy(false);setImageLoading(false);setMode("manual");setAiMessage("");}
 async function suggest(){
  if(aiBusy||saving||imageLoading)return;
  if(!parseLink(form.url)){setError("请先填写有效的 HTTP / HTTPS 网页链接");return;}
  const version=draftVersion.current,ticket=++aiSequence.current,controller=new AbortController();aiAbort.current=controller;
  setAiBusy(true);setError("");setAiMessage("");
  try{
    const result=await api<OrganizedDraft>("ai/classify-draft",{...send("POST",{kind:form.kind,url:form.url,title:form.title,description:form.description,content:form.content,images}),signal:controller.signal});
   if(ticket!==aiSequence.current)return;
   if(version!==draftVersion.current){setAiMessage("内容已在处理期间修改，本次建议未覆盖草稿；可按当前内容重新分类。");return;}
    if(result.needsContent){setAiMessage(result.acquisition.message);setShowMaterial(true);return;}
   if(!categories.some(category=>category.id===result.suggestion.categoryId))throw new Error("分类列表已变化，请刷新后重新分类；当前草稿未修改。");
   const suggestion=result.suggestion;draftVersion.current++;
    setForm(current=>({...current,categoryId:suggestion.categoryId,title:current.title.trim()?current.title:suggestion.title,description:suggestion.description,content:suggestion.content,source:current.source.trim()?current.source:suggestion.source}));
   setTags(suggestion.tags.join("，"));setAutoPaused(false);
    setAiMessage(result.acquisition.message+" 已生成分类建议，可手动调整后保存。");
  }catch(e){if(ticket===aiSequence.current&&!controller.signal.aborted)setError((e as Error).message);}
  finally{if(ticket===aiSequence.current)setAiBusy(false);}
 }
 const save=useCallback(async()=>{
  if(saveLock.current||memoUploadLock.current||saving||aiBusy||imageLoading)return;saveLock.current=true;setSaving(true);setError("");
  try{
   const data=JSON.parse(serialized);
   const result=await api<{entry:Entry}>("entries",send(identity.current.id?"PUT":"POST",identity.current.id?{id:identity.current.id,revision:identity.current.revision,data}:data));
   identity.current={id:result.entry.id,revision:result.entry.revision};lastSaved.current=serialized;setSaved(new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}));onSaved(result.entry);if(data.kind!=="memo")onClose();
  }catch(e){setError((e as Error).message);setAutoPaused(true);}finally{saveLock.current=false;setSaving(false);}
 },[serialized,saving,aiBusy,imageLoading,onSaved,onClose]);
 useEffect(()=>{if(form.kind!=="memo"||!form.title.trim()||!dirty||saving||memoUploading||autoPaused)return;const timer=setTimeout(()=>void save(),1200);return()=>clearTimeout(timer);},[form.kind,form.title,dirty,saving,memoUploading,autoPaused,save]);
 useEffect(()=>{const prevent=(e:BeforeUnloadEvent)=>{if(latestDirty.current){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent);},[]);
 function close(){if(memoUploadLock.current){setError("图片正在上传，请稍候再关闭");return;}if(saving){setError("正在保存，请稍候再关闭");return;}if(dirty&&!window.confirm("还有未保存的修改，确定关闭吗？"))return;onClose();}
  return <Dialog title={(initial.id?"编辑":"新增")+kindLabels[form.kind]} onClose={close} wide={form.kind==="memo"||form.kind==="todo"}><form className="form-stack editor-form" onPaste={event=>{const files=Array.from(event.clipboardData.files);if(!isPublicKind||!files.length||aiBusy||saving||imageLoading)return;event.preventDefault();const ticket=aiSequence.current;setImageLoading(true);void importImages(files,images).then(next=>{if(ticket===aiSequence.current){draftVersion.current++;setImages(next);setMode("ai");}}).catch(e=>{if(ticket===aiSequence.current)setError(e.message);}).finally(()=>{if(ticket===aiSequence.current)setImageLoading(false);});}} onSubmit={e=>{e.preventDefault();void save();}}>
 {isPublicKind?<div className={"entry-import "+(dragging?"dragging":"")} role="region" aria-label="链接导入区域" onDragOver={dragOver} onDragLeave={()=>setDragging(false)} onDrop={dropLink}>
  <div className="segmented entry-mode"><button type="button" className={mode==="manual"?"selected":""} aria-pressed={mode==="manual"} onClick={manual}><PenLine size={14}/>手动填写</button><button type="button" className={mode==="ai"?"selected":""} aria-pressed={mode==="ai"} onClick={()=>setMode("ai")}><Sparkles size={14}/>AI 辅助分类</button></div>
  {mode==="ai"?<><p><Link2 size={17}/>把网页链接拖到这里，或在下方粘贴网址。</p><button className="button ai-button" type="button" disabled={aiBusy||saving||!form.url.trim()} onClick={()=>void suggest()}>{aiBusy?<LoaderCircle size={16} className="spin"/>:<Sparkles size={16}/>}<span>{aiBusy?"正在识别与分类…":"AI 识别并分类"}</span></button><small>读取标题与摘要，按你的分类列表给出建议；点击保存后才会新增内容。</small></>:<p className="entry-manual-hint">可直接填写表单，也可拖入链接后切换 AI 辅助。</p>}
  {aiMessage?<p className="ai-draft-message" role="status">{aiMessage}</p>:null}
  {mode==="ai"?<ImageAttachments images={images} onChange={next=>{draftVersion.current++;setImages(next);setAiMessage("");}} onError={setError} onBusyChange={setImageLoading} disabled={aiBusy||saving||imageLoading} label="导入分类截图"/>:null}
 </div>:null}
  {isPublicKind&&!initial.id?<label>保存位置<select aria-label="保存位置" value={form.kind} onChange={e=>set("kind",e.target.value as Kind)}><option value="bookmark">关注网站</option><option value="article">行业前沿</option></select></label>:null}
  <label>标题<input required autoFocus value={form.title} maxLength={200} placeholder={form.kind==="memo"?"给这个想法起个名字":"输入标题"} onChange={e=>set("title",e.target.value)}/></label>
 {isPublicKind?<label onDragOver={dragOver} onDrop={dropLink}>网址<input required type="url" value={form.url} maxLength={2000} placeholder="https://" onChange={e=>set("url",e.target.value)}/></label>:null}
 {isPublicKind?<label>简介 / 摘要<textarea aria-label={form.kind==="todo"?"备注":"简介 / 摘要"} rows={3} value={form.description} maxLength={4000} onChange={e=>set("description",e.target.value)} placeholder="留下几句说明，方便以后找到它。"/></label>:null}
  {isPublicKind?<details className="material-input" open={showMaterial} onToggle={e=>setShowMaterial(e.currentTarget.open)}><summary>补充正文（可选，公众号推荐）</summary><label>文章正文<textarea aria-label="文章正文" rows={5} maxLength={50000} value={form.content} onChange={e=>set("content",e.target.value)} placeholder="粘贴你已能正常阅读的正文。AI 会优先使用这里的内容，不再把验证页当作文章。"/></label><small>最多 50000 个字符；与记录一起保存，整理时按长度截取模型输入。</small></details>:null}
 {form.kind!=="todo"?<div className="form-row"><label>分类<select aria-label="分类" value={form.categoryId} onChange={e=>set("categoryId",e.target.value)}>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>标签<input value={tags} onChange={e=>{draftVersion.current++;setAiMessage("");setTags(e.target.value);setAutoPaused(false);}} placeholder="用逗号分隔"/></label></div>:null}
 {form.kind==="article"?<label>来源<input value={form.source} maxLength={200} onChange={e=>set("source",e.target.value)} placeholder="作者、机构或平台"/></label>:null}
 {form.kind==="memo"?<MemoEditor value={form.content} onChange={value=>set("content",value)} saving={saving} preview={preview} onPreviewChange={setPreview} onBusyChange={busy=>{memoUploadLock.current=busy;setMemoUploading(busy);}} onError={setError} status={saving?<><LoaderCircle size={13} className="spin"/>保存中</>:dirty?"修改后将自动保存":saved?<><Check size={13}/>已保存 {saved}</>:"支持 Markdown · 自动保存"} previewContent={<Markdown memo>{form.content||"还没有内容，写下你的第一个想法吧。"}</Markdown>}/>:null}
 {form.kind==="todo"?<><div className="todo-notes"><span className="private-editor-label">备注</span><MemoEditor kind="todo" limit={4000} value={form.description} onChange={value=>set("description",value)} saving={saving} preview={preview} onPreviewChange={setPreview} onBusyChange={busy=>{memoUploadLock.current=busy;setMemoUploading(busy);}} onError={setError} status={saving?"保存中":dirty?"点击保存后生效":"支持 Markdown · 保存后生效"} previewContent={<Markdown memo>{form.description||"写下执行步骤，或上传参考截图。"}</Markdown>}/></div><div className="form-row"><label>状态<select aria-label="状态" value={form.status} onChange={e=>set("status",e.target.value as Entry["status"])}><option value="todo">待开始</option><option value="doing">进行中</option><option value="done">已完成</option></select></label><label>优先级<select aria-label="优先级" value={form.priority} onChange={e=>set("priority",e.target.value as Entry["priority"])}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label></div><div className="form-row"><label>截止时间<input type="datetime-local" value={localDate(form.dueAt)} onChange={e=>set("dueAt",e.target.value?new Date(e.target.value).toISOString():"")}/></label><label>关联记录<select aria-label="关联记录" value={form.relatedId} onChange={e=>set("relatedId",e.target.value)}><option value="">不关联</option>{entries.filter(e=>e.id!==form.id&&e.kind!=="todo").map(e=><option value={e.id} key={e.id}>{kindLabels[e.kind]} · {e.title}</option>)}</select></label></div></>:null}
 {!isPublicKind?<p className="private-note">这份{form.kind==="memo"?"备忘录":"待办"}仅你可见，不会出现在读者端。</p>:null}
 <label className="checkbox-label"><input type="checkbox" checked={form.pinned} onChange={e=>set("pinned",e.target.checked)}/>置顶显示</label>
 {error?<p className="form-error" role="alert">{error}</p>:null}<div className="modal-actions"><button className="button secondary" type="button" onClick={close}>关闭</button><button className="button primary" disabled={saving||aiBusy||imageLoading||memoUploading||!form.title.trim()}><Save size={16}/>{saving?"正在保存…":"保存"}</button></div>
 </form></Dialog>;
}
