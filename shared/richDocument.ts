import {fromMarkdown} from "mdast-util-from-markdown";
import {toMarkdown} from "mdast-util-to-markdown";
import {gfm} from "micromark-extension-gfm";
import {gfmFromMarkdown,gfmToMarkdown} from "mdast-util-gfm";
import type {Root} from "mdast";
import {memoImagePath,imageLayout,imageLayoutTitle,type ImageLayout} from "./memoEditor";

export type RichNode={type:string;children?:RichNode[];value?:string;url?:string;alt?:string;title?:string|null;ordered?:boolean;start?:number|null;checked?:boolean|null;depth?:number;lang?:string|null;align?:Array<"left"|"center"|"right"|null>;identifier?:string;position?:{start:{offset?:number};end:{offset?:number}}};
export function normalizeLegacyLists(value:string){
 let fence="",fenceLength=0;
 return value.split("\n").map(line=>{
  const mark=line.match(/^\s*(?:>[ \t]*)*(?:(?:[-+*]|\d+[.)])[ \t]+)?(`{3,}|~{3,})/);if(mark){if(!fence){fence=mark[1][0];fenceLength=mark[1].length;}else if(mark[1][0]===fence&&mark[1].length>=fenceLength)fence="";return line;}
  return fence||/^(?: {4}|\t)/.test(line)?line:line.replace(/^([ ]{0,3}(?:>\s*)*\d{1,9}[.)])(?=[^\s\d])/,"$1 ");
 }).join("\n");
}
export function parseRichDocument(value:string):RichNode{
 return fromMarkdown(normalizeLegacyLists(value),{extensions:[gfm()],mdastExtensions:[gfmFromMarkdown()]}) as unknown as RichNode;
}
export function printRichDocument(root:RichNode){return toMarkdown(root as unknown as Root,{extensions:[gfmToMarkdown()],bullet:"-",listItemIndent:"one",fences:true}).trimEnd();}
const safeLink=(url:string)=>/^(https?:\/\/|mailto:|\/[^/]|#)/i.test(url);
const text=(value=""):RichNode=>({type:"text",value});
const paragraph=(children:RichNode[]):RichNode=>({type:"paragraph",children});

export function setImageLayout(element:HTMLElement,layout:ImageLayout){
 const safe=imageLayout(imageLayoutTitle(layout));element.dataset.width=String(safe.width);element.dataset.align=safe.align;element.style.width=safe.width+"%";
 element.style.marginLeft=safe.align==="left"?"0":"auto";element.style.marginRight=safe.align==="right"?"0":"auto";
}
export function createRichImage(doc:Document,image:{url:string;name:string;title?:string|null}){
 if(!memoImagePath.test(image.url))throw new Error("图片地址无效");
 const wrapper=doc.createElement("span");wrapper.className="rich-inline-image";wrapper.contentEditable="false";wrapper.tabIndex=0;wrapper.dataset.richImage=image.url;wrapper.setAttribute("role","button");wrapper.setAttribute("aria-label","编辑图片 "+image.name);
 const img=doc.createElement("img");img.src=image.url;img.alt=image.name||"图片";img.draggable=false;wrapper.append(img);setImageLayout(wrapper,imageLayout(image.title));return wrapper;
}
export function renderRichDocument(root:HTMLElement,value:string){
 const doc=root.ownerDocument,source=normalizeLegacyLists(value),tree=parseRichDocument(source),definitions=new Map<string,RichNode>();
 for(const node of tree.children||[])if(node.type==="definition"&&node.identifier)definitions.set(node.identifier,node);
 function render(node:RichNode):Node{
  if(node.type==="text")return doc.createTextNode(node.value||"");
  if(node.type==="image"||node.type==="imageReference"){
   const definition=node.type==="imageReference"?definitions.get(node.identifier||""):node,url=definition?.url||"";
   if(memoImagePath.test(url))return createRichImage(doc,{url,name:node.alt||"图片",title:definition?.title});
   const placeholder=doc.createElement("span");placeholder.contentEditable="false";placeholder.dataset.richSource=source.slice(node.position?.start.offset||0,node.position?.end.offset||0);placeholder.className="rich-preserved";placeholder.textContent="[外部图片未载入："+(node.alt||url)+"]";return placeholder;
  }
  const tags:Record<string,string>={paragraph:"p",strong:"strong",emphasis:"em",delete:"del",inlineCode:"code",code:"pre",break:"br",blockquote:"blockquote",thematicBreak:"hr",listItem:"li",table:"table",tableRow:"tr",tableCell:"td"};
  if(node.type==="definition"||node.type==="footnoteDefinition"||node.type==="html"){
   const element=doc.createElement("span");element.contentEditable="false";element.dataset.richSource=source.slice(node.position?.start.offset||0,node.position?.end.offset||0);element.className="rich-preserved";
   if(node.type==="html")element.textContent=node.value||"";else element.hidden=true;return element;
  }
  let tag=tags[node.type]||"span";if(node.type==="heading")tag="h"+Math.min(6,Math.max(1,node.depth||1));if(node.type==="list")tag=node.ordered?"ol":"ul";
  if(node.type==="link"||node.type==="linkReference")tag="a";
  const element=doc.createElement(tag);
  if(node.type==="list"&&node.ordered&&node.start&&node.start!==1)element.setAttribute("start",String(node.start));
  if(node.type==="listItem"&&typeof node.checked==="boolean"){
   element.dataset.task="true";const check=doc.createElement("input");check.type="checkbox";check.checked=node.checked;check.contentEditable="false";check.setAttribute("aria-label","标记任务完成");element.append(check);
  }
  if(node.type==="code"){const code=doc.createElement("code");code.textContent=node.value||"";element.dataset.language=node.lang||"";element.append(code);return element;}
  if(node.type==="inlineCode"){element.textContent=node.value||"";return element;}
  if(tag==="a"){
   const definition=node.type==="linkReference"?definitions.get(node.identifier||""):node,url=definition?.url||"";
   if(safeLink(url))element.setAttribute("href",url);if(definition?.title)element.setAttribute("title",definition.title);element.setAttribute("rel","noreferrer noopener");
  }
  if(node.type==="table")element.dataset.align=JSON.stringify(node.align||[]);
  for(const child of node.children||[])element.append(render(child));
  if(["p","li"].includes(tag)&&!element.childNodes.length)element.append(doc.createElement("br"));return element;
 }
 const fragment=doc.createDocumentFragment();for(const node of tree.children||[])fragment.append(render(node));
 if(!fragment.childNodes.length){const p=doc.createElement("p");p.append(doc.createElement("br"));fragment.append(p);}
 root.replaceChildren(fragment);
 // Old notes sometimes contain a dangling empty numbered item immediately before a picture.
 for(const list of Array.from(root.querySelectorAll("ol,ul"))){const next=list.nextElementSibling;if(next?.querySelector("[data-rich-image]")){while(list.lastElementChild&&!list.lastElementChild.textContent?.trim()&&!list.lastElementChild.querySelector("img,input"))list.lastElementChild.remove();if(!list.children.length)list.remove();}}
}

export function serializeRichDocument(root:HTMLElement){
 const blockTags=new Set(["P","DIV","H1","H2","H3","H4","H5","H6","OL","UL","BLOCKQUOTE","PRE","TABLE","HR"]);
 function inline(node:Node):RichNode[]{
  if(node.nodeType===3)return[text(node.textContent||"")];if(node.nodeType!==1)return[];
  const element=node as HTMLElement;if(element.dataset.richSource!==undefined)return[{type:"html",value:element.dataset.richSource}];
  if(element.dataset.richImage&&memoImagePath.test(element.dataset.richImage))return[{type:"image",url:element.dataset.richImage,alt:element.querySelector("img")?.alt||"图片",title:imageLayoutTitle({width:Number(element.dataset.width)||100,align:element.dataset.align as ImageLayout["align"]||"center"})}];
  if(element.tagName==="BR")return[{type:"break"}];if(["INPUT","BUTTON","SCRIPT","STYLE","IMG"].includes(element.tagName))return[];
  const children=Array.from(element.childNodes).flatMap(inline),types:Record<string,string>={STRONG:"strong",B:"strong",EM:"emphasis",I:"emphasis",S:"delete",DEL:"delete"};
  if(types[element.tagName])return[{type:types[element.tagName],children}];
  if(element.tagName==="CODE")return[{type:"inlineCode",value:element.textContent||""}];
  if(element.tagName==="A"&&safeLink(element.getAttribute("href")||""))return[{type:"link",url:element.getAttribute("href")!,title:element.getAttribute("title"),children}];
  return children;
 }
 function blocks(element:Element):RichNode[]{
  const result:RichNode[]=[];let pending:RichNode[]=[];const flush=()=>{if(pending.length){result.push(paragraph(pending));pending=[];}};
  for(const child of Array.from(element.childNodes)){
   if(child.nodeType!==1||!blockTags.has((child as Element).tagName)){pending.push(...inline(child));continue;}
   flush();const node=child as HTMLElement,tag=node.tagName;
   if(tag==="P"||tag==="DIV"){
    if(Array.from(node.children).some(c=>blockTags.has(c.tagName)))result.push(...blocks(node));else{const children=Array.from(node.childNodes).flatMap(inline);if(children.some(c=>c.type!=="break"||node.textContent?.trim()))result.push(paragraph(children));}
   }else if(/^H[1-6]$/.test(tag))result.push({type:"heading",depth:Number(tag[1]),children:Array.from(node.childNodes).flatMap(inline)});
   else if(tag==="OL"||tag==="UL")result.push({type:"list",ordered:tag==="OL",start:tag==="OL"?Number(node.getAttribute("start"))||1:undefined,children:Array.from(node.children).filter(c=>c.tagName==="LI").map(item=>{const check=item.querySelector(":scope > input[type=checkbox],:scope > p > input[type=checkbox]") as HTMLInputElement|null;return{type:"listItem",checked:check?check.checked:null,children:blocks(item).length?blocks(item):[paragraph([])]};})});
   else if(tag==="BLOCKQUOTE")result.push({type:"blockquote",children:blocks(node)});
   else if(tag==="PRE")result.push({type:"code",lang:node.dataset.language||null,value:node.textContent||""});
   else if(tag==="HR")result.push({type:"thematicBreak"});
   else if(tag==="TABLE"){let align:RichNode["align"]=[];try{align=JSON.parse(node.dataset.align||"[]");}catch{}result.push({type:"table",align,children:Array.from(node.querySelectorAll("tr")).map(row=>({type:"tableRow",children:Array.from(row.children).map(cell=>({type:"tableCell",children:Array.from(cell.childNodes).flatMap(inline)}))}))});}
  }
  flush();return result;
 }
 return printRichDocument({type:"root",children:blocks(root)});
}

export function editorRange(root:HTMLElement,remembered?:Range|null){
 const current=root.ownerDocument.getSelection();let range=remembered?.cloneRange()||(current?.rangeCount?current.getRangeAt(0).cloneRange():null);
 if(!range||!root.contains(range.commonAncestorContainer)){range=root.ownerDocument.createRange();range.selectNodeContents(root);range.collapse(false);}
 return range;
}
export function selectRange(root:HTMLElement,range:Range){root.focus();const selection=root.ownerDocument.getSelection();selection?.removeAllRanges();selection?.addRange(range);}
export function selectEditorEnd(root:HTMLElement){const range=root.ownerDocument.createRange();range.selectNodeContents(root);range.collapse(false);selectRange(root,range);}
export function insertRichImages(root:HTMLElement,range:Range,images:Array<{url:string;name:string}>){
 const doc=root.ownerDocument;
 let ancestor=range.startContainer.nodeType===1?range.startContainer as Element:range.startContainer.parentElement;
 const item=ancestor?.closest("li");
 if(item&&root.contains(item)&&!item.textContent?.trim()&&!item.querySelector("[data-rich-image]")){
  let list=item.parentElement!;while(list.parentElement?.closest("ol,ul")&&root.contains(list.parentElement.closest("ol,ul")))list=list.parentElement.closest("ol,ul") as HTMLElement;
  const p=doc.createElement("p");p.append(doc.createElement("br"));list.after(p);item.remove();if(!list.children.length)list.remove();range=doc.createRange();range.selectNodeContents(p);range.collapse(true);ancestor=p;
 }
 range.deleteContents();const fragment=doc.createDocumentFragment();let last:Node|null=null;
 for(const image of images){last=createRichImage(doc,image);fragment.append(last,doc.createElement("br"));}
 range.insertNode(fragment);if(last){range.setStartAfter(last);range.collapse(true);const p=ancestor?.closest("p,div,li");if(p&&p!==root){const tail=doc.createElement("p");tail.append(doc.createElement("br"));if(p.tagName==="LI")p.append(tail);else p.after(tail);range.selectNodeContents(tail);range.collapse(true);}}
 selectRange(root,range);return range;
}
