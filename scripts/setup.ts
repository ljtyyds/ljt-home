import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin,stdout } from "node:process";
import { Writable } from "node:stream";
import { dataDir,hasAdmin } from "../server/db";
import { createAdmin } from "../server/auth";
if(hasAdmin()){console.log("管理员已经创建。请打开网站登录。");process.exit(0);}
const readline=createInterface({input:stdin,output:stdout});
const username=(await readline.question("管理员用户名（2～40 字符）：")).trim();
readline.close();
let muted=false;
const hiddenOutput=new Writable({write(chunk,_encoding,done){if(!muted)stdout.write(chunk);done();}});
const passwordInput=createInterface({input:stdin,output:hiddenOutput,terminal:true});
stdout.write("管理员密码（至少 12 字符，输入不回显）：");
muted=true;const password=await passwordInput.question("");muted=false;passwordInput.close();stdout.write("\n");
if(username.length<2||username.length>40||password.length<12||password.length>128){console.error("用户名或密码长度不符合要求，未创建账号。");process.exit(1);}
createAdmin(username,password);
console.log("管理员创建成功。打开 http://127.0.0.1:3000 并点击「管理员登录」。");
console.log("业务数据目录："+dataDir);
void fs;void path;
