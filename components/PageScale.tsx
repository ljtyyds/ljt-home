"use client";
import { useEffect,useState } from "react";
import { Minus,Plus } from "lucide-react";
import { pageScaleValues,pageScaleStorageKey,validPageScale } from "@/shared/pageScale";
function applyScale(value:number){document.documentElement.style.zoom=String(value/100);document.documentElement.style.setProperty("--page-scale",String(value/100));document.documentElement.dataset.pageScale=String(value);}
export default function PageScale(){
 const[scale,setScale]=useState(100),[ready,setReady]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{
  let value=100;try{value=validPageScale(localStorage.getItem(pageScaleStorageKey));}catch{}
  applyScale(value);setScale(value);setReady(true);
  const sync=(event:StorageEvent)=>{if(event.key===pageScaleStorageKey){const next=validPageScale(event.newValue);applyScale(next);setScale(next);}};
  window.addEventListener("storage",sync);return()=>window.removeEventListener("storage",sync);
 },[]);
 function change(value:number){const next=validPageScale(value);applyScale(next);setScale(next);try{localStorage.setItem(pageScaleStorageKey,String(next));setError(false);}catch{setError(true);}}
 return <div className="page-scale-control"><div className="page-scale" role="group" aria-label="页面缩放"><button className="icon-button" aria-label="缩小页面" disabled={!ready||scale<=80} onClick={()=>change(scale-10)}><Minus size={15}/></button><select aria-label="页面缩放比例" title="缩放比例会在当前浏览器记住" disabled={!ready} value={scale} onChange={e=>change(Number(e.target.value))}>{pageScaleValues.map(value=><option key={value} value={value}>{value}%</option>)}</select><button className="icon-button" aria-label="放大页面" disabled={!ready||scale>=120} onClick={()=>change(scale+10)}><Plus size={15}/></button></div>{error?<span className="scale-storage-error" role="status">浏览器未允许保存缩放设置</span>:null}</div>;
}
