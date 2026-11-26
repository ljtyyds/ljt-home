"use client";
import {useEffect,useRef,useState} from "react";
import {Sparkles,Save,LoaderCircle,Link2,FileText,X} from "lucide-react";
import type {Entry,Category} from "@/shared/types";
import {emptyPaper,paperReference,metricLabels,type PaperMetadata,type PaperMetric} from "@/shared/papers";
import type {PaperImportResult} from "@/server/papers";
import type {ImageAttachment} from "@/shared/images";
import {Dialog} from "./Primitives";
import {api,send} from "./api";
import {dataOf} from "./EntryEditor";
import ImageAttachments,{importImages} from "./ImageAttachments";
import {droppedLink} from "@/shared/links";
import {readPaperFile} from "@/shared/paperFileClient";
import {isPdfResourceError} from "@/shared/pdfClient";
import {paperFileAccept} from "@/shared/paperFiles";
import type {PaperCandidate} from "@/server/paperSearch";
import type {PaperMetricsResult} from "@/server/paperMetrics";
export default function PaperEditor({initial,categories,onClose,onSaved}:{initial:Entry;categories:Category[];onClose:()=>void;onSaved:(entry:Entry)=>void}){
 const[form,setForm]=useState<Entry>({...initial,paper:initial.paper||emptyPaper()}),[reference,setReference]=useState(initial.url),[authors,setAuthors]=useState(initial.paper?.authors.join("；")||""),[tags,setTags]=useState(initial.tags.join("，")),[material,setMaterial]=useState(""),[images,setImages]=useState<ImageAttachment[]>([]),[busy,setBusy]=useState(false),[importing,setImporting]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notes,setNotes]=useState<string[]>([]);
 const version=useRef(0),sequence=useRef(0),controller=useRef<AbortController|null>(null),alive=useRef(true),dirty=useRef(false);
 const documentInput=useRef<HTMLInputElement>(null);
 const failedDocument=useRef<File|null>(null),[retryDocument,setRetryDocument]=useState(false);
 const[metricSource,setMetricSource]=useState("");
 const[sourceFile,setSourceFile]=useState<{name:string;hash:string}|undefined>(initial.paper?.fileName&&initial.paper.fileHash?{name:initial.paper.fileName,hash:initial.paper.fileHash}:undefined),[fileProgress,setFileProgress]=useState(""),[candidates,setCandidates]=useState<PaperCandidate[]>([]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;controller.current?.abort();};},[]);
 useEffect(()=>{const prevent=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent);},[]);
 function changed(){version.current++;dirty.current=true;setError("");setCandidates([]);}
 function update<K extends keyof Entry>(key:K,value:Entry[K]){changed();setForm(f=>({...f,[key]:value}));}
 function metadata<K extends keyof PaperMetadata>(key:K,value:PaperMetadata[K]){changed();setForm(f=>({...f,paper:{...f.paper!,[key]:value}}));}
 function metric(key:"sci"|"ccf"|"impactFactor",field:keyof PaperMetric,value:string){metadata(key,{...form.paper![key],[field]:value});}
 function close(){if(saving)return;if(dirty.current&&!window.confirm("论文还有未保存的修改，确定关闭吗？"))return;controller.current?.abort();onClose();}
 async function addImages(files:File[]){if(busy||saving||importing)return;const ticket=sequence.current;setImporting(true);try{const next=await importImages(files,images);if(alive.current&&ticket===sequence.current){changed();setImages(next);}}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setImporting(false);}}
 async function addDocument(files:File[]){
  if(busy||saving||importing||!files.length)return;if(files.length!==1){setError("请每次导入一篇论文文件。");return;}const snapshot=version.current,ticket=++sequence.current,abort=new AbortController();controller.current=abort;failedDocument.current=files[0];setRetryDocument(false);setImporting(true);setError("");setFileProgress("正在解析论文文件…");
  try{const file=await readPaperFile(files[0],message=>{if(alive.current)setFileProgress(message);},abort.signal);if(!alive.current||ticket!==sequence.current)return;if(version.current!==snapshot){setNotes(["文件解析期间内容已修改，解析结果未覆盖当前输入，请重新选择文件。"]);return;}
   changed();failedDocument.current=null;setSourceFile({name:file.name,hash:file.hash});setMaterial(file.text);setImages(file.images);setReference(file.reference||file.title||"");if(file.title)setForm(f=>({...f,title:f.title||file.title}));setNotes([file.note]);
  }catch(e){if(alive.current&&ticket===sequence.current){setError((e as Error).message);setRetryDocument(isPdfResourceError(e));if(!isPdfResourceError(e))failedDocument.current=null;}}finally{if(alive.current&&ticket===sequence.current){setImporting(false);setFileProgress("");if(documentInput.current)documentInput.current.value="";}}
 }
 async function suggest(selectedReference?:string){
  if(busy||saving||importing)return;const requestReference=selectedReference||reference;if(!requestReference.trim()&&!material.trim()&&!images.length){setError("请填写论文名、链接或 DOI，或选择论文文件。");return;}if(selectedReference){changed();setReference(selectedReference);}
  const ticket=++sequence.current,snapshot=version.current,abort=new AbortController();controller.current=abort;setBusy(true);setError("");setNotes([]);
  try{
   if(!paperReference(requestReference)&&!material.trim()&&!images.length){const result=await api<{candidates:PaperCandidate[];message:string}>("ai/search-papers",{...send("POST",{title:requestReference}),signal:abort.signal});if(!alive.current||ticket!==sequence.current)return;if(snapshot!==version.current){setNotes(["检索期间内容已修改，结果未覆盖当前输入。"]);return;}setCandidates(result.candidates);setNotes([result.message]);return;}
   const result=await api<PaperImportResult>("ai/import-paper",{...send("POST",{reference:requestReference,material,images,sourceFile}),signal:abort.signal});if(!alive.current||ticket!==sequence.current)return;
   if(snapshot!==version.current){setNotes(["你在导入期间修改了内容，本次结果未覆盖表单，可按当前输入重试。"]);return;}
   if(!categories.some(c=>c.id===result.draft.categoryId))throw new Error("分类列表已变化，请刷新后重试；当前输入未修改。");
   if(form.id&&result.existing&&result.existing.id!==form.id)throw new Error("这个链接对应论文库中的另一条记录，请关闭后编辑对应论文。");
   const existing=result.existing;setForm(current=>({...current,...result.draft,...(!current.id&&existing?{id:existing.id,revision:existing.revision,createdAt:existing.createdAt,updatedAt:existing.updatedAt,pinned:existing.pinned}:{})}));setReference(result.draft.url);setAuthors(result.draft.paper!.authors.join("；"));setTags(result.draft.tags.join("，"));dirty.current=true;version.current++;
   setNotes([...(existing?["已找到库中的同一篇论文，保存时将应用到原记录，不会新增重复记录。"]:[]),...result.notes]);
  }catch(e){if(alive.current&&ticket===sequence.current&&!abort.signal.aborted)setError((e as Error).message);}finally{if(alive.current&&ticket===sequence.current)setBusy(false);}
 }
 async function queryMetrics(){
  if(busy||saving||importing)return;const ticket=++sequence.current,snapshot=version.current,abort=new AbortController();controller.current=abort;setBusy(true);setError("");setNotes([]);
  try{const result=await api<PaperMetricsResult>("ai/paper-metrics",{...send("POST",{paper:form.paper,sourceUrl:metricSource,material}),signal:abort.signal});if(!alive.current||ticket!==sequence.current)return;if(version.current!==snapshot){setNotes(["查询期间内容已修改，指标结果未覆盖当前表单，请重新查询。"]);return;}setForm(current=>({...current,paper:{...current.paper!,...result.metrics}}));dirty.current=true;version.current++;setNotes(result.notes);
  }catch(e){if(alive.current&&ticket===sequence.current&&!abort.signal.aborted)setError((e as Error).message);}finally{if(alive.current&&ticket===sequence.current)setBusy(false);}
 }
 async function save(){if(busy||saving||importing)return;const ref=paperReference(reference);if(reference.trim()&&/^(?:https?:|doi:|10\.\d+\/)/i.test(reference)&&!ref){setError("论文链接或 DOI 格式不正确。");return;}setSaving(true);setError("");try{const data={...dataOf(form),url:ref?.url||form.url||"",kind:"paper",visibility:"public",published:true,paper:{...form.paper!,...(sourceFile?{fileName:sourceFile.name,fileHash:sourceFile.hash}:{}),authors:authors.split(/[；;\n]/).map(a=>a.trim()).filter(Boolean)},tags:tags.split(/[,，]/).map(t=>t.trim()).filter(Boolean)};
  const result=await api<{entry:Entry}>("entries",send(form.id?"PUT":"POST",form.id?{id:form.id,revision:form.revision,data}:data));dirty.current=false;onSaved(result.entry);onClose();
 }catch(e){setError((e as Error).message);}finally{if(alive.current)setSaving(false);}}
 const paper=form.paper!,disabled=busy||saving||importing;
 return <Dialog title={initial.id?"编辑论文":"新增论文"} onClose={close} wide><form className="form-stack paper-editor" onSubmit={event=>{event.preventDefault();void save();}} onPaste={event=>{const files=Array.from(event.clipboardData.files);if(files.length){event.preventDefault();if(files.every(file=>file.type.startsWith("image/")))void addImages(files);else void addDocument(files);}}}>
  <div className="entry-import" onDragOver={event=>{if(event.dataTransfer.types.some(type=>["text/uri-list","text/plain","Files"].includes(type))){event.preventDefault();event.stopPropagation();}}} onDrop={event=>{event.preventDefault();event.stopPropagation();if(event.dataTransfer.files.length){const files=Array.from(event.dataTransfer.files);if(files.every(file=>file.type.startsWith("image/")))void addImages(files);else void addDocument(files);return;}const link=droppedLink(event.dataTransfer);if(link){changed();setReference(link.url);}}}>
   <label><Link2 size={16}/>论文名 / 链接 / DOI<input autoFocus value={reference} maxLength={2000} onChange={event=>{changed();setReference(event.target.value);}} placeholder="输入论文名，或粘贴 DOI / arXiv / 论文链接"/></label>
   <div className="paper-import-actions"><button type="button" className="button ai-button" disabled={disabled||!reference.trim()&&!material.trim()&&!images.length} onClick={()=>void suggest()}>{busy?<LoaderCircle className="spin" size={16}/>:<Sparkles size={16}/>}<span>{busy?"正在检索或识别论文…":"AI 识别整理"}</span></button><button type="button" className="button secondary" disabled={disabled} onClick={()=>documentInput.current?.click()}><FileText size={16}/>选择论文文件</button></div>
   <input ref={documentInput} type="file" className="visually-hidden" aria-label="选择论文文件" accept={paperFileAccept} disabled={disabled} onChange={event=>void addDocument(Array.from(event.target.files||[]))}/>
   <small>支持 PDF、DOCX、TXT/MD、BibTeX、RIS、EndNote、CSL JSON，单个文件不超过 20 MB。论文名检索后先确认候选，再生成草稿。</small>
   {fileProgress?<p role="status">{fileProgress}</p>:null}{sourceFile?<div className="paper-file-preview"><FileText size={16}/><span>{sourceFile.name}</span><button type="button" className="icon-button" disabled={disabled} aria-label="移除论文文件" onClick={()=>{changed();setSourceFile(undefined);setForm(f=>{const paper={...f.paper!};delete paper.fileName;delete paper.fileHash;return{...f,paper};});}}><X size={15}/></button></div>:null}
   {candidates.length?<section className="paper-candidates" aria-label="论文检索结果"><strong>选择要导入的论文</strong>{candidates.map(candidate=><button type="button" key={candidate.reference} disabled={disabled} aria-label={"选择论文 "+candidate.title} onClick={()=>void suggest(candidate.reference)}><strong>{candidate.title}</strong><span>{candidate.authors.join("；")||"作者未提供"}</span><small>{candidate.venue||candidate.source} · {candidate.year||"年份未提供"} · {candidate.source}{candidate.match?" · "+(candidate.match==="exact"?"标题一致":"相近匹配"):""}</small></button>)}</section>:null}
   <ImageAttachments images={images} onChange={next=>{changed();setImages(next);}} onError={setError} onBusyChange={setImporting} disabled={disabled} label="导入论文截图"/>
   <details className="material-input"><summary>补充标题、摘要或指标来源（可选）</summary><label>论文补充内容<textarea aria-label="论文补充内容" rows={4} value={material} maxLength={50000} onChange={event=>{changed();setMaterial(event.target.value);}} placeholder="无法读取链接时，可粘贴论文摘要；指标请同时提供年度、来源链接及依据原句。"/></label></details>
   {notes.length?<ul className="paper-import-notes" role="status">{notes.map((note,i)=><li key={i}>{note}</li>)}</ul>:null}
  </div>
  <label>标题<input required value={form.title} maxLength={200} onChange={event=>update("title",event.target.value)}/></label>
  <label>作者<textarea aria-label="作者" rows={2} maxLength={20000} value={authors} onChange={event=>{changed();setAuthors(event.target.value);}} placeholder="多个作者以分号或换行分隔，保留作者顺序"/></label>
  <div className="form-row"><label>出版期刊 / 会议<input value={paper.venue} maxLength={500} onChange={event=>metadata("venue",event.target.value)}/></label><label>出版类型<select aria-label="出版类型" value={paper.venueType} onChange={event=>metadata("venueType",event.target.value as PaperMetadata["venueType"])}><option value="unknown">待核实</option><option value="journal">期刊论文</option><option value="conference">会议论文</option><option value="preprint">预印本</option></select></label></div>
  <div className="form-row"><label>出版年份<input aria-label="出版年份" inputMode="numeric" maxLength={4} value={paper.year} onChange={event=>metadata("year",event.target.value)} placeholder="例如 2025"/>{paper.venueType==="preprint"?<small>此处为预印本记录年份，不代表正式发表。</small>:null}</label><label>DOI<input value={paper.doi} maxLength={500} onChange={event=>metadata("doi",event.target.value)} placeholder="10.xxxx/..."/></label></div>
  <label>大致领域<input value={paper.field} maxLength={200} onChange={event=>metadata("field",event.target.value)} placeholder="例如：机器人学习 / 视觉控制"/></label>
  <label>大致摘要<textarea aria-label="大致摘要" rows={5} value={form.description} maxLength={4000} onChange={event=>update("description",event.target.value)}/></label>
  <div className="form-row"><label>分类<select aria-label="分类" value={form.categoryId} onChange={event=>update("categoryId",event.target.value)}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>标签<input value={tags} onChange={event=>{changed();setTags(event.target.value);}} placeholder="用逗号分隔"/></label></div>
  <div className="entry-import"><button type="button" className="button secondary" disabled={disabled||!paper.venue.trim()||!["journal","conference"].includes(paper.venueType)} onClick={()=>void queryMetrics()}><Sparkles size={16}/>{busy?"正在处理…":"查询分区 / 等级"}</button><small>按会议或期刊名称匹配 CCF 目录。期刊分区及影响因子需有年度、学科与来源资料；查询只更新当前草稿，保存后才生效。</small><label>指标来源链接（可选）<input type="url" value={metricSource} maxLength={2000} onChange={event=>{changed();setMetricSource(event.target.value);}} placeholder="可公开读取的期刊指标页面；授权资料可粘贴至上方补充内容"/></label></div>
  <details className="paper-metric-editor"><summary>SCI 分区 / CCF 等级 / 影响因子</summary><p className="muted">CCF 年度是目录版本年度。JCR 与中科院分区需区分口径、学科和指标年度。会议与预印本不使用期刊影响因子。手动录入的数值仍需核对来源。</p>
   <label>SCI 分区口径<select aria-label="SCI 分区口径" value={paper.sciScheme} onChange={event=>metadata("sciScheme",event.target.value as PaperMetadata["sciScheme"])}><option value="unknown">未核实</option><option value="JCR">JCR（Q1–Q4）</option><option value="中科院">中科院（1–4 区）</option></select></label>
   {(["sci","ccf","impactFactor"] as const).map(key=><fieldset key={key}><legend>{metricLabels[key]}</legend><div className="form-row"><label>{metricLabels[key]}数值<input value={paper[key].value} maxLength={100} onChange={event=>metric(key,"value",event.target.value)} placeholder={key==="sci"?"例如 Q1（Robotics）":key==="ccf"?"A / B / C":"例如 5.2"}/></label><label>{metricLabels[key]}年度<input value={paper[key].year} inputMode="numeric" maxLength={4} onChange={event=>metric(key,"year",event.target.value)}/></label></div><label>{metricLabels[key]}来源<input type="url" value={paper[key].sourceUrl} maxLength={2000} onChange={event=>metric(key,"sourceUrl",event.target.value)} placeholder="https://"/></label><label>{metricLabels[key]}依据<textarea rows={2} value={paper[key].evidence} maxLength={1000} onChange={event=>metric(key,"evidence",event.target.value)}/></label></fieldset>)}
  </details>
  <label className="checkbox-label"><input type="checkbox" checked={form.pinned} onChange={event=>update("pinned",event.target.checked)}/>置顶显示</label>
  <p className="muted paper-save-note">保存后的论文信息对读者可见。原始截图不会作为公开附件保存。</p>
  {error?<p className="form-error" role="alert">{error}</p>:null}{retryDocument?<button type="button" className="button secondary" disabled={disabled} onClick={()=>{if(failedDocument.current)void addDocument([failedDocument.current]);}}>重试导入</button>:null}<div className="modal-actions"><button type="button" className="button secondary" disabled={saving} onClick={close}>关闭</button><button className="button primary" disabled={disabled||!form.title.trim()}><Save size={16}/>{saving?"保存中…":"保存论文"}</button></div>
 </form></Dialog>;
}
