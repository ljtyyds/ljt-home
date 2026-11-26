import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeLegacyLists,parseRichDocument,printRichDocument} from "../shared/richDocument";
import {imageLayout,imageLayoutTitle,memoImageRefs,removeMemoImage} from "../shared/memoEditor";
const url="/api/memo-images/12345678-1234-4234-8234-123456789abc";
test("legacy numbered lines become proper list nodes, with original order and no-space text preserved",()=>{
 const tree=parseRichDocument("1.尝试换模型\n2. 尝试新字段\n3.\n\n![截图]("+url+")");
 assert.equal(tree.children?.[0].type,"list");assert.equal(tree.children?.[0].children?.length,3);
 assert.match(printRichDocument(tree),/1\. 尝试换模型\n2\. 尝试新字段/);
});
test("code fences are never reformatted as legacy lists",()=>{
 const input="```text\n1.原样保留\n```\n\n1.正常列表";
 assert.equal(normalizeLegacyLists(input),"```text\n1.原样保留\n```\n\n1. 正常列表");
 assert.equal(normalizeLegacyLists("    1.缩进代码\n\n1.25 是小数"),"    1.缩进代码\n\n1.25 是小数");
 for(const source of ["> ```\n> 1.代码\n> ```","- ```\n  1.代码\n  ```","````\n```\n1.代码\n````"])assert.equal(normalizeLegacyLists(source),source);
});
test("nested lists, checked tasks, headings, tables, links and code survive Markdown round trips",()=>{
 const input="# 计划\n\n3. first\n   - nested\n4. second\n\n- [x] done\n- [ ] next\n\n**strong** and `inline` [link](https://example.com)\n\n| A | B |\n| - | - |\n| one | two |\n\n```ts\nconst value=1;\n```";
 const output=printRichDocument(parseRichDocument(input));assert.equal(printRichDocument(parseRichDocument(output)),output);
 for(const token of ["3. first","nested","[x] done","[ ] next","https://example.com","const value=1"])assert.ok(output.includes(token));
});
test("image layout accepts only bounded widths and known alignment",()=>{
 assert.deepEqual(imageLayout("ljt-image:w=70;align=right"),{width:70,align:"right"});
 for(const title of ["ljt-image:w=0;align=left","ljt-image:w=300;align=center","ljt-image:w=70;align=evil",'" onerror="alert(1)'])assert.deepEqual(imageLayout(title),{width:100,align:"center"});
 assert.equal(imageLayoutTitle({width:49.5,align:"left"}),"ljt-image:w=50;align=left");
});
test("image captions and per-reference layouts persist without changing the protected URL",()=>{
 const input='![实验说明]('+url+' "ljt-image:w=55;align=left")';
 assert.equal(printRichDocument(parseRichDocument(input)),input);
 assert.deepEqual(memoImageRefs(input),[{url,name:"实验说明"}]);
 assert.equal(removeMemoImage(input,url),"");
});
test("legacy image syntax remains supported and foreign URLs do not become private images",()=>{
 assert.deepEqual(memoImageRefs('![旧截图]('+url+')'),[{url,name:"旧截图"}]);
 assert.deepEqual(memoImageRefs('![external](https://example.com/x.png)\n![other](/api/memo-images/../../secret)'),[]);
});
