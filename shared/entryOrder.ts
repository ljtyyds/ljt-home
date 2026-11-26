import type {Entry} from "./types";
export const sortableKinds=["bookmark","article","paper"] as const;
export type SortableKind=typeof sortableKinds[number];
export type EntryOrderMove={kind:SortableKind;pinned:boolean;id:string;targetId:string;position:"before"|"after";version:string};
export type OrderVersions=Record<string,string>;
export const entryDragType="application/x-ljt-entry-order";
export function orderKey(kind:SortableKind,pinned:boolean){return kind+":"+(pinned?"pinned":"normal");}
export function sortableKind(kind:string):kind is SortableKind{return(sortableKinds as readonly string[]).includes(kind);}
export function moveEntryIds(ids:string[],id:string,targetId:string,position:"before"|"after"){
 if(id===targetId||!ids.includes(id)||!ids.includes(targetId))return ids;
 const next=ids.filter(value=>value!==id),index=next.indexOf(targetId);next.splice(index+(position==="after"?1:0),0,id);return next;
}
/** Reorder one content kind at a time, preserving the other kinds' positions. */
export function applyEntryOrders(entries:Entry[],orders:Record<string,string[]>){
 const result=[...entries];
 for(const kind of sortableKinds){
  const groups=[true,false].flatMap(pinned=>{
   const rank=new Map((orders[orderKey(kind,pinned)]||[]).map((id,index)=>[id,index]));
   return entries.filter(e=>e.kind===kind&&e.pinned===pinned).sort((a,b)=>(rank.get(a.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.id)??Number.MAX_SAFE_INTEGER));
  });
  let index=0;for(let slot=0;slot<result.length;slot++)if(result[slot].kind===kind)result[slot]=groups[index++];
 }
 return result;
}
