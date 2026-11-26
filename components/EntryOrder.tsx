"use client";
import {createContext,useContext,useEffect,useRef,useState,type DragEvent,type PointerEvent,type KeyboardEvent,type ReactNode} from "react";
import {GripVertical} from "lucide-react";
import type {Entry} from "@/shared/types";
import {entryDragType,type EntryOrderMove} from "@/shared/entryOrder";
type Move=(id:string,targetId:string,position:EntryOrderMove["position"])=>void;
type Drag={entry:Entry;target?:Entry;pointerId?:number;point?:{x:number;y:number}};
type OrderContext={enabled:boolean;saving:boolean;sourceId:string;targetId:string;start:(entry:Entry,event:DragEvent<HTMLElement>)=>void;over:(entry:Entry,event:DragEvent<HTMLElement>)=>void;drop:(entry:Entry,event:DragEvent<HTMLElement>)=>void;clear:()=>void;pointerDown:(entry:Entry,event:PointerEvent<HTMLButtonElement>)=>void;pointerMove:(event:PointerEvent<HTMLButtonElement>)=>void;pointerUp:(event:PointerEvent<HTMLButtonElement>)=>void;keyboard:(entry:Entry,event:KeyboardEvent<HTMLButtonElement>)=>void};
const Context=createContext<OrderContext|null>(null);
export function EntryOrderProvider({entries,enabled,saving,onMove,children}:{entries:Entry[];enabled:boolean;saving:boolean;onMove:Move;children:ReactNode}){
 const drag=useRef<Drag|null>(null),[sourceId,setSourceId]=useState(""),[targetId,setTargetId]=useState(""),[message,setMessage]=useState("");
 function clear(){drag.current=null;setSourceId("");setTargetId("");}
 useEffect(()=>{if(!enabled)clear();},[enabled]);
 useEffect(()=>{const source=drag.current?.entry,current=entries.find(e=>e.id===source?.id);if(source&&(!current||current.pinned!==source.pinned||current.kind!==source.kind))clear();},[entries]);
 function target(entry:Entry){const source=drag.current?.entry;if(!source)return false;if(source.id===entry.id){drag.current!.target=undefined;setTargetId("");return false;}if(source.kind!==entry.kind||source.pinned!==entry.pinned){setTargetId("");if(drag.current)drag.current.target=undefined;setMessage("置顶和非置顶分别排序，不能跨组拖动。");return false;}drag.current!.target=entry;setTargetId(entry.id);setMessage("松开后自动保存顺序。");return true;}
 function pointAt(x:number,y:number){const element=document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-entry-order-id]"),entry=entries.find(e=>e.id===element?.dataset.entryOrderId);if(entry)target(entry);else if(drag.current){drag.current.target=undefined;setTargetId("");}}
 useEffect(()=>{if(!sourceId||drag.current?.pointerId===undefined)return;let frame=0;const tick=()=>{const point=drag.current?.point;if(!point)return;const delta=point.y<65?-12:point.y>innerHeight-65?12:0;if(delta){window.scrollBy(0,delta);pointAt(point.x,point.y);}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[sourceId,entries]);
 function commit(entry?:Entry){const source=drag.current?.entry;if(source&&entry&&source.id!==entry.id&&source.kind===entry.kind&&source.pinned===entry.pinned){const before=entries.findIndex(e=>e.id===source.id)>entries.findIndex(e=>e.id===entry.id);onMove(source.id,entry.id,before?"before":"after");}clear();}
 function internal(event:DragEvent<HTMLElement>){return event.dataTransfer.types.includes(entryDragType);}
 const value:OrderContext={enabled,saving,sourceId,targetId,clear,
  start(entry,event){if(!enabled||saving||(event.target as HTMLElement).closest("a,input,select,textarea,button:not([data-reorder-handle])")){event.preventDefault();event.stopPropagation();return;}event.stopPropagation();event.dataTransfer.setData(entryDragType,entry.id);event.dataTransfer.effectAllowed="move";drag.current={entry};setSourceId(entry.id);setMessage("拖到同组卡片上，再松开保存。");},
  over(entry,event){if(!internal(event))return;event.stopPropagation();event.preventDefault();event.dataTransfer.dropEffect=enabled&&!saving&&target(entry)?"move":"none";},
  drop(entry,event){if(!internal(event))return;event.preventDefault();event.stopPropagation();if(enabled&&!saving&&target(entry))commit(entry);else clear();},
  pointerDown(entry,event){if(!enabled||saving||event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);drag.current={entry,pointerId:event.pointerId,point:{x:event.clientX,y:event.clientY}};setSourceId(entry.id);setMessage("拖到同组卡片上，再松开保存。");},
  pointerMove(event){if(drag.current?.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();drag.current.point={x:event.clientX,y:event.clientY};pointAt(event.clientX,event.clientY);},
  pointerUp(event){if(drag.current?.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();commit(drag.current.target);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);},
  keyboard(entry,event){if(!enabled||saving||!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;event.preventDefault();event.stopPropagation();const group=entries.filter(e=>e.kind===entry.kind&&e.pinned===entry.pinned),index=group.findIndex(e=>e.id===entry.id),direction=event.key==="ArrowUp"||event.key==="ArrowLeft"?-1:1,next=group[index+direction];if(next)onMove(entry.id,next.id,direction<0?"before":"after");else setMessage(direction<0?"已经是本组第一项。":"已经是本组最后一项。");},
 };
 return <Context.Provider value={value}>{enabled?<div className="entry-order-hint"><GripVertical size={15}/><span>拖动卡片上的手柄调整顺序，置顶与非置顶分别排序。</span><span aria-live="polite">{saving?"正在保存顺序…":message||"也可聚焦手柄，用方向键调整。"}</span></div>:null}{children}</Context.Provider>;
}
export function useEntryOrder(){const order=useContext(Context);return{cardProps:(entry:Entry)=>({"data-entry-order-id":entry.id,"data-entry-order-pinned":String(entry.pinned),"data-order-state":order?.sourceId===entry.id?"source":order?.targetId===entry.id?"target":undefined,draggable:!!order?.enabled&&!order.saving,"aria-busy":order?.saving||undefined,...(order?.enabled?{onDragStart:(e:DragEvent<HTMLElement>)=>order.start(entry,e),onDragOver:(e:DragEvent<HTMLElement>)=>order.over(entry,e),onDrop:(e:DragEvent<HTMLElement>)=>order.drop(entry,e),onDragEnd:order.clear}: {})})};}
export function EntryOrderHandle({entry}:{entry:Entry}){
 const order=useContext(Context);if(!order?.enabled)return null;
 return <button type="button" className="icon-button entry-order-handle" data-reorder-handle="true" draggable={false} disabled={order.saving} aria-label={"拖动排序 "+entry.title} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" title="按住拖动排序；也可用方向键调整" onPointerDown={e=>order.pointerDown(entry,e)} onPointerMove={order.pointerMove} onPointerUp={order.pointerUp} onPointerCancel={order.clear} onKeyDown={e=>order.keyboard(entry,e)}><GripVertical size={16}/></button>;
}
