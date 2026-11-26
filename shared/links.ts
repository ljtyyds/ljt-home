/** Accept HTTP(S) links from browser bookmarks, anchors and plain text. */
export function parseLink(value:string):string|null{
 const text=value.trim();if(!text||text.length>2000)return null;
 try{const url=new URL(text);return ["https:","http:"].includes(url.protocol)&&url.hostname&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function droppedLink(transfer:Pick<DataTransfer,"getData">):{url:string;title:string}|null{
 const lines=[...transfer.getData("text/uri-list").split(/\r?\n/),...transfer.getData("text/plain").split(/\r?\n/)];
 const url=lines.filter(line=>!line.trim().startsWith("#")).map(parseLink).find(Boolean);if(!url)return null;
 let title="";
 if(typeof DOMParser!=="undefined"){
  const anchor=new DOMParser().parseFromString(transfer.getData("text/html"),"text/html").querySelector("a[href]");
  if(anchor&&parseLink(anchor.getAttribute("href")||"")===url)title=(anchor.textContent||"").trim().slice(0,200);
 }
 return{url,title:title&&parseLink(title)!==url?title:""};
}
