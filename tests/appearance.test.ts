import {test} from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {themes,isTheme,parseWallpaperView,wallpaperViewKey,appearanceInitScript} from "../shared/appearance";
test("原有主题继续有效，暮色湖畔是可选项，未知存储值不会作为主题使用",()=>{
 for(const theme of ["mint","night","plain","lake"])assert.equal(isTheme(theme),true);for(const value of [null,undefined,"",{},"javascript:alert(1)"])assert.equal(isTheme(value),false);assert.equal(themes.length,4);
});
test("图片明暗、铺放方式有界限，损坏存储安全回到清晰默认值",()=>{
 for(const value of [null,undefined,"bad","null","[]",0,{brightness:Infinity},{brightness:NaN},{brightness:10},{brightness:200}])assert.deepEqual(parseWallpaperView(value),{brightness:80,fit:"cover"});
 assert.deepEqual(parseWallpaperView('{"brightness":95,"fit":"contain"}'),{brightness:95,fit:"contain"});assert.deepEqual(parseWallpaperView({brightness:83,fit:"unknown"}),{brightness:85,fit:"cover"});assert.deepEqual(parseWallpaperView({brightness:40,fit:"contain"}),{brightness:40,fit:"contain"});
});
function init(values:Record<string,string>,blocked=false){const properties:Record<string,string>={},document={documentElement:{dataset:{} as Record<string,string>,style:{setProperty:(key:string,value:string)=>{properties[key]=value;}}}},store={...values};vm.runInNewContext(appearanceInitScript,{document,localStorage:{getItem:(key:string)=>{if(blocked)throw Error("storage blocked");return store[key]??null;}}});return{theme:document.documentElement.dataset.theme,properties,store};}
test("首屏脚本在水合前恢复夜间主题和明暗，避免白色闪烁且不改旧键",()=>{
 const values={"xingyu-theme":"night","xingyu-motion":"off","ljt-wallpaper-active":"on","ljt-page-scale-v1":"110",[wallpaperViewKey]:'{"brightness":95,"fit":"contain"}'};const result=init(values);assert.equal(result.theme,"night");assert.equal(result.properties["--wallpaper-fit"],"contain");assert.ok(Math.abs(Number(result.properties["--wallpaper-dim"])-.05)<1e-9);assert.deepEqual(result.store,values);
});
test("损坏的显示偏好不会抹掉已保存的主题，存储被禁用时仍可显示",()=>{
 assert.equal(init({"xingyu-theme":"lake",[wallpaperViewKey]:"bad"}).theme,"lake");assert.equal(init({"xingyu-theme":"night"},true).theme,"mint");assert.equal(init({"xingyu-theme":"unknown"}).theme,"mint");
});
