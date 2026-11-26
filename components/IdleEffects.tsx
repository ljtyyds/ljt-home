"use client";
import {useEffect,useRef,useState} from "react";
import {chooseAmbientEffect,type ActiveEffect,type AmbientSettings} from "@/shared/ambient";

type Running={effect:ActiveEffect;preview:boolean};
export default function IdleEffects({settings,motion,ready,blocked,preview}:{settings:AmbientSettings;motion:boolean;ready:boolean;blocked:boolean;preview:number}){
 const[running,setRunning]=useState<Running|null>(null),lastPreview=useRef(0);
 useEffect(()=>{
  const requestedPreview=lastPreview.current!==preview;lastPreview.current=preview;
  const media=window.matchMedia("(prefers-reduced-motion: reduce)");let timer:ReturnType<typeof setTimeout>|undefined,end:ReturnType<typeof setTimeout>|undefined,active=false,last=Date.now();
  function stop(){if(active){active=false;setRunning(null);}if(end){clearTimeout(end);end=undefined;}}
  setRunning(null);
  if(!ready||!motion||settings.effect==="off")return;
  const delay=settings.delay*1000;
  function unavailable(){return blocked||document.hidden||media.matches;}
  function readingOrEditing(){return !!document.querySelector('dialog[open],.chat-panel,.appearance-popover');}
  function start(isPreview:boolean){if(unavailable())return;const effect=chooseAmbientEffect(settings.effect);if(!effect)return;active=true;setRunning({effect,preview:isPreview});if(isPreview)end=setTimeout(()=>{stop();last=Date.now();schedule();},15000);}
  function check(){timer=undefined;const remaining=delay-(Date.now()-last);if(remaining>0){timer=setTimeout(check,remaining);return;}if(unavailable()||readingOrEditing()){last=Date.now();schedule();return;}start(false);}
  function schedule(){if(!timer&&!active&&!document.hidden&&!media.matches)timer=setTimeout(check,delay);}
  function activity(){last=Date.now();stop();schedule();}
  function visibility(){if(timer){clearTimeout(timer);timer=undefined;}activity();}
  const events=["pointermove","pointerdown","keydown","wheel","touchstart","scroll"] as const;
  for(const event of events)window.addEventListener(event,activity,{capture:true,passive:true});
  document.addEventListener("visibilitychange",visibility);media.addEventListener("change",visibility);
  if(requestedPreview)start(true);else schedule();
  return()=>{if(timer)clearTimeout(timer);if(end)clearTimeout(end);for(const event of events)window.removeEventListener(event,activity,true);document.removeEventListener("visibilitychange",visibility);media.removeEventListener("change",visibility);};
 },[settings.effect,settings.delay,motion,ready,blocked,preview]);
 return running?<EffectCanvas running={running} density={settings.density}/>:null;
}

