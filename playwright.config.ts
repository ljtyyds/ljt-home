import { defineConfig } from "@playwright/test";
import path from "node:path";
process.env.E2E_DATA_DIR ||= path.resolve("work","e2e-data-"+Date.now());
export default defineConfig({
 testDir:"./e2e",fullyParallel:false,workers:1,timeout:60000,retries:0,
 use:{baseURL:"http://127.0.0.1:3100",launchOptions:{executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe"},headless:true,viewport:{width:1536,height:1024},trace:"off"},
 reporter:"list",
 webServer:{
 command:'"'+process.execPath+'" node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100',
 url:"http://127.0.0.1:3100/api/health",reuseExistingServer:false,timeout:60000,
 env:{DATA_DIR:process.env.E2E_DATA_DIR,APP_ORIGIN:"http://127.0.0.1:3100",COOKIE_SECURE:"false",AI_ALLOW_LOCAL:"true",AI_API_KEY:"",AI_MODEL:"",AI_BASE_URL:""},
 },
});
