"use client";
import { useEffect,useRef,useState } from "react";
import { ImagePlus,X } from "lucide-react";
import { maxImages,type ImageAttachment } from "@/shared/images";
import { prepareImage } from "@/shared/imageClient";
export async function importImages(files:File[],current:ImageAttachment[]){if(current.length+files.length>maxImages)throw new Error("每次最多导入 3 张图片。");return [...current,...await Promise.all(files.map(prepareImage))];}
export default function ImageAttachments({images,onChange,onError,onBusyChange,disabled=false,label="导入图片"}:{images:ImageAttachment[];onChange:(images:ImageAttachment[])=>void;onError:(message:string)=>void;onBusyChange?:(busy:boolean)=>void;disabled?:boolean;label?:string}){
 const input=useRef<HTMLInputElement>(null);const[loading,setLoading]=useState(false);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function load(files:File[]){if(disabled||loading||!files.length)return;setLoading(true);onBusyChange?.(true);try{const next=await importImages(files,images);if(alive.current)onChange(next);}catch(e){if(alive.current)onError((e as Error).message);}finally{if(alive.current){setLoading(false);onBusyChange?.(false);if(input.current)input.current.value="";}}}
 return <div className="image-attachments"><div className="image-import-actions"><button type="button" className="button secondary image-import-button" disabled={disabled||loading||images.length>=maxImages} onClick={()=>input.current?.click()}><ImagePlus size={16}/>{loading?"处理图片…":label}</button><span>最多 3 张 · 支持粘贴截图</span></div><input ref={input} className="visually-hidden" aria-label={label} type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={disabled||loading} onChange={event=>void load(Array.from(event.target.files||[]))}/>{images.length?<ul className="image-previews">{images.map((image,index)=><li key={index}><img src={image.dataUrl} alt={image.name}/><span>{image.name}</span><button type="button" className="icon-button" aria-label={"移除图片 "+(index+1)} disabled={disabled||loading} onClick={()=>onChange(images.filter((_,i)=>i!==index))}><X size={14}/></button></li>)}</ul>:null}</div>;
}
