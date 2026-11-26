import {test,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";import path from "node:path";import os from "node:os";
import {gunzipSync} from "node:zlib";
import {citationText} from "../shared/paperFiles";
import {emptyPaper} from "../shared/papers";
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),"ljt-paper-file-tests-"));
const papers=await import("../server/papers"),search=await import("../server/paperSearch"),data=await import("../server/db"),assets=await import("../server/pdfAssets");
const record={title:"Robot File Study",summary:"根据论文摘要整理的中文说明。",categoryId:"research",tags:["机器人"],paper:{...emptyPaper(),authors:["Alice Zhang"],year:"2024",field:"机器人",doi:"10.1234/invented"}};
await test("BibTeX、RIS、EndNote 与 CSL JSON 提取标题及定位信息，保留多作者",()=>{
 const bib=citationText('@article{robot,title={Robot {Feedback} Study},author={Alice Zhang and Bo Li},doi={10.1234/robot},abstract={Robot feedback experiments.}}',"bib");assert.equal(bib.title,"Robot Feedback Study");assert.equal(bib.reference,"10.1234/robot");assert.match(bib.text,/Alice Zhang and Bo Li/);
 const ris=citationText('TY  - JOUR\nTI  - Robot Study\nAU  - Zhang, Alice\nAU  - Li, Bo\nDO  - 10.1234/ris\nAB  - Abstract text\nER  -',"ris");assert.equal(ris.title,"Robot Study");assert.match(ris.text,/Zhang, Alice; Li, Bo/);
 assert.equal(citationText('%0 Journal Article\n%T EndNote Study\n%R 10.1234/endnote',"enw").reference,"10.1234/endnote");assert.equal(citationText('[{"title":"CSL Study","DOI":"10.1234/csl"}]',"json").title,"CSL Study");
});
await test("多条文献和损坏 JSON 明确拒绝，不会静默取错论文",()=>{
 assert.throws(()=>citationText('@article{a,title={One}}\n@article{b,title={Two}}',"bib"),/每次/);assert.throws(()=>citationText('TY  - JOUR\nTI  - A\nTY  - JOUR\nTI  - B',"ris"),/每次/);assert.throws(()=>citationText('[{"title":"A"},{"title":"B"}]',"json"),/每次/);assert.throws(()=>citationText('{bad}',"json"),/格式/);
});
await test("文件内容可无网址导入，不接受模型猜测 DOI，原始文件只保存摘要与哈希",async()=>{
 const file={name:"robot.pdf",hash:"a".repeat(64)};const result=await papers.importPaper({reference:"",material:"Robot File Study. Alice Zhang. Robot learning abstract with experiments.",sourceFile:file},undefined,{publication:async()=>undefined,model:async()=>record});assert.equal(result.draft.url,"");assert.equal(result.draft.paper?.doi,"");assert.equal(result.draft.paper?.fileHash,file.hash);assert.match(result.draft.paper!.metadataSource,/robot.pdf/);
 const saved=data.saveEntry(result.draft);assert.equal(saved.url,"");assert.equal(data.visible(saved,false),true);assert.throws(()=>data.saveEntry({...result.draft,title:"Another title"}),/文件已经收藏/);
 const repeat=await papers.importPaper({reference:"Robot File Study",material:"Robot learning abstract",sourceFile:file},undefined,{publication:async()=>undefined,model:async()=>record});assert.equal(repeat.existing?.id,saved.id);
});
await test("仅书目且无摘要的 BibTeX 不生成推测摘要，手动无链接论文可保存",async()=>{
 const result=await papers.importPaper({material:"title: Robot Study\nauthor: Alice\nyear: 2024",sourceFile:{name:"robot.bib",hash:"b".repeat(64)}},undefined,{publication:async()=>undefined,model:async()=>record});assert.equal(result.draft.description,"");
 const manual=data.saveEntry({...data.emptyEntry("paper"),title:"Manual offline paper",paper:{...emptyPaper(),year:"2022"}});assert.equal(manual.url,"");assert.throws(()=>data.saveEntry({...data.emptyEntry("paper"),title:"Manual offline paper",paper:{...emptyPaper(),year:"2022"}}),/收藏过/);
});
await test("论文名检索合并 Crossref 与 arXiv 候选，查询仅使用固定站点",async()=>{
 const urls:string[]=[];const result=await search.searchPapers('Robot "Study"',undefined,async url=>{urls.push(url);if(url.includes('api.crossref.org'))return JSON.stringify({message:{items:[{DOI:"10.1234/study",title:["Robot Study"],author:[{given:"Alice",family:"Zhang"}],published:{"date-parts":[[2024]]},type:"journal-article"}]}});return'<feed><entry><id>http://arxiv.org/abs/2401.12345v2</id><title>Robot Study Preprint</title><author><name>Bo Li</name></author><published>2024-01-01</published><summary>A study.</summary></entry></feed>';});assert.equal(result.candidates.length,2);assert.equal(result.candidates[0].year,"2024");assert.ok(urls.every(url=>['api.crossref.org','export.arxiv.org','dblp.org','proceedings.mlr.press'].includes(new URL(url).hostname)));assert.match(result.message,/选择/);
});
await test("检索允许单个来源失败，但不会在两个来源失败时虚构候选",async()=>{
 const result=await search.searchPapers("Robot study",undefined,async url=>{if(url.includes('arxiv'))throw Error('offline');return JSON.stringify({message:{items:[{DOI:"10.1234/test",title:["Robot Study"]}]}});});assert.equal(result.candidates.length,1);await assert.rejects(()=>search.searchPapers("Robot study",undefined,async()=>{throw Error('offline');}),/暂不可用/);
});
await test("标题检索排除点评数据集并优先显示标题完全一致的原论文",async()=>{
 const title="Highly accurate protein structure prediction with AlphaFold";
 const result=await search.searchPapers(title,undefined,async url=>{if(url.includes("arxiv"))return"<feed/>";assert.match(new URL(url).searchParams.get("filter")||"",/type:journal-article/);return JSON.stringify({message:{items:[{DOI:"10.1234/recommendation",type:"dataset",title:["Faculty Opinions recommendation of "+title]},{DOI:"10.1234/comment",type:"journal-article",title:["Comment on "+title]},{DOI:"10.1234/original",type:"journal-article",title:[title]}]}});});
 assert.equal(result.candidates.length,2);assert.equal(result.candidates[0].title,title);assert.equal(result.candidates[0].match,"exact");assert.equal(result.candidates[1].match,"similar");assert.ok(search.titleScore(title,title)>search.titleScore(title,"Comment on "+title));
});
await test("PDF 资源为经过校验的本地 gzip 模块，其他文件名不可访问",async()=>{
 const api=assets.pdfAsset("pdf.mjs")!;assert.equal(api.headers.get("Content-Encoding"),"gzip");assert.match(gunzipSync(Buffer.from(await api.arrayBuffer())).toString("utf8"),/6\.4\.299/);assert.equal(assets.pdfAsset("../../etc/passwd"),null);assert.equal(assets.pdfAsset("LICENSE"),null);
});
after(()=>data.db.close());
