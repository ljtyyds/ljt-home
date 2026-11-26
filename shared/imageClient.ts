import { maxImageBytes,type ImageAttachment } from "./images";
export async function prepareImage(file:File):Promise<ImageAttachment>{
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("请选择 PNG、JPEG 或 WebP 图片；不支持 SVG、HEIC 和动图。");
 if(file.size>12_000_000)throw new Error("原图超过 12MB，请裁剪或压缩后导入。");
 const bitmap=await createImageBitmap(file).catch(()=>{throw new Error("图片无法解码，请重新导出为 PNG 或 JPEG。");});
 try{
  if(bitmap.width*bitmap.height>60_000_000)throw new Error("图片像素过大，请分段截图。");
  let ratio=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));let blob:Blob|null=null;
  for(let attempt=0;attempt<4;attempt++){
   const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const context=canvas.getContext("2d");if(!context)throw new Error("浏览器不支持图片处理");context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
   blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.88-attempt*.08));if(blob&&blob.size<=maxImageBytes)break;ratio*=.8;
  }
  if(!blob||blob.size>maxImageBytes)throw new Error("图片压缩后仍过大，请分段截图。");
  const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("图片读取失败"));reader.readAsDataURL(blob!);});
  return{name:file.name.slice(0,160)||"截图.jpg",dataUrl};
 }finally{bitmap.close();}
}
