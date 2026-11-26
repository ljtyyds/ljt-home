"use client";
import { useEffect,useRef,useState } from "react";
import { readWallpaper,saveWallpaper,validateWallpaper,type LocalWallpaper } from "./localWallpaper";
import {isTheme,parseWallpaperView,wallpaperViewKey,defaultWallpaperView,type Theme} from "@/shared/appearance";
import {applyPanelAppearance,parsePanelAppearance,panelAppearanceKey,defaultPanelAppearance,type PanelAppearance} from "@/shared/panelAppearance";
import {parseAmbientSettings,ambientSettingsKey,defaultAmbientSettings,type AmbientSettings} from "@/shared/ambient";
export type {Theme} from "@/shared/appearance";
export function useAppearance(){
 const[theme,setColorTheme]=useState<Theme>("mint"),[motion,setMotion]=useState(true),[ready,setReady]=useState(false);
 const[wallpaper,setWallpaper]=useState<LocalWallpaper|null>(null),[customActive,setCustomActive]=useState(false),[wallpaperUrl,setWallpaperUrl]=useState("");
 const[importing,setImporting]=useState(false),[error,setError]=useState("");
 const[view,setView]=useState(defaultWallpaperView);
 const[panel,setPanel]=useState(defaultPanelAppearance),[ambient,setAmbient]=useState(defaultAmbientSettings),[preview,setPreview]=useState(0);
 const importLock=useRef(false);
 useEffect(()=>{
  let alive=true;
  async function load(){
   let savedTheme:Theme="mint",savedMotion=true,active=false,savedView=defaultWallpaperView;
   try{const value=localStorage.getItem("xingyu-theme");if(isTheme(value))savedTheme=value;savedMotion=localStorage.getItem("xingyu-motion")!=="off";active=localStorage.getItem("ljt-wallpaper-active")==="on";savedView=parseWallpaperView(localStorage.getItem(wallpaperViewKey));setPanel(parsePanelAppearance(localStorage.getItem(panelAppearanceKey)));setAmbient(parseAmbientSettings(localStorage.getItem(ambientSettingsKey)));}catch{}
   let saved:LocalWallpaper|null=null;
   try{saved=await readWallpaper();}catch{if(alive)setError("无法读取本地背景，可重新导入；请允许此网站使用浏览器存储。");}
   if(alive){setColorTheme(savedTheme);setMotion(savedMotion);setWallpaper(saved);setView(savedView);setCustomActive(active&&!!saved);setReady(true);}
  }
  void load();return()=>{alive=false;};
 },[]);
 useEffect(()=>{if(!ready)return;document.documentElement.dataset.theme=theme;try{localStorage.setItem("xingyu-theme",theme);}catch{}},[theme,ready]);
 useEffect(()=>{if(ready)try{localStorage.setItem("xingyu-motion",motion?"on":"off");}catch{}},[motion,ready]);
 useEffect(()=>{if(ready)try{localStorage.setItem("ljt-wallpaper-active",customActive?"on":"off");}catch{}},[customActive,ready]);
 useEffect(()=>{if(!ready)return;document.documentElement.style.setProperty("--wallpaper-dim",String(1-view.brightness/100));document.documentElement.style.setProperty("--wallpaper-fit",view.fit);try{localStorage.setItem(wallpaperViewKey,JSON.stringify(view));}catch{}},[view,ready]);
 useEffect(()=>{if(!ready)return;applyPanelAppearance(panel);try{localStorage.setItem(panelAppearanceKey,JSON.stringify(panel));}catch{}},[panel,ready]);
 useEffect(()=>{if(ready)try{localStorage.setItem(ambientSettingsKey,JSON.stringify(ambient));}catch{}},[ambient,ready]);
 useEffect(()=>{if(!wallpaper){setWallpaperUrl("");return;}const url=URL.createObjectURL(wallpaper.file);setWallpaperUrl(url);return()=>URL.revokeObjectURL(url);},[wallpaper]);
 function setTheme(value:Theme){setColorTheme(value);setCustomActive(false);setError("");}
 async function importWallpaper(file:File){
  if(importLock.current||!ready)return;importLock.current=true;setImporting(true);setError("");
  try{const kind=await validateWallpaper(file);const next={file,name:file.name,kind};await saveWallpaper(next);setWallpaper(next);setCustomActive(true);}
  catch(e){setError((e as Error).message);}
  finally{importLock.current=false;setImporting(false);}
 }
 return{theme,setTheme,motion,setMotion,ready,wallpaper,wallpaperUrl,customActive,useImported:()=>{setCustomActive(true);setError("");},importing,error,importWallpaper,view,setBrightness:(brightness:number)=>setView(current=>parseWallpaperView({...current,brightness})),setFit:(fit:"cover"|"contain")=>setView(current=>({...current,fit})),panel,updatePanel:(patch:Partial<PanelAppearance>)=>setPanel(current=>parsePanelAppearance({...current,...patch})),ambient,updateAmbient:(patch:Partial<AmbientSettings>)=>setAmbient(current=>parseAmbientSettings({...current,...patch})),preview,previewAmbient:()=>setPreview(value=>value+1)};
}
export type Appearance=ReturnType<typeof useAppearance>;
export default function Background({motion,wallpaper}:{motion:boolean;wallpaper?:{url:string;kind:"image"|"video"}|null}){
 const[visible,setVisible]=useState(true),[reducedMotion,setReducedMotion]=useState(false),[mediaError,setMediaError]=useState(false);
 const video=useRef<HTMLVideoElement>(null);
 useEffect(()=>{const change=()=>setVisible(!document.hidden),media=window.matchMedia("(prefers-reduced-motion: reduce)"),reduce=()=>setReducedMotion(media.matches);change();reduce();document.addEventListener("visibilitychange",change);media.addEventListener("change",reduce);return()=>{document.removeEventListener("visibilitychange",change);media.removeEventListener("change",reduce);};},[]);
 useEffect(()=>setMediaError(false),[wallpaper?.url]);
 const animate=motion&&visible&&!reducedMotion;
 useEffect(()=>{const current=video.current;if(!current)return;if(animate)void current.play().catch(()=>{});else current.pause();},[animate,wallpaper?.url]);
 return <div className={"wallpaper "+(animate?"":"paused ")+(wallpaper&&!mediaError?" has-custom":"")} aria-hidden="true">
  <div className="aurora aurora-one"/><div className="aurora aurora-two"/>
  <svg className="wallpaper-lines" viewBox="0 0 1536 1024" preserveAspectRatio="none"><path d="M-150 520 C300 220 480 920 1050 440 S1540 200 1700 280"/><path d="M200 -80 C640 450 1000 30 1500 120 S1840 360 1800 500"/><path d="M-200 770 C500 1040 850 580 1680 720"/></svg>
  {Array.from({length:24},(_,i)=><span key={i} className="particle" style={{left:((i*73+9)%100)+"%",top:((i*47+13)%100)+"%",animationDelay:(i%7)*-2+"s",animationDuration:(16+i%5*4)+"s",width:i%5===0?7:3,height:i%5===0?7:3}}/>)}
  {wallpaper&&!mediaError?<>{wallpaper.kind==="video"?<video ref={video} className="custom-wallpaper" src={wallpaper.url} muted loop playsInline preload="auto" onLoadedData={()=>{if(animate)void video.current?.play().catch(()=>{});}} onError={()=>setMediaError(true)}/>:<img className="custom-wallpaper" src={wallpaper.url} alt="" onError={()=>setMediaError(true)}/>}<div className="wallpaper-tint"/></>:null}
 </div>;
}
