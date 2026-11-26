import {test,expect,type Page,type BrowserContext} from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {emptyPaper} from "../shared/papers";
const visuals="test-results/qa/zzzzz-paper-links.spec";
const origin="http://127.0.0.1:3100",blip="BLIP-2: Bootstrapping Language-Image Pre-training with Frozen Image Encoders and Large Language Models",clip="Learning Transferable Visual Models From Natural Language Supervision",direct="Improved Baselines with Visual Instruction Tuning";
test.describe.configure({mode:"serial"});
async function library(page:Page,mobile=false){
 await page.goto("/");await expect(page).toHaveTitle(/个人知识门户/);
 if(mobile)await page.getByRole("button",{name:"展开导航",exact:true}).click();
 await page.getByRole("button",{name:"论文库",exact:true}).click();await expect(page.getByRole("region",{name:"论文列表",exact:true})).toBeVisible();
}
async function mockDestinations(context:BrowserContext){
 await context.route(/^https:\/\/(?:proceedings\.mlr\.press|doi\.org|papers\.example)\//,route=>route.fulfill({status:200,contentType:"text/html; charset=utf-8",body:"<!doctype html><meta charset='utf-8'><title>Paper destination fixture</title><h1>已打开测试论文页面</h1>"}));
}
async function clickTitle(page:Page,title:string,url:string){
 const link=page.getByRole("link",{name:title,exact:true});await expect(link).toHaveAttribute("href",url);await expect(link).toHaveAttribute("target","_blank");await expect(link).toHaveAttribute("rel",/noopener/);
 const popupPromise=page.waitForEvent("popup");await link.click();const popup=await popupPromise;await expect(popup).toHaveURL(url);await expect(popup.locator("h1")).toHaveText("已打开测试论文页面");await popup.close();
}
test("管理员点击 PDF 导入论文标题可打开正式来源，已有网址和 DOI 均可跳转",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await mockDestinations(page.context());await page.goto("/");await expect(page).toHaveTitle(/个人知识门户/);
 const setup=(await(await page.request.get("/api/session")).json()).setupNeeded;await page.getByRole("button",{name:"管理员登录",exact:true}).click();
 if(setup)await page.getByLabel("初始化码",{exact:true}).fill((await fs.readFile(path.join(process.env.E2E_DATA_DIR!,"setup-token.txt"),"utf8")).trim());
 await page.getByLabel("用户名",{exact:true}).fill("link-admin");await page.getByLabel("密码",{exact:true}).fill("Paper-link-fixture-12345");await page.getByRole("button",{name:setup?"创建并进入管理":"进入管理工作区",exact:true}).click();await expect(page.getByRole("button",{name:"个人备忘录",exact:true})).toBeVisible();
 const fixtures=[
  {title:direct,url:"https://papers.example/llava",paper:{...emptyPaper(),venue:"CVPR",year:"2024",doi:"10.1109/cvpr52733.2024.02484"}},
  {title:blip,url:"",paper:{...emptyPaper(),venue:"International Conference on Machine Learning",year:"2023",fileName:"li23q.pdf",metadataSource:"PMLR 正式会议论文集",metadataUrl:"https://proceedings.mlr.press/v202/li23q.html"}},
  {title:clip,url:"",paper:{...emptyPaper(),venue:"International Conference on Machine Learning",year:"2021",fileName:"radford21a.pdf",metadataSource:"PMLR 正式会议论文集",metadataUrl:"https://proceedings.mlr.press/v139/radford21a.html"}},
  {title:"LINK DOI only",url:"",paper:{...emptyPaper(),doi:"10.1234/paper"}},
  {title:"LINK Crossref provenance",url:"",paper:{...emptyPaper(),metadataUrl:"https://api.crossref.org/works/10.1234%2Fsource"}},
  {title:"LINK No available website",url:"",paper:{...emptyPaper(),fileName:"local-only.pdf"}},
 ];
 for(const fixture of fixtures){const res=await page.request.post("/api/entries",{headers:{Origin:origin},data:{kind:"paper",description:"隔离测试数据：验证论文标题可使用已保存的正式来源跳转。",content:"",categoryId:"research",tags:[],pinned:false,visibility:"public",published:true,source:"",publishedAt:"",dueAt:"",priority:"medium",status:"todo",relatedId:"",...fixture,paper:{...fixture.paper,authors:["Fixture Author"],venueType:"conference",field:"计算机视觉 / 多模态学习"}}});expect(res.status()).toBe(201);}
 await library(page);await clickTitle(page,blip,"https://proceedings.mlr.press/v202/li23q.html");await clickTitle(page,clip,"https://proceedings.mlr.press/v139/radford21a.html");await clickTitle(page,direct,"https://papers.example/llava");await clickTitle(page,"LINK DOI only","https://doi.org/10.1234/paper");await clickTitle(page,"LINK Crossref provenance","https://doi.org/10.1234/source");
 await expect(page.getByRole("link",{name:"LINK No available website",exact:true})).toHaveCount(0);await expect(page.locator(".paper-title").filter({hasText:"LINK No available website"})).toHaveAttribute("title",/暂无论文链接/);
 const saved=(await(await page.request.get("/api/entries")).json()).entries;expect(saved.find((e:{title:string})=>e.title===blip).url).toBe("");await page.getByLabel("搜索内容",{exact:true}).fill("BLIP-2");await fs.mkdir(visuals,{recursive:true});await page.screenshot({path:path.join(visuals,"paper-title-links-desktop.png"),animations:"disabled"});expect(errors).toEqual([]);
});
test("读者也能从标题打开来源，保持只读权限",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await mockDestinations(page.context());await library(page);await clickTitle(page,blip,"https://proceedings.mlr.press/v202/li23q.html");await expect(page.locator(".entry-actions")).toHaveCount(0);await expect(page.getByRole("button",{name:"新增论文",exact:true})).toHaveCount(0);await expect(page.locator(".paper-title")).toHaveCount(6);expect(errors).toEqual([]);
});
test("手机尺寸长标题可点击，卡片没有横向溢出",async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});await mockDestinations(context);const page=await context.newPage(),errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await library(page,true);await page.getByLabel("搜索内容",{exact:true}).fill("BLIP-2");const card=page.locator(".paper-card");await expect(card).toHaveCount(1);expect(await card.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})).toBe(true);await page.screenshot({path:path.join(visuals,"paper-title-links-mobile.png"),animations:"disabled"});await clickTitle(page,blip,"https://proceedings.mlr.press/v202/li23q.html");expect(errors).toEqual([]);await context.close();
});
