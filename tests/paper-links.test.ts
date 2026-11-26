import {test} from "node:test";
import assert from "node:assert/strict";
import {emptyPaper,paperTitleUrl} from "../shared/papers";

test("已有论文网址保持优先，DOI 和 arXiv 仍规范化",()=>{
 const paper={...emptyPaper(),metadataUrl:"https://proceedings.mlr.press/v202/li23q.html",doi:"10.1234/other"};
 assert.equal(paperTitleUrl({url:"https://papers.example/original",paper}),"https://papers.example/original");
 assert.equal(paperTitleUrl({url:"https://arxiv.org/pdf/2301.12597v2.pdf",paper}),"https://arxiv.org/abs/2301.12597");
 assert.equal(paperTitleUrl({url:"DOI: 10.1234/PAPER",paper}),"https://doi.org/10.1234/paper");
});
test("PDF 导入没有原网址时，标题使用已保存正式论文集页面",()=>{
 for(const metadataUrl of ["https://proceedings.mlr.press/v202/li23q.html","https://proceedings.mlr.press/v139/radford21a.html"]){
  assert.equal(paperTitleUrl({url:"",paper:{...emptyPaper(),fileName:"paper.pdf",metadataUrl,doi:"10.1234/fallback"}}),metadataUrl);
 }
});
test("没有来源页面但有 DOI 的论文仍可打开落地页",()=>{
 assert.equal(paperTitleUrl({url:"",paper:{...emptyPaper(),doi:"10.1234/PAPER"}}),"https://doi.org/10.1234/paper");
});
test("Crossref 元数据接口地址转换为 DOI 网页，不把读者带到 JSON",()=>{
 for(const metadataUrl of ["https://api.crossref.org/works/10.1109%2FCVPR52733.2024.02484","https://api.crossref.org/works/10.1109/CVPR52733.2024.02484"]){
  assert.equal(paperTitleUrl({url:"",paper:{...emptyPaper(),metadataUrl}}),"https://doi.org/10.1109/cvpr52733.2024.02484");
 }
 assert.equal(paperTitleUrl({url:"",paper:{...emptyPaper(),metadataUrl:"https://api.crossref.org/works/bad%ZZ",doi:"10.1234/valid"}}),"https://doi.org/10.1234/valid");
});
test("无效链接可回退到有效来源，不允许伪协议或带凭证地址",()=>{
 for(const url of ["javascript:alert(1)","file:///C:/paper.pdf","data:text/html,bad","https://user:pass@example.com"]){
  assert.equal(paperTitleUrl({url,paper:{...emptyPaper(),metadataUrl:"https://papers.example/formal"}}),"https://papers.example/formal");
  assert.equal(paperTitleUrl({url:"",paper:{...emptyPaper(),metadataUrl:url}}),"");
 }
});
test("完全没有可用来源时不编造网站或把文件名作为链接",()=>{
 assert.equal(paperTitleUrl({url:""}),"");
 assert.equal(paperTitleUrl({url:"",paper:{...emptyPaper(),fileName:"radford21a.pdf",doi:"not-a-doi"}}),"");
});
