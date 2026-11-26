"use client";
import {useEffect,useLayoutEffect,useRef,useState,useId,type ReactNode} from "react";
import {Eye,PenLine,ImagePlus,List,ListOrdered,ListTodo,LoaderCircle,Undo2,Redo2} from "lucide-react";
import {prepareImage} from "@/shared/imageClient";
import {memoContentLimit,imageLayout,type ImageLayout} from "@/shared/memoEditor";
import {renderRichDocument,serializeRichDocument,editorRange,selectRange,selectEditorEnd,insertRichImages,setImageLayout} from "@/shared/richDocument";
import InlineImageDialog,{type EditingImage} from "./InlineImageDialog";
import {api,send} from "./api";

export default function MemoEditor({value,onChange,saving,preview,onPreviewChange,status,previewContent,onBusyChange,onError,kind="memo",limit=memoContentLimit}:{value:string;onChange:(text:string)=>void;saving:boolean;preview:boolean;onPreviewChange:(preview:boolean)=>void;status:ReactNode;previewContent:ReactNode;onBusyChange:(busy:boolean)=>void;onError:(error:string)=>void;kind?:"memo"|"todo";limit?:number}){
 const countId=useId(),todo=kind==="todo",root=useRef<HTMLDivElement>(null),fileInput=useRef<HTMLInputElement>(null);
 const [uploading,setUploading]=useState(false),[dragging,setDragging]=useState(false),[editing,setEditing]=useState<EditingImage|null>(null),[,refresh]=useState(0);
 const alive=useRef(true),uploadLock=useRef(false),controller=useRef<AbortController|null>(null),composing=useRef(false);
 const latest=useRef(value),rendered=useRef<string|null>(null),savedRange=useRef<Range|null>(null),replacement=useRef<HTMLElement|null>(null);
 const history=useRef({items:[value],index:0,time:0});latest.current=value;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();onBusyChange(false);};},[]); // eslint-disable-line react-hooks/exhaustive-deps
 useLayoutEffect(()=>{if(root.current&&rendered.current!==value){renderRichDocument(root.current,value);rendered.current=value;savedRange.current=null;}},[value]);
 const remember=()=>{const selection=document.getSelection();if(selection?.rangeCount&&root.current?.contains(selection.anchorNode))savedRange.current=selection.getRangeAt(0).cloneRange();};
 function emit(separate=false){
  const editor=root.current;if(!editor)return;const next=serializeRichDocument(editor);
  if(next.length>limit){renderRichDocument(editor,latest.current);selectEditorEnd(editor);onError("内容超过 "+limit+" 个字符，请删减后重试。");return;}
  if(next===latest.current){remember();return;}
  const h=history.current,now=Date.now();h.items=h.items.slice(0,h.index+1);
  if(!separate&&now-h.time<650&&h.index>0)h.items[h.index]=next;else{h.items.push(next);h.index++;if(h.items.length>50){h.items.shift();h.index--;}}
  h.time=separate?0:now;latest.current=next;rendered.current=next;onChange(next);remember();refresh(n=>n+1);
 }
 function travel(delta:number){const h=history.current,index=h.index+delta;if(index<0||index>=h.items.length||uploadLock.current)return;h.index=index;h.time=0;const next=h.items[index];renderRichDocument(root.current!,next);rendered.current=next;latest.current=next;savedRange.current=null;onChange(next);selectEditorEnd(root.current!);refresh(n=>n+1);}
 function taskControls(){
  for(const item of Array.from(root.current!.querySelectorAll("li"))){
   const list=item.parentElement!,isTask=item.dataset.task==="true"||list.dataset.taskList==="true";
   if(!isTask)continue;list.dataset.taskList="true";item.dataset.task="true";
   let check=item.querySelector(":scope > input[type=checkbox],:scope > p > input[type=checkbox]") as HTMLInputElement|null;
   if(!check){check=document.createElement("input");check.type="checkbox";check.contentEditable="false";item.prepend(check);}
   check.setAttribute("aria-label","标记任务完成");if(!item.textContent?.trim())check.checked=false;
  }
 }
 function list(kind:"number"|"bullet"|"task"){
  const editor=root.current!;selectRange(editor,editorRange(editor,savedRange.current));
  const anchor=document.getSelection()?.anchorNode,anchorElement=anchor?.nodeType===1?anchor as Element:anchor?.parentElement,existing=anchorElement?.closest("ol,ul");
  if(existing?.tagName!==(kind==="number"?"OL":"UL"))document.execCommand(kind==="number"?"insertOrderedList":"insertUnorderedList");
  const selection=document.getSelection(),node=selection?.anchorNode,element=node?.nodeType===1?node as Element:node?.parentElement,active=element?.closest("ol,ul");
  if(active){if(kind==="task"){(active as HTMLElement).dataset.taskList="true";for(const item of Array.from(active.children))if(item.tagName==="LI")(item as HTMLElement).dataset.task="true";}else{delete (active as HTMLElement).dataset.taskList;for(const item of Array.from(active.children)){delete (item as HTMLElement).dataset.task;item.querySelector(":scope > input[type=checkbox],:scope > p > input[type=checkbox]")?.remove();}}}
  taskControls();emit(true);
 }
 function input(inserted?:string|null,inputType?:string){
  if(composing.current)return;const editor=root.current!;
  // Chromium may report a bulk insertion as several paragraph events with null data.
  // Only convert unformatted blocks containing Markdown markers, never an existing rich list.
  if(inserted===null&&inputType==="insertText"&&editor.children.length>1&&!editor.querySelector("ol,ul,h1,h2,h3,h4,h5,h6,pre,table,blockquote,strong,em,code,input,[data-rich-image],[data-rich-source]")){
   const source=Array.from(editor.children).map(node=>node.textContent||"").join("\n");
   if(/^(?:#{1,6}\s|\s*\d+[.)]\s|\s*[-+*]\s|>\s)/m.test(source)){renderRichDocument(editor,source);selectEditorEnd(editor);taskControls();emit();return;}
  }
  if(inserted?.includes("\n")&&!editor.querySelector("[data-rich-image],[data-rich-source]")&&(editor.textContent||"").replace(/[\r\n\u00a0]/g,"")===inserted.replace(/[\r\n\u00a0]/g,"")){renderRichDocument(editor,inserted);selectEditorEnd(editor);taskControls();emit();return;}
  if(editor.childNodes.length===1&&editor.firstChild?.nodeType===3){
   if(editor.textContent?.includes("\n")){renderRichDocument(editor,editor.textContent);selectEditorEnd(editor);}
   else{const node=editor.firstChild,selection=document.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null,start=range?.startContainer===node?range.startOffset:node.textContent?.length||0,end=range?.endContainer===node?range.endOffset:start;const p=document.createElement("p");p.append(node);editor.append(p);const restored=document.createRange();restored.setStart(node,start);restored.setEnd(node,end);selectRange(editor,restored);}
  }
  taskControls();emit();
 }
 function openImage(element:HTMLElement){setEditing({node:element,url:element.dataset.richImage!,name:element.querySelector("img")?.alt||"图片",layout:imageLayout("ljt-image:w="+element.dataset.width+";align="+element.dataset.align)});}
 function keyDown(event:React.KeyboardEvent<HTMLDivElement>){
  if(event.nativeEvent.isComposing||composing.current||event.keyCode===229)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"){event.preventDefault();travel(event.shiftKey?1:-1);return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="y"){event.preventDefault();travel(1);return;}
  const image=(event.target as HTMLElement).closest<HTMLElement>("[data-rich-image]");if(image&&["Enter"," "].includes(event.key)){event.preventDefault();openImage(image);return;}
  const selection=document.getSelection(),node=selection?.anchorNode,element=node?.nodeType===1?node as Element:node?.parentElement;
  if(event.key==="Tab"&&element?.closest("li")){event.preventDefault();document.execCommand(event.shiftKey?"outdent":"indent");taskControls();emit(true);return;}
  if(event.key==="Enter"&&!event.shiftKey){const item=element?.closest("li");if(item&&!item.textContent?.trim()&&!item.querySelector("[data-rich-image]")){item.querySelectorAll("input").forEach(check=>check.remove());delete item.dataset.task;}}
  if(event.key==="Enter"&&element?.closest("pre")){event.preventDefault();document.execCommand("insertText",false,"\n");emit();return;}
  if(event.key===" "&&selection?.isCollapsed){const item=element?.closest("li"),block=item||element?.closest("p");if(block&&root.current!.contains(block)&&/^(\d+[.)]|[-+*])$/.test(block.textContent||"")){const numbered=/^\d/.test(block.textContent!);event.preventDefault();block.replaceChildren(document.createElement("br"));const range=document.createRange();range.selectNodeContents(block);range.collapse(true);selectRange(root.current!,range);savedRange.current=range;if(item)emit(true);else list(numbered?"number":"bullet");}}
 }
 async function upload(files:File[]){
  if(!files.length||uploadLock.current)return;if(files.length>3){onError("每次最多上传 3 张图片。");return;}if(replacement.current&&files.length!==1){onError("替换时请选择一张图片。");return;}
  const editor=root.current!,range=editorRange(editor,savedRange.current),target=replacement.current;
  uploadLock.current=true;setUploading(true);onBusyChange(true);onError("");onPreviewChange(false);controller.current=new AbortController();
  try{
   const images=await Promise.all(files.map(prepareImage));
   if(latest.current.length+images.length*350>limit)throw new Error("内容空间不足，请删减文字后再上传图片。");
   const response=await api<{images:Array<{url:string;name:string}>}>("memo-images",{...send("POST",{images}),signal:controller.current.signal});if(!alive.current)return;
   if(target&&editor.contains(target)){const next=response.images[0];target.dataset.richImage=next.url;target.querySelector("img")!.src=next.url;setEditing(current=>current?{...current,url:next.url}:null);}
   else{savedRange.current=insertRichImages(editor,range,response.images);}
   emit(true);
  }catch(error){if(alive.current&&(error as Error).name!=="AbortError")onError((error as Error).message||"图片上传失败，请重试。");}
  finally{replacement.current=null;uploadLock.current=false;if(alive.current){setUploading(false);onBusyChange(false);}controller.current=null;}
 }
 function pasteText(text:string){
  const editor=root.current!,range=editorRange(editor);selectRange(editor,range);
  if(!editor.textContent?.trim()&&!editor.querySelector("[data-rich-image],[data-rich-source]")){renderRichDocument(editor,text);selectEditorEnd(editor);taskControls();emit(true);return;}
  // Plain text is parsed through the safe renderer; pasted HTML never executes.
  if(text.includes("\n")){const fragment=document.createElement("div");renderRichDocument(fragment,text);document.execCommand("insertHTML",false,fragment.innerHTML);}
  else document.execCommand("insertText",false,text);
  taskControls();emit(true);
 }
 const disabled=saving||uploading;
 return <div className={"memo-editor"+(dragging?" dragging":"")} onDragOver={event=>{if(Array.from(event.dataTransfer.types).includes("Files")){event.preventDefault();setDragging(true);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}} onDrop={event=>{if(!event.dataTransfer.files.length)return;event.preventDefault();event.stopPropagation();setDragging(false);const range=document.caretRangeFromPoint?.(event.clientX,event.clientY);if(range&&root.current?.contains(range.commonAncestorContainer))savedRange.current=range;void upload(Array.from(event.dataTransfer.files));}}>
  <div className="memo-tabs"><button type="button" className={!preview?"active":""} onClick={()=>onPreviewChange(false)}><PenLine size={16}/>编辑</button><button type="button" className={preview?"active":""} onClick={()=>onPreviewChange(true)}><Eye size={16}/>预览</button><span className="muted memo-status" aria-live="polite">{status}</span></div>
  <div className="memo-edit-tools" hidden={preview}>
   <button type="button" className="secondary" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>list("number")}><ListOrdered size={16}/>编号</button>
   <button type="button" className="secondary" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>list("bullet")}><List size={16}/>项目</button>
   <button type="button" className="secondary" disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>list("task")}><ListTodo size={16}/>待办</button>
   <button type="button" className="secondary" disabled={disabled} onMouseDown={event=>{event.preventDefault();remember();}} onClick={()=>{replacement.current=null;fileInput.current?.click();}}>{uploading?<LoaderCircle size={16} className="spin"/>:<ImagePlus size={16}/>}上传图片</button>
   <button type="button" className="secondary icon-button" aria-label="撤销编辑" disabled={uploading||history.current.index===0} onMouseDown={event=>event.preventDefault()} onClick={()=>travel(-1)}><Undo2 size={16}/></button>
   <button type="button" className="secondary icon-button" aria-label="重做编辑" disabled={uploading||history.current.index===history.current.items.length-1} onMouseDown={event=>event.preventDefault()} onClick={()=>travel(1)}><Redo2 size={16}/></button>
   <span className="memo-help muted">回车续写列表，空项再回车结束；Shift + Enter 只换行。图片可上传、粘贴或拖入，点击图片可放大与修改。</span>
  </div>
  <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="选择正文图片" onChange={event=>{void upload(Array.from(event.target.files||[]));event.target.value="";}}/>
  <div hidden={preview} ref={root} className="memo-rich-text" role="textbox" aria-label={todo?"备注":"备忘录正文"} aria-multiline="true" aria-describedby={countId} contentEditable={!uploading} suppressContentEditableWarning spellCheck={false} onFocus={()=>document.execCommand("defaultParagraphSeparator",false,"p")} onInput={event=>{const inputEvent=event.nativeEvent as InputEvent;input(inputEvent.data,inputEvent.inputType);}} onKeyDown={keyDown} onKeyUp={remember} onMouseUp={remember} onBlur={remember} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;input();}} onPaste={event=>{event.preventDefault();const files=Array.from(event.clipboardData.files);if(files.length){remember();void upload(files);}else pasteText(event.clipboardData.getData("text/plain"));}} onClick={event=>{const image=(event.target as HTMLElement).closest<HTMLElement>("[data-rich-image]");if(image){remember();openImage(image);}else if((event.target as HTMLElement).matches("input[type=checkbox]"))emit(true);}}/>
  {preview?<div className="memo-preview">{previewContent}</div>:null}
  <div className="memo-editor-footer muted" id={countId}><span>图片直接显示在正文中 · 仅管理员可见{todo?" · 点击保存后生效":" · 自动保存"}</span><span>{value.length.toLocaleString()} / {limit.toLocaleString()}</span></div>
  {editing?<InlineImageDialog image={editing} busy={uploading} onClose={()=>setEditing(null)} onApply={(name:string,layout:ImageLayout)=>{const image=editing.node;if(root.current?.contains(image)){image.querySelector("img")!.alt=name;image.setAttribute("aria-label","编辑图片 "+name);setImageLayout(image,layout);emit(true);}setEditing(null);}} onReplace={file=>{replacement.current=editing.node;void upload([file]);}} onDelete={()=>{if(root.current?.contains(editing.node)){editing.node.remove();emit(true);}setEditing(null);}}/>:null}
 </div>;
}
