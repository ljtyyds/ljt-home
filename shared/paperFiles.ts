export type CitationFile={text:string;title:string;reference:string};
export const paperFileAccept=".pdf,.docx,.txt,.md,.bib,.ris,.enw,.json";
export function citationText(input:string,extension:string):CitationFile{
 const source=input.replace(/^\uFEFF/,"").trim();let title="",reference="",text=source;
 const plain=(v:string)=>v.replace(/\\(?:textit|textbf|emph)\s*/g,"").replace(/[{}]/g,"").replace(/\\([&_%])/g,"$1").replace(/\s+/g," ").trim();
 if(extension==="bib"){
  const records=[...source.matchAll(/@(?:article|inproceedings|proceedings|book|incollection|misc|techreport|phdthesis|mastersthesis|unpublished|conference)\s*[{(]/gi)];if(records.length!==1)throw Error("请每次导入一篇 BibTeX 记录，多个条目请拆分后导入。");
  const fields:Record<string,string>={};const pattern=/\b([a-z][\w-]*)\s*=\s*/gi;let m:RegExpExecArray|null;
  while((m=pattern.exec(source))){let p=pattern.lastIndex,value="",depth=0;const open=source[p];if(open==="{"||open==='"'){p++;depth=open==="{"?1:0;for(;p<source.length;p++){const c=source[p];if(c==="\\"){value+=c+(source[++p]||"");continue;}if(open==="{"){if(c==="{")depth++;if(c==="}"&&!--depth)break;}else if(c==='"')break;value+=c;}}else{while(p<source.length&&!/[,\r\n]/.test(source[p]))value+=source[p++];}fields[m[1].toLowerCase()]=plain(value);pattern.lastIndex=p+1;}
  title=fields.title||"";reference=fields.doi||fields.url||"";text=Object.entries(fields).map(([k,v])=>k+": "+v).join("\n");
 }else if(extension==="ris"||extension==="enw"){
  if(extension==="ris"&&(source.match(/^TY\s+-/gm)||[]).length>1||extension==="enw"&&(source.match(/^%0 /gm)||[]).length>1)throw Error("请每次导入一篇文献记录，多个条目请拆分后导入。");
  const fields:Record<string,string[]>={};let key="";for(const line of source.split(/\r?\n/)){const match=extension==="ris"?line.match(/^([A-Z0-9]{2})\s+-\s?(.*)$/):line.match(/^%([A-Z0-9])\s+(.*)$/);if(match){key=match[1];(fields[key]||=[]).push(match[2]);}else if(key&&line.trim())fields[key][fields[key].length-1]+=" "+line.trim();}
  title=(fields.TI||fields.T1||fields.T||[])[0]||"";reference=(fields.DO||fields.R||fields.UR||fields.U||[])[0]||"";text=Object.entries(fields).map(([k,v])=>k+": "+v.join("; ")).join("\n");if(!title&&!reference)throw Error("未识别到有效的文献标题或 DOI，请检查文件格式。");
 }else if(extension==="json"){
  let value;try{value=JSON.parse(source);}catch{throw Error("JSON 文献文件格式不正确。");}if(Array.isArray(value)){if(value.length!==1)throw Error("CSL JSON 请每次导入一篇文献记录。");value=value[0];}if(!value||typeof value!=="object"||typeof value.title!=="string")throw Error("请提供含 title 字段的 CSL JSON 文献记录。");title=value.title;reference=typeof value.DOI==="string"?value.DOI:typeof value.URL==="string"?value.URL:"";text=JSON.stringify(value);
 }
 if(!text.trim())throw Error("文件没有可读取的文字。");return{text:text.slice(0,50000),title:title.slice(0,200),reference:reference.slice(0,2000)};
}
