import {randomUUID} from "node:crypto";
import {z} from "zod";
import {db} from "./db";
import {AppError} from "./auth";
import {imagesInput} from "./images";

export const memoImagesInput=z.object({images:imagesInput.refine(images=>images.length>0,"请选择图片")}).strict();
export function saveMemoImages(input:z.input<typeof memoImagesInput>){
 const{images}=memoImagesInput.parse(input);
 const parsed=images.map(image=>{const mime=image.dataUrl.startsWith("data:image/png;")?"image/png":"image/jpeg";return{id:randomUUID(),name:image.name,mime,bytes:Buffer.from(image.dataUrl.slice(image.dataUrl.indexOf(",")+1),"base64")};});
 db.exec("BEGIN IMMEDIATE");
 try{
  const total=Number((db.prepare("SELECT COALESCE(SUM(length(data)),0) AS size FROM memo_images").get() as {size:number}).size);
  if(total+parsed.reduce((sum,image)=>sum+image.bytes.length,0)>250_000_000)throw new AppError("备忘录图片空间已达 250MB，请先备份并整理图片。",413);
  const insert=db.prepare("INSERT INTO memo_images(id,name,mime,data,created_at) VALUES(?,?,?,?,?)");
  for(const image of parsed)insert.run(image.id,image.name,image.mime,image.bytes,new Date().toISOString());
  db.exec("COMMIT");return{images:parsed.map(image=>({url:"/api/memo-images/"+image.id,name:image.name}))};
 }catch(error){db.exec("ROLLBACK");throw error;}
}
export function readMemoImage(id:string){
 if(!z.uuid().safeParse(id).success)throw new AppError("图片不存在",404);
 const image=db.prepare("SELECT mime,data FROM memo_images WHERE id=?").get(id) as {mime:string;data:Uint8Array}|undefined;
 if(!image)throw new AppError("图片不存在",404);
 return new Response(new Uint8Array(image.data),{headers:{"Content-Type":image.mime,"Content-Length":String(image.data.length),"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin","Content-Disposition":"inline"}});
}
