"use client";
import {useEffect,useState} from "react";
import {Palette,Sparkles,Play,RotateCcw} from "lucide-react";
import type {Appearance} from "./Background";
import {ambientEffects,ambientLabels,idleDelays,type AmbientEffect} from "@/shared/ambient";

export default function AppearanceControls({appearance,compact=false,onPreview}:{appearance:Appearance;compact?:boolean;onPreview?:()=>void}){
 const[reduced,setReduced]=useState(false);
 const[colorCode,setColorCode]=useState(appearance.panel.color);
 useEffect(()=>setColorCode(appearance.panel.color),[appearance.panel.color]);
 useEffect(()=>{const query=matchMedia("(prefers-reduced-motion: reduce)"),sync=()=>setReduced(query.matches);sync();query.addEventListener("change",sync);return()=>query.removeEventListener("change",sync);},[]);
 const disabled=!appearance.ready;
 const panel=<div className="personal-style-fields">
  <label className="personal-toggle">自定义面板颜色<input type="checkbox" role="switch" aria-label="自定义面板颜色" checked={appearance.panel.enabled} disabled={disabled} onChange={event=>appearance.updatePanel({enabled:event.target.checked})}/></label>
  <div className="personal-color-row"><label>面板颜色<input type="color" aria-label="面板颜色" value={appearance.panel.color} disabled={disabled} onChange={event=>appearance.updatePanel({enabled:true,color:event.target.value})}/></label><input aria-label="面板颜色代码" className="personal-color-code" maxLength={7} value={colorCode} disabled={disabled} spellCheck={false} aria-invalid={!/^#[0-9a-f]{6}$/i.test(colorCode)} onChange={event=>{const value=event.target.value;setColorCode(value);if(/^#[0-9a-f]{6}$/i.test(value))appearance.updatePanel({enabled:true,color:value});}} onBlur={()=>setColorCode(appearance.panel.color)} title="输入 # 加六位十六进制颜色代码"/><button type="button" className="text-button" onClick={()=>appearance.updatePanel({enabled:false})} disabled={disabled}><RotateCcw size={13}/>跟随主题</button></div>
  <label className="personal-range">面板不透明度<span className="personal-opacity-value">{appearance.panel.opacity}%</span><input type="range" aria-label="面板不透明度" min={0} max={100} step={1} value={appearance.panel.opacity} disabled={disabled} onChange={event=>appearance.updatePanel({enabled:true,opacity:Number(event.target.value)})}/></label>
  <p className="hint">0% 为主面板底色完全透明，100% 为不透明；文字保持清晰。</p>
 </div>;
 const ambient=<div className="personal-style-fields">
  <label>空闲特效<select aria-label="空闲特效" value={appearance.ambient.effect} disabled={disabled} onChange={event=>appearance.updateAmbient({effect:event.target.value as AmbientEffect})}>{ambientEffects.map(effect=><option key={effect} value={effect}>{ambientLabels[effect]}</option>)}</select></label>
  <div className="personal-effect-options"><label>开始前等待<select aria-label="空闲等待时长" value={appearance.ambient.delay} disabled={disabled} onChange={event=>appearance.updateAmbient({delay:Number(event.target.value)})}>{idleDelays.map(seconds=><option key={seconds} value={seconds}>{seconds<60?seconds+" 秒":seconds/60+" 分钟"}</option>)}</select></label><label>特效密度<select aria-label="特效密度" value={appearance.ambient.density} disabled={disabled} onChange={event=>appearance.updateAmbient({density:event.target.value as typeof appearance.ambient.density})}><option value="light">轻柔</option><option value="normal">适中</option><option value="rich">丰富</option></select></label></div>
  <button type="button" className="button secondary" disabled={disabled||reduced||!appearance.motion||appearance.ambient.effect==="off"} onClick={onPreview||appearance.previewAmbient}><Play size={14}/>预览空闲特效</button>
  <p className="hint">停止操作后自动出现；鼠标、键盘、触摸或滚动时结束。随机模式每次选择一种效果。预览最长 15 秒。</p>
  {!appearance.motion?<p className="hint">请先开启“切换背景”中的动态效果。</p>:null}
  {reduced?<p className="hint">系统已开启“减少动态效果”，空闲特效已暂停。</p>:null}
  <p className="hint">仅在当前页面可见时运行，并遵循系统的“减少动态效果”偏好。</p>
 </div>;
 return <div className={"personalization-controls "+(compact?"compact":"")}>
  {compact?<><details><summary><Palette size={15}/>主面板颜色与透明度</summary>{panel}</details><details><summary><Sparkles size={15}/>空闲特效</summary>{ambient}</details></>:<><div className="personalization-heading"><Palette size={20}/><div><h2>界面与空闲特效</h2><p>即时生效，自动保存在当前浏览器。</p></div></div><div className="personalization-columns"><section aria-label="面板外观"><h3>主面板外观</h3>{panel}</section><section aria-label="空闲特效设置"><h3>空闲时，让空间动起来</h3>{ambient}</section></div></>}
 </div>;
}
