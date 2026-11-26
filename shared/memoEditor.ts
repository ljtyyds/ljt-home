export const memoContentLimit=50000;
export const memoImagePath=/^\/api\/memo-images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type MemoEdit={value:string;cursor:number};
export function memoExcerpt(value:string){return value.replace(/!\[([^\]]*)\]\([^)]*\)/g,(_,name:string)=>"[图片"+(name?"："+name:"")+"]").replace(/[#*~>|`]/g,"").slice(0,180);}
export function memoImageRefs(value:string){
 const images:Array<{url:string;name:string}>=[],seen=new Set<string>();
 for(const match of value.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)){
  const url=match[2];if(!memoImagePath.test(url)||seen.has(url))continue;
  seen.add(url);images.push({url,name:match[1]||"图片"});
 }
 return images;
}
export function removeMemoImage(value:string,url:string){return memoImagePath.test(url)?value.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,(match,_name:string,current:string)=>current===url?"":match):value;}
export type ImageLayout={width:number;align:"left"|"center"|"right"};
export function imageLayout(title?:string|null):ImageLayout{
 const match=title?.match(/^ljt-image:w=(\d{2,3});align=(left|center|right)$/),width=Number(match?.[1]);
 return match&&width>=25&&width<=100?{width,align:match[2] as ImageLayout["align"]}:{width:100,align:"center"};
}
export function imageLayoutTitle(layout:ImageLayout){const safe=imageLayout("ljt-image:w="+Math.round(layout.width)+";align="+layout.align);return"ljt-image:w="+safe.width+";align="+safe.align;}

function insideFence(text:string){
 let fence="",length=0;
 for(const line of text.split("\n")){
  const match=line.match(/^\s*(?:>\s*)*(`{3,}|~{3,})/);if(!match)continue;
  if(!fence){fence=match[1][0];length=match[1].length;}
  else if(match[1][0]===fence&&match[1].length>=length)fence="";
 }
 return !!fence;
}

/** Continue a list only when the caret is after its marker, outside fenced code. */
export function continueMemoList(value:string,start:number,end=start):MemoEdit|null{
 const lineStart=start>0?value.lastIndexOf("\n",start-1)+1:0;
 if(insideFence(value.slice(0,lineStart)))return null;
 const before=value.slice(lineStart,start);
 const match=before.match(/^([ \t]*(?:>[ \t]*)*)(?:(\d{1,9})([.)])([ \t]*)|([-+*])([ \t]+))(?:\[([ xX])\]([ \t]*))?(.*)$/);
 if(!match)return null;
 const[,indent,number,delimiter,numberSpace,bullet,,task,,text]=match;
 const lineEnd=value.indexOf("\n",end),tail=value.slice(end,lineEnd===-1?value.length:lineEnd);
 if(!text.trim()&&!tail.trim())return{value:value.slice(0,lineStart)+indent+value.slice(end),cursor:lineStart+indent.length};
 const next=indent+(number?String(Number(number)+1)+delimiter:bullet)+" "+(task!==undefined?"[ ] ":"");
 // Accept the user's existing `1.正文` style and make it valid Markdown on Enter.
 const current=number&&!numberSpace?before.replace(/(\d+[.)])/,"$1 "):before;
 const prefix=value.slice(0,lineStart)+current+"\n"+next;
 return{value:prefix+value.slice(end),cursor:prefix.length};
}

export function insertMemoImages(value:string,start:number,end:number,images:Array<{url:string;name:string}>,limit=memoContentLimit):MemoEdit{
 if(!images.length||images.some(image=>!memoImagePath.test(image.url)))throw new Error("图片地址无效，请重新上传。");
 const snippets=images.map(image=>"!["+(image.name.replace(/[\r\n\[\]\\]/g," ").trim()||"图片")+"]("+image.url+")").join("\n\n");
 const prefix=value.slice(0,start),suffix=value.slice(end);
 const addition=(prefix&&!prefix.endsWith("\n\n")?prefix.endsWith("\n")?"\n":"\n\n":"")+snippets+"\n\n";
 const result=prefix+addition+suffix;
 if(result.length>limit)throw new Error("插入图片后内容超过 "+limit+" 个字符，请删减后重试。");
 return{value:result,cursor:prefix.length+addition.length};
}
