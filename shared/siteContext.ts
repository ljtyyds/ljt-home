import type {Kind} from "./types";

export type SiteContextInfo={
 scope:Kind[];scopeLabel:string;totalAvailable:number;matched:number;included:number;
 offset:number;nextOffset:number|null;partialRecords:number;denied:boolean;notes:string[];
 records:Array<{id:string;kind:Kind;title:string;url:string;reference:string}>;
};
export function isNextContextPage(message:string){return /^(?:请)?(?:继续(?:读取|总结|查看)?(?:剩余|其余|后续)?(?:资料|内容|记录)?|下一批|下一页)[。！!\s]*$/.test(message.trim());}
export function isContextFollowup(message:string){return isNextContextPage(message)||/^(?:请)?(?:这(?:些|几|篇|条|个|[\d一二三四五六七八九十两])|那(?:些|几|篇|条|个|[\d一二三四五六七八九十两])|它(?:们)?|其中|上(?:面|述|一)|第[\d一二三四五六七八九十两]+(?:篇|条|个|项)|继续|再详细|详细一点)/.test(message.trim());}
