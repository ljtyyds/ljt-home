import {test} from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {parsePanelAppearance,panelStyleVariables,panelAppearanceInitScript,panelAppearanceKey} from "../shared/panelAppearance";
import {parseAmbientSettings,chooseAmbientEffect,activeEffects} from "../shared/ambient";
import {articleMark} from "../shared/articleMark";

test("自定义面板支持任意有效 RGB 颜色和0到100不透明度，坏数据不会进入样式",()=>{
 assert.deepEqual(parsePanelAppearance('{"enabled":true,"color":"#F1E4D9","opacity":0}'),{enabled:true,color:"#f1e4d9",opacity:0});
 for(const raw of [null,"bad","[]",{color:"url(javascript:1)",opacity:Infinity},{opacity:-1},{opacity:101}])assert.deepEqual(parsePanelAppearance(raw),{enabled:false,color:"#142633",opacity:92});
 assert.equal(panelStyleVariables({enabled:true,color:"#3152a4",opacity:0})["--canvas"],"rgba(49,82,164,0)");
 assert.equal(panelStyleVariables({enabled:true,color:"#ffffff",opacity:100})["color-scheme"],"light");
 assert.equal(panelStyleVariables({enabled:true,color:"#211d3b",opacity:75})["color-scheme"],"dark");
 assert.ok(Object.values(panelStyleVariables({enabled:false})).every(v=>v===null));
 for(const gray of [0,32,64,96,112,128,144,160,192,224,255]){const color="#"+gray.toString(16).padStart(2,"0").repeat(3),style=panelStyleVariables({enabled:true,color,opacity:100}),component=gray/255,luminance=component<=.04045?component/12.92:((component+.055)/1.055)**2.4;const contrast=style["--ink"]==="rgb(255,255,255)"?1.05/(luminance+.05):(luminance+.05)/.05;assert.ok(contrast>=4.5,"Unreadable foreground on "+color);}
});
test("首屏和交互使用相同调色结果，恢复颜色不会覆盖旧背景或缩放设置",()=>{
 const preference={enabled:true,color:"#3152a4",opacity:68},properties:Record<string,string>={"--page-scale":"1.1","--wallpaper-dim":".2"};const values={[panelAppearanceKey]:JSON.stringify(preference),"xingyu-theme":"lake"};
 vm.runInNewContext(panelAppearanceInitScript,{document:{documentElement:{style:{setProperty:(k:string,v:string)=>properties[k]=v,removeProperty:(k:string)=>delete properties[k]}}},localStorage:{getItem:(k:string)=>(values as Record<string,string>)[k]||null}});
 for(const[key,value]of Object.entries(panelStyleVariables(preference)))assert.equal(properties[key],value);
 assert.equal(properties["--page-scale"],"1.1");assert.equal(properties["--wallpaper-dim"],".2");
});
test("空闲设置只接受已支持的效果和等待时长，随机每次只选一种有效效果",()=>{
 assert.deepEqual(parseAmbientSettings('{"effect":"petals","delay":120,"density":"rich"}'),{effect:"petals",delay:120,density:"rich"});
 for(const raw of [null,"bad",{effect:"script",delay:1,density:"unbounded"}])assert.deepEqual(parseAmbientSettings(raw),{effect:"off",delay:60,density:"normal"});
 assert.equal(chooseAmbientEffect("off"),null);assert.equal(chooseAmbientEffect("rain"),"rain");
 for(const value of [0,.2,.4,.6,.8,.999,1])assert.ok(activeEffects.includes(chooseAmbientEffect("random",value)!));
 assert.equal(chooseAmbientEffect("random",0),"petals");assert.equal(chooseAmbientEffect("random",.99),"bubbles");
});
test("资讯头像优先真实媒体名；域名及微信通用来源改取标题，跳过数字符号",()=>{
 const samples:[string,string,string][]=[["宅码","具身个人笔记","宅"],["mp.weixin.qq.com","SCI1-4区自动化与控制系统期刊全名单","S"],["mp.weixin.qq.com","机器人模组开源库","机"],["https://mp.weixin.qq.com/s/123","IROS 2026最佳论文","I"],["微信公众号","云深处的具身智能闭环","云"],["Nature","Robot learning","N"],["example.com","【2026】a new method","A"],["","🚀 论文研究","论"],["","1234 !!!","文"]];
 for(const[source,title,expected]of samples)assert.equal(articleMark({source,title}),expected);
});
