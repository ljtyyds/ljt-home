import {panelAppearanceInitScript} from "./panelAppearance";
export const themes=["mint","night","plain","lake"] as const;
export type Theme=typeof themes[number];
export type WallpaperView={brightness:number;fit:"cover"|"contain"};
export const wallpaperViewKey="ljt-wallpaper-view-v1";
export const defaultWallpaperView:WallpaperView={brightness:80,fit:"cover"};
export function isTheme(value:unknown):value is Theme{return typeof value==="string"&&(themes as readonly string[]).includes(value);}
export function parseWallpaperView(raw:unknown):WallpaperView{
 let value=raw;if(typeof value==="string")try{value=JSON.parse(value);}catch{value=null;}
 const data=value&&typeof value==="object"?value as Record<string,unknown>:{};
 const brightness=typeof data.brightness==="number"&&Number.isFinite(data.brightness)&&data.brightness>=40&&data.brightness<=100?Math.round(data.brightness/5)*5:80;
 return{brightness,fit:data.fit==="contain"?"contain":"cover"};
}
// Restore the chosen palette before hydration, without touching wallpaper files.
export const appearanceInitScript="(function(){try{var d=document.documentElement,t=localStorage.getItem('xingyu-theme');d.dataset.theme="+JSON.stringify(themes)+".indexOf(t)>=0?t:'mint';var v={};try{v=JSON.parse(localStorage.getItem('"+wallpaperViewKey+"')||'null')||{};}catch(e){}var n=typeof v.brightness==='number'&&isFinite(v.brightness)&&v.brightness>=40&&v.brightness<=100?Math.round(v.brightness/5)*5:80;d.style.setProperty('--wallpaper-dim',String(1-n/100));d.style.setProperty('--wallpaper-fit',v.fit==='contain'?'contain':'cover');}catch(e){document.documentElement.dataset.theme='mint';}})();"+panelAppearanceInitScript;
