import fs from "node:fs";
import path from "node:path";
const cache=new Map<string,Buffer>();
export function pdfAsset(name:string){
 if(!["pdf.mjs","worker.mjs"].includes(name))return null;
 let data=cache.get(name);if(!data){data=fs.readFileSync(path.join(process.cwd(),"vendor","pdfjs",name+".gz"));cache.set(name,data);}
 return new Response(new Uint8Array(data),{headers:{"Content-Type":"text/javascript; charset=utf-8","Content-Encoding":"gzip","Cache-Control":"public, max-age=31536000, immutable","X-Content-Type-Options":"nosniff"}});
}
