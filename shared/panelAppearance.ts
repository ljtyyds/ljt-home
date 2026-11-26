export type PanelAppearance={enabled:boolean;color:string;opacity:number};
export const panelAppearanceKey="ljt-panel-style-v1";
export const defaultPanelAppearance:PanelAppearance={enabled:false,color:"#142633",opacity:92};
export function parsePanelAppearance(raw:unknown):PanelAppearance{
 let value=raw;if(typeof value==="string")try{value=JSON.parse(value);}catch{value=null;}
 const data=value&&typeof value==="object"?value as Record<string,unknown>:{};
 return{enabled:data.enabled===true,color:typeof data.color==="string"&&/^#[0-9a-f]{6}$/i.test(data.color)?data.color.toLowerCase():"#142633",opacity:typeof data.opacity==="number"&&Number.isFinite(data.opacity)&&data.opacity>=0&&data.opacity<=100?Math.round(data.opacity):92};
}
// Self-contained so the same palette calculation can run before hydration.
export function panelStyleVariables(raw:unknown):Record<string,string|null>{
 const keys=["--canvas","--surface","--sidebar","--field","--floating","--ink","--muted","--accent","--accent-soft","--line","--hover","--primary-ink","color-scheme"];
 const data=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
 if(data.enabled!==true||typeof data.color!=="string"||!/^#[0-9a-f]{6}$/i.test(data.color))return Object.fromEntries(keys.map(key=>[key,null]));
 const base=[1,3,5].map(i=>parseInt((data.color as string).slice(i,i+2),16)),opacity=typeof data.opacity==="number"&&Number.isFinite(data.opacity)&&data.opacity>=0&&data.opacity<=100?Math.round(data.opacity)/100:.92;
 const luminance=base.map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}),dark=.2126*luminance[0]+.7152*luminance[1]+.0722*luminance[2]<.179;
 const ink=dark?[255,255,255]:[0,0,0],edge=dark?[0,0,0]:[255,255,255],accent=dark?[133,235,208]:[28,112,94];
 const mixes:[string,number[],number,number?][]=[["--canvas",base,0,opacity],["--surface",edge,.08,Math.max(.45,opacity)],["--sidebar",edge,.18,Math.max(.65,opacity)],["--field",edge,.15],["--floating",edge,.1],["--ink",ink,1],["--muted",ink,dark?.77:.8],["--accent",accent,1],["--accent-soft",accent,.17],["--line",ink,.2],["--hover",ink,.1]];
 const styles:Record<string,string|null>={"--primary-ink":dark?"#082a2c":"#ffffff","color-scheme":dark?"dark":"light"};
 for(const[key,color,weight,alpha]of mixes){const channels=base.map((v,i)=>Math.round(v*(1-weight)+color[i]*weight)).join(",");styles[key]=alpha===undefined?"rgb("+channels+")":"rgba("+channels+","+alpha+")";}
 return styles;
}
export function applyPanelAppearance(value:PanelAppearance){const root=document.documentElement;for(const[key,style]of Object.entries(panelStyleVariables(value))){if(style===null)root.style.removeProperty(key);else root.style.setProperty(key,style);}}
export const panelAppearanceInitScript="(function(){try{var vars=("+panelStyleVariables.toString()+")(JSON.parse(localStorage.getItem('"+panelAppearanceKey+"')||'null'));Object.keys(vars).forEach(function(k){if(vars[k]===null)document.documentElement.style.removeProperty(k);else document.documentElement.style.setProperty(k,vars[k]);});}catch(e){}})();";
