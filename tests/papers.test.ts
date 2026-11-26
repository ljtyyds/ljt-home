import {test,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {NextRequest} from "next/server";
import {emptyPaper,emptyMetric,paperReference} from "../shared/papers";
import type {RegistryPaper} from "../server/papers";
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),"ljt-paper-tests-"));
process.env.APP_ORIGIN="http://paper.test";process.env.COOKIE_SECURE="false";
delete process.env.AI_API_KEY;delete process.env.AI_BASE_URL;delete process.env.AI_MODEL;
const papers=await import("../server/papers"),data=await import("../server/db"),route=await import("../app/api/[...segments]/route"),ai=await import("../server/ai");
let cookie="",savedId="";
const source="https://papers.example/robot-control";
const registry:RegistryPaper={title:"Grounded Robot Control",authors:["Alice Zhang","Bo Li"],venue:"Robotics Research",venueType:"journal",year:"2024",doi:"10.1234/robot",abstract:"An evaluated controller improves robot precision with feedback.",source:"Crossref DOI 元数据",sourceUrl:"https://api.crossref.org/works/10.1234%2Frobot"};
function response(){return{title:"AI 不应覆盖的标题",summary:"通过反馈控制提高机器人操作精度，包含实验评估。",categoryId:"research",tags:["机器人","控制"],paper:{...emptyPaper(),authors:["Invented Name"],venue:"Imagined Venue",year:"2026",field:"机器人 / 反馈控制",sciScheme:"JCR" as const,sci:{value:"Q1",year:"2025",sourceUrl:source,evidence:"2025 JCR Q1 Robotics"},ccf:{value:"A",year:"2022",sourceUrl:source,evidence:"2022 CCF A Robotics"},impactFactor:{value:"5.2",year:"2025",sourceUrl:source,evidence:"2025 Impact Factor 5.2"}}};}
const dependencies={publication:async()=>undefined,registry:async()=>registry,model:async()=>response(),readWeb:async()=>{throw Error("Should not fetch when exact registry exists");}};
async function request(p:string,method="GET",body?:unknown,admin=false,origin="http://paper.test"){
 const req=new NextRequest("http://paper.test/api/"+p,{method,headers:{"Content-Type":"application/json",...(method!=="GET"?{Origin:origin}:{}),...(admin?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return route.GET(req,{params:Promise.resolve({segments:p.split("/")})});
}
await test("DOI 与 arXiv 链接规范化，拒绝伪协议及带凭证地址",()=>{
 assert.equal(paperReference("DOI: 10.1234/ROBOT")?.url,"https://doi.org/10.1234/robot");
 assert.equal(paperReference("https://dx.doi.org/10.1234/ROBOT")?.doi,"10.1234/robot");
 assert.equal(paperReference("https://arxiv.org/pdf/2401.12345v2.pdf")?.url,"https://arxiv.org/abs/2401.12345");
 assert.equal(paperReference("https://arxiv.org/abs/cs/9901001v2")?.arxiv,"cs/9901001");
 for(const url of ["javascript:alert(1)","file:///tmp/a","https://user:pass@example.com","10.1234/abc#bad"])assert.equal(paperReference(url),null);
});
await test("Crossref 使用正式出版年与作者顺序，防止错误 DOI 元数据串入",()=>{
 const fixture={message:{DOI:"10.1234/robot",title:["<i>Original</i> title"],author:[{given:"Alice",family:"Zhang"},{name:"Robot Group"}],"container-title":["Robotics"],type:"journal-article","published-print":{"date-parts":[[2024]]},published:{"date-parts":[[2023]]},abstract:"<jats:p>Actual abstract</jats:p>"}};
 const value=papers.crossrefMetadata(fixture,"10.1234/robot");assert.equal(value.year,"2024");assert.deepEqual(value.authors,["Alice Zhang","Robot Group"]);assert.equal(value.abstract,"Actual abstract");
 assert.throws(()=>papers.crossrefMetadata(fixture,"10.1234/different"));
});
await test("arXiv 识别版本与预印本年，未核实的 journal_ref 不使用上传年冒充出版年",()=>{
 const entry='<feed><entry><id>http://arxiv.org/abs/2401.12345v3</id><title>Robot paper</title><author><name>Alice</name></author><published>2024-01-10T00:00:00Z</published><summary>Robot learning.</summary></entry></feed>';
 const preprint=papers.arxivMetadata(entry,"2401.12345");assert.equal(preprint.year,"2024");assert.equal(preprint.venueType,"preprint");
 const published=papers.arxivMetadata(entry.replace('</entry>','<arxiv:journal_ref>Journal 2025</arxiv:journal_ref></entry>'),"2401.12345");assert.equal(published.year,"");assert.equal(published.venueType,"unknown");
 assert.throws(()=>papers.arxivMetadata(entry,"2401.99999"));
});
await test("指标需要证据中的数值和年度，以及实际提供的来源",()=>{
 const metric={value:"5.2",year:"2025",sourceUrl:source,evidence:"2025 Impact Factor 5.2"};
 assert.deepEqual(papers.supportedMetric(metric,metric.evidence,[source]),metric);
 assert.deepEqual(papers.supportedMetric(metric,"No evidence",[source]),emptyMetric());
 assert.deepEqual(papers.supportedMetric(metric,metric.evidence,[]),emptyMetric());
 assert.deepEqual(papers.supportedMetric({...metric,year:"2024"},metric.evidence,[source]),emptyMetric());
});
await test("导入生成草稿而不写库，书目字段优先采用登记信息且没有依据的指标清空",async()=>{
 const before=data.listEntries(true).length;const result=await papers.importPaper({reference:"10.1234/robot"},undefined,dependencies);
 assert.equal(data.listEntries(true).length,before);assert.equal(result.draft.title,registry.title);assert.deepEqual(result.draft.paper?.authors,registry.authors);assert.equal(result.draft.paper?.year,"2024");assert.equal(result.draft.paper?.venue,registry.venue);assert.deepEqual(result.draft.paper?.sci,emptyMetric());
 assert.equal(result.draft.visibility,"public");assert.equal(result.draft.published,true);
});
await test("有效指标保留来源年度，会议没有期刊影响因子，预印本不带 SCI/CCF",async()=>{
 const material="2025 JCR Q1 Robotics\n2022 CCF A Robotics\n2025 Impact Factor 5.2";
 const result=await papers.importPaper({reference:source,material},undefined,{...dependencies,publication:async()=>undefined,registry:async()=>undefined});
 assert.equal(result.draft.paper?.impactFactor.value,"5.2");assert.equal(result.draft.paper?.ccf.year,"2022");
 const conference=await papers.importPaper({reference:source,material},undefined,{...dependencies,publication:async()=>undefined,registry:async()=>({...registry,venueType:"conference"})});assert.equal(conference.draft.paper?.impactFactor.value,"");assert.equal(conference.draft.paper?.sci.value,"");
 const preprint=await papers.importPaper({reference:source,material},undefined,{...dependencies,publication:async()=>undefined,registry:async()=>({...registry,venueType:"preprint"})});assert.equal(preprint.draft.paper?.ccf.value,"");
});
await test("验证页和读取失败不会产生虚假论文草稿",async()=>{
 let calls=0;await assert.rejects(()=>papers.importPaper({reference:source},undefined,{publication:async()=>undefined,registry:async()=>undefined,readWeb:async()=>({title:"环境异常",description:"完成验证后访问",text:"当前环境异常，需完成验证"}),model:async()=>{calls++;return response();}}),/验证页|补充/);assert.equal(calls,0);
});
await test("元数据缺少摘要时不从标题臆造摘要，未知分类和错误模型结构拒绝",async()=>{
 const noAbstract=await papers.importPaper({reference:"10.1234/robot"},undefined,{...dependencies,publication:async()=>undefined,registry:async()=>({...registry,abstract:""})});assert.equal(noAbstract.draft.description,"");
 await assert.rejects(()=>papers.importPaper({reference:source,material:"Actual paper abstract"},undefined,{...dependencies,model:async()=>({...response(),categoryId:"nonexistent"})}),/分类/);
 await assert.rejects(()=>papers.importPaper({reference:source,material:"Actual abstract"},undefined,{...dependencies,model:async()=>({title:"bad"})}),/格式/);
});
await test("截图导入先提取有效内容，无法识别时拒绝且不产生草稿",async()=>{
 const image={name:"paper.png",dataUrl:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII="};let stages=0;
 const model:typeof ai.structuredModel=async(system,_text,_signal,images)=>{stages++;if(system.includes("文字提取器")){assert.equal(images?.length,1);return{text:"Grounded Robot Control. Alice Zhang. A real abstract about feedback control."};}return response();};
 const result=await papers.importPaper({reference:source,images:[image]},undefined,{publication:async()=>undefined,registry:async()=>undefined,model});assert.equal(stages,2);assert.ok(result.notes.some(n=>n.includes("截图")));assert.equal(JSON.stringify(result.draft).includes("data:image"),false);
 await assert.rejects(()=>papers.importPaper({reference:source,images:[image]},undefined,{publication:async()=>undefined,registry:async()=>undefined,model:async()=>({text:""})}),/清晰/);
});
await test("论文导入仅管理员可调用，跨源拒绝，保存仍是独立动作",async()=>{
 assert.equal((await request("ai/import-paper","POST",{reference:source})).status,401);
 const token=fs.readFileSync(path.join(process.env.DATA_DIR!,"setup-token.txt"),"utf8").trim();const login=await request("login","POST",{username:"papers-admin",password:"Paper-test-password-123",setupToken:token});assert.equal(login.status,200);cookie=login.headers.get("set-cookie")!.split(";")[0];
 assert.equal((await request("ai/import-paper","POST",{reference:source},true,"https://foreign.example")).status,403);
 assert.equal((await request("ai/import-paper","POST",{reference:"bad"},true)).status,400);
 const draft=(await papers.importPaper({reference:"10.1234/robot"},undefined,dependencies)).draft;
 const saved=await request("entries","POST",draft,true);assert.equal(saved.status,201);savedId=(await saved.json()).entry.id;
 const publicResult=await(await request("entries")).json();assert.ok(publicResult.entries.some((e:{id:string})=>e.id===savedId));
 assert.equal((await request("entries","POST",draft)).status,401);
});
await test("DOI 大小写去重和 arXiv 版本去重，重新导入指出已有论文",async()=>{
 const result=await papers.importPaper({reference:"https://doi.org/10.1234/ROBOT"},undefined,dependencies);assert.equal(result.existing?.id,savedId);
 assert.throws(()=>data.saveEntry({...result.draft,url:"https://dx.doi.org/10.1234/ROBOT"}),/收藏过/);
 const paper={...data.emptyEntry("paper"),title:"arXiv fixture",url:"https://arxiv.org/pdf/2401.12345v2.pdf",paper:{...response().paper,venueType:"preprint" as const}};const saved=data.saveEntry(paper);assert.equal(saved.paper?.impactFactor.value,"");assert.equal(saved.paper?.sci.value,"");assert.equal(saved.paper?.ccf.value,"");assert.throws(()=>data.saveEntry({...paper,url:"https://arxiv.org/abs/2401.12345v3"}),/收藏过/);
});
await test("论文编辑冲突保护及关联待办可用，读者查询作者时能获得论文资料",async()=>{
 const entry=data.findEntry(savedId)!;assert.throws(()=>data.saveEntry({...data.emptyEntry("paper"),title:entry.title,url:entry.url},savedId,entry.revision+1),/其他位置更新/);
 const todo=data.saveEntry({...data.emptyEntry("todo"),title:"阅读论文",relatedId:savedId});assert.equal(todo.relatedId,savedId);assert.equal(data.visible(todo,false),false);
 assert.ok(ai.chatContext("Alice Zhang",false).some(e=>e.id===savedId&&e.paper?.year==="2024"));
});
after(()=>data.db.close());
