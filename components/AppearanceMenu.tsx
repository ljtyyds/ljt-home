"use client";
import { useEffect,useRef } from "react";
import { ChevronRight,LoaderCircle,Sun,Upload,X,Image as ImageIcon } from "lucide-react";
import type { Appearance } from "./Background";
import AppearanceControls from "./AppearanceControls";
export default function AppearanceMenu({appearance,open,onOpenChange}:{appearance:Appearance;open:boolean;onOpenChange:(open:boolean)=>void}){
 const control=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  if(!open)return;
  function outside(e:PointerEvent){if(e.target instanceof Node&&!control.current?.contains(e.target))onOpenChange(false);}
  function key(e:KeyboardEvent){if(e.key==="Escape"){onOpenChange(false);control.current?.querySelector<HTMLButtonElement>(".appearance-toggle")?.focus();}}
  document.addEventListener("pointerdown",outside,true);document.addEventListener("keydown",key);
  return()=>{document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",key);};
 },[open,onOpenChange]);
 const disabled=!appearance.ready||appearance.importing;
 return <div className="appearance-control" ref={control}>
  {open?<section className="appearance-popover" aria-label="背景设置" id="appearance-settings"><div className="appearance-title"><strong>让空间更像你</strong><button className="icon-button" aria-label="关闭背景设置" onClick={()=>onOpenChange(false)}><X size={16}/></button></div>
   <div className="theme-options">{([["mint","晨间薄荷"],["night","夜间星海"],["lake","暮色湖畔"],["plain","安静素色"]] as const).map(([value,label])=><button key={value} className={!appearance.customActive&&appearance.theme===value?"selected":""} disabled={disabled} aria-pressed={!appearance.customActive&&appearance.theme===value} onClick={()=>appearance.setTheme(value)}><span className={"theme-dot "+value}/>{label}</button>)}</div>
   <div className="wallpaper-import"><input ref={input} type="file" className="visually-hidden" tabIndex={-1} aria-label="选择本地背景文件" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm" disabled={disabled} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void appearance.importWallpaper(file);}}/>
    <button className="button secondary full" disabled={disabled} onClick={()=>input.current?.click()}>{appearance.importing?<LoaderCircle size={15} className="spin"/>:<Upload size={15}/>}<span>{appearance.importing?"正在导入…":"导入本地背景"}</span></button>
    <p className="appearance-hint">图片 ≤10 MB · 视频 ≤50 MB<br/>仅保存在当前浏览器，不上传服务器</p>
    {appearance.wallpaper?<button className={"imported-wallpaper "+(appearance.customActive?"selected":"")} disabled={disabled} aria-pressed={appearance.customActive} onClick={appearance.useImported}><ImageIcon size={15}/><span><strong>{appearance.customActive?"正在使用本地背景":"使用已导入背景"}</strong><small title={appearance.wallpaper.name}>{appearance.wallpaper.name}</small></span></button>:null}
    {appearance.error?<p className="appearance-error" role="alert">{appearance.error}</p>:null}
   </div>
   <div className="wallpaper-view-controls"><label>壁纸明暗<output>{appearance.view.brightness}%</output><input type="range" aria-label="壁纸明暗" min={40} max={100} step={5} disabled={disabled} value={appearance.view.brightness} onChange={event=>appearance.setBrightness(Number(event.target.value))}/></label><label>图片显示<select aria-label="图片显示方式" disabled={disabled} value={appearance.view.fit} onChange={event=>appearance.setFit(event.target.value as "cover"|"contain")}><option value="cover">铺满屏幕</option><option value="contain">完整显示</option></select></label><p>保留原图，不额外模糊。视频也适用。</p></div>
   <AppearanceControls appearance={appearance} compact onPreview={()=>{onOpenChange(false);appearance.previewAmbient();}}/>
   <label className="switch-row">动态效果<input type="checkbox" role="switch" disabled={disabled} checked={appearance.motion} onChange={e=>appearance.setMotion(e.target.checked)}/></label>
  </section>:null}
  <button className="nav-item utility appearance-toggle" onClick={()=>onOpenChange(!open)} aria-expanded={open} aria-controls="appearance-settings"><Sun size={21}/><span>切换背景</span><ChevronRight size={16}/></button>
 </div>;
}
