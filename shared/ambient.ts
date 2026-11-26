export const ambientEffects=["off","petals","rain","snow","meteors","bubbles","random"] as const;
export type AmbientEffect=typeof ambientEffects[number];
export type ActiveEffect=Exclude<AmbientEffect,"off"|"random">;
export const activeEffects:ActiveEffect[]=["petals","rain","snow","meteors","bubbles"];
export const ambientLabels:Record<AmbientEffect,string>={off:"关闭",petals:"落花",rain:"下雨",snow:"下雪",meteors:"流星",bubbles:"气泡",random:"随机"};
export const idleDelays=[30,60,120,300,600] as const;
export type AmbientSettings={effect:AmbientEffect;delay:number;density:"light"|"normal"|"rich"};
export const ambientSettingsKey="ljt-idle-effects-v1";
export const defaultAmbientSettings:AmbientSettings={effect:"off",delay:60,density:"normal"};
export function parseAmbientSettings(raw:unknown):AmbientSettings{
 let value=raw;if(typeof value==="string")try{value=JSON.parse(value);}catch{value=null;}
 const data=value&&typeof value==="object"?value as Record<string,unknown>:{};
 return{effect:ambientEffects.includes(data.effect as AmbientEffect)?data.effect as AmbientEffect:"off",delay:idleDelays.includes(data.delay as typeof idleDelays[number])?Number(data.delay):60,density:data.density==="light"||data.density==="rich"?data.density:"normal"};
}
export function chooseAmbientEffect(effect:AmbientEffect,random=Math.random()):ActiveEffect|null{return effect==="off"?null:effect==="random"?activeEffects[Math.min(activeEffects.length-1,Math.max(0,Math.floor(random*activeEffects.length)))]:effect;}
