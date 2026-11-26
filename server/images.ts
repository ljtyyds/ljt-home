import { z } from "zod";
import { maxImages,maxImageBytes } from "@/shared/images";
export function validImageDataUrl(value:string){
 const match=value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)return false;
 const data=Buffer.from(match[2],"base64");if(data.length>maxImageBytes||data.toString("base64")!==match[2])return false;
 let width=0,height=0;
 if(match[1]==="png"){
  if(data.length<33||data.subarray(0,8).toString("hex")!=="89504e470d0a1a0a"||data.toString("ascii",12,16)!=="IHDR")return false;
  width=data.readUInt32BE(16);height=data.readUInt32BE(20);
 }else{
  if(data.length<4||data[0]!==255||data[1]!==216||data.at(-2)!==255||data.at(-1)!==217)return false;
  let offset=2;while(offset+4<data.length){if(data[offset++]!==255)return false;let marker=data[offset++];while(marker===255&&offset<data.length)marker=data[offset++];if(marker===218||marker===217)break;if(marker===1||marker>=208&&marker<=215)continue;if(offset+2>data.length)return false;const length=data.readUInt16BE(offset);if(length<2||offset+length>data.length)return false;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<7)return false;height=data.readUInt16BE(offset+3);width=data.readUInt16BE(offset+5);break;}offset+=length;}
 }
 return width>0&&height>0&&width<=6000&&height<=6000&&width*height<=12_000_000;
}
export const imagesInput=z.array(z.object({name:z.string().trim().min(1).max(160),dataUrl:z.string().max(2_000_100).refine(validImageDataUrl,"图片格式、尺寸或大小不受支持，请重新导入 PNG、JPEG 或 WebP 图片")}).strict()).max(maxImages).default([]);