type Particle={x:number;y:number;size:number;speed:number;phase:number;spin:number;alpha:number};
function EffectCanvas({running,density}:{running:Running;density:AmbientSettings["density"]}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const element=canvas.current;if(!element)return;const ctx=element.getContext("2d");if(!ctx)return;const context=ctx;
  let width=0,height=0,frame=0,previous=0,time=0,particles:Particle[]=[];
  const random=(from:number,to:number)=>from+Math.random()*(to-from);
  function particle(initial=true):Particle{return{x:random(-.1*width,1.1*width),y:initial?random(-height*.2,height):running.effect==="bubbles"?height+25:random(-height*.25,-20),size:random(2,6),speed:random(.7,1.4),phase:random(0,Math.PI*2),spin:random(-1,1),alpha:random(.35,.8)};}
  function resize(){if(!element)return;const scale=Number(document.documentElement.dataset.pageScale||100)/100,ratio=Math.min((window.devicePixelRatio||1)*scale,2);width=element.clientWidth;height=element.clientHeight;element.width=Math.max(1,Math.round(width*ratio));element.height=Math.max(1,Math.round(height*ratio));context.setTransform(ratio,0,0,ratio,0,0);const baseline={petals:42,rain:110,snow:78,meteors:7,bubbles:25}[running.effect],factor=(density==="light"?.55:density==="rich"?1.4:1)*(innerWidth<700?.55:1);particles=Array.from({length:Math.max(4,Math.round(baseline*factor))},()=>particle());}
  resize();window.addEventListener("resize",resize,{passive:true});
  const zoomObserver=new MutationObserver(resize);zoomObserver.observe(document.documentElement,{attributes:true,attributeFilter:["data-page-scale"]});
  function draw(now:number){
   const delta=previous?Math.min((now-previous)/1000,.05):0;previous=now;time+=delta;context.clearRect(0,0,width,height);
   for(let i=0;i<particles.length;i++){
    let p=particles[i];const kind=running.effect;
    if(kind==="rain"){p.x-=90*delta*p.speed;p.y+=640*delta*p.speed;}
    else if(kind==="meteors"){p.x-=360*delta*p.speed;p.y+=220*delta*p.speed;}
    else if(kind==="bubbles"){p.x+=Math.sin(time+p.phase)*12*delta;p.y-=35*delta*p.speed;}
    else{p.x+=(Math.sin(time*.6+p.phase)*17+(kind==="petals"?14:3))*delta;p.y+=(kind==="petals"?43:28)*delta*p.speed;}
    if(p.y>height+100||p.x < -180||p.x>width+180||kind==="bubbles"&&p.y < -50){p=particle(false);if(kind==="meteors")p.x=random(width*.2,width*1.6);particles[i]=p;}
    context.save();context.globalAlpha=p.alpha;
    if(kind==="rain"){context.strokeStyle="#b6d9fa";context.lineWidth=.9;context.beginPath();context.moveTo(p.x,p.y);context.lineTo(p.x+6,p.y-20*p.speed);context.stroke();}
    else if(kind==="snow"){context.fillStyle="#f5fbff";context.shadowColor="#d9efff";context.shadowBlur=2;context.beginPath();context.arc(p.x,p.y,p.size*.55,0,Math.PI*2);context.fill();}
    else if(kind==="petals"){context.translate(p.x,p.y);context.rotate(time*p.spin*.5+p.phase);context.scale(1,.45+Math.abs(Math.sin(time+p.phase))*.5);context.fillStyle=i%3?"#ffd2df":"#f1abc7";context.beginPath();context.moveTo(0,-p.size);context.bezierCurveTo(p.size*1.8,-p.size,p.size*1.4,p.size,0,p.size*1.4);context.bezierCurveTo(-p.size*1.2,p.size,-p.size,-p.size*.6,0,-p.size);context.fill();}
    else if(kind==="bubbles"){const radius=p.size*2.5,gradient=context.createRadialGradient(p.x-radius*.25,p.y-radius*.3,0,p.x,p.y,radius);gradient.addColorStop(0,"rgba(215,245,255,.13)");gradient.addColorStop(.85,"rgba(153,215,250,.02)");gradient.addColorStop(1,"rgba(198,237,255,.35)");context.fillStyle=gradient;context.strokeStyle="rgba(205,241,255,.7)";context.lineWidth=.8;context.beginPath();context.arc(p.x,p.y,radius,0,Math.PI*2);context.fill();context.stroke();context.fillStyle="rgba(255,255,255,.8)";context.beginPath();context.arc(p.x-radius*.35,p.y-radius*.4,1.3,0,Math.PI*2);context.fill();}
    else{const length=85+p.size*12,trail=context.createLinearGradient(p.x,p.y,p.x+length,p.y-length*.61);trail.addColorStop(0,"rgba(250,250,255,.95)");trail.addColorStop(.25,"rgba(174,212,255,.65)");trail.addColorStop(1,"rgba(174,212,255,0)");context.strokeStyle=trail;context.lineWidth=1.6;context.beginPath();context.moveTo(p.x,p.y);context.lineTo(p.x+length,p.y-length*.61);context.stroke();context.fillStyle="#fff8ea";context.beginPath();context.arc(p.x,p.y,1.5,0,Math.PI*2);context.fill();}
    context.restore();
   }
   frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener("resize",resize);zoomObserver.disconnect();context.clearRect(0,0,width,height);};
 },[running.effect,density]);
 return <canvas ref={canvas} className="idle-effects" aria-hidden="true" data-idle-effect={running.effect} data-idle-mode={running.preview?"preview":"idle"}/>;
}
