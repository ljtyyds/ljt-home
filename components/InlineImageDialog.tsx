"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Minus,Plus,RotateCcw,X,Replace,Trash2,Check} from "lucide-react";
import type {ImageLayout} from "@/shared/memoEditor";

export type EditingImage={node:HTMLElement;url:string;name:string;layout:ImageLayout};
export default function InlineImageDialog({image,busy,onClose,onApply,onReplace,onDelete}:{
 image:EditingImage;busy:boolean;onClose:()=>void;onApply:(name:string,layout:ImageLayout)=>void;onReplace:(file:File)=>void;onDelete:()=>void;
}){
 const dialog=useRef<HTMLDialogElement>(null),replacement=useRef<HTMLInputElement>(null),closeRef=useRef(onClose),busyRef=useRef(busy);closeRef.current=onClose;busyRef.current=busy;
 const [zoom,setZoom]=useState(100),[name,setName]=useState(image.name),[layout,setLayout]=useState(image.layout);
 useEffect(()=>{const d=dialog.current!;d.showModal();const cancel=(event:Event)=>{event.preventDefault();event.stopPropagation();if(!busyRef.current)closeRef.current();};d.addEventListener("cancel",cancel);return()=>{d.removeEventListener("cancel",cancel);if(d.open)d.close();};},[]);
 useEffect(()=>{setName(image.name);setLayout(image.layout);},[image]);
 return createPortal(<dialog ref={dialog} className="inline-image-dialog" aria-label="查看与编辑图片" onClick={event=>{if(event.target!==dialog.current||busy)return;const box=dialog.current.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose();}}>
  <header><strong>查看与编辑图片</strong><button type="button" className="icon-button" aria-label="关闭图片" disabled={busy} onClick={onClose}><X/></button></header>
  <div className="image-zoom-tools"><button type="button" className="secondary" aria-label="缩小图片" onClick={()=>setZoom(Math.max(25,zoom-25))}><Minus size={16}/></button><output aria-label="图片放大比例">{zoom}%</output><button type="button" className="secondary" aria-label="放大图片" onClick={()=>setZoom(Math.min(300,zoom+25))}><Plus size={16}/></button><button type="button" className="secondary" onClick={()=>setZoom(100)}><RotateCcw size={16}/>还原</button></div>
  <div className="image-edit-stage"><img src={image.url} alt={name||"图片"} style={{width:zoom+"%"}}/></div>
  <div className="image-edit-fields"><label>图片说明<input value={name} maxLength={160} onChange={event=>setName(event.target.value)}/></label><label>正文显示宽度：{layout.width}%<input aria-label="正文显示宽度" type="range" min="25" max="100" step="5" value={layout.width} onChange={event=>setLayout({...layout,width:Number(event.target.value)})}/></label><label>图片对齐<select aria-label="图片对齐" value={layout.align} onChange={event=>setLayout({...layout,align:event.target.value as ImageLayout["align"]})}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label></div>
  <input ref={replacement} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="选择替换图片" onChange={event=>{const file=event.target.files?.[0];if(file)onReplace(file);event.target.value="";}}/>
  <footer><button type="button" className="secondary" disabled={busy} onClick={()=>replacement.current?.click()}><Replace size={16}/>替换图片</button><button type="button" className="secondary danger" disabled={busy} onClick={onDelete}><Trash2 size={16}/>删除图片</button><button type="button" className="primary" disabled={busy} onClick={()=>onApply(name.trim()||"图片",layout)}><Check size={16}/>应用修改</button></footer>
 </dialog>,document.body);
}
