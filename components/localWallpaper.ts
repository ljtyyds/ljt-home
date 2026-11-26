export type LocalWallpaper={file:Blob;name:string;kind:"image"|"video"};
const databaseName="ljt-appearance",storeName="wallpaper";
function openDatabase():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(new Error("当前浏览器不支持本地背景存储，请换用普通浏览模式。"));return;}
  const request=indexedDB.open(databaseName,1);
  request.onupgradeneeded=()=>{request.result.createObjectStore(storeName);};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(new Error("无法访问浏览器存储，请允许此网站保存本地数据。"));
  request.onblocked=()=>reject(new Error("本地背景存储正被其他页面占用，请关闭其他页面后重试。"));
 });
}
export async function readWallpaper():Promise<LocalWallpaper|null>{
 const db=await openDatabase();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(storeName,"readonly"),request=tx.objectStore(storeName).get("current");
  tx.oncomplete=()=>{const value=request.result;resolve(value?.file instanceof Blob&&(value.kind==="image"||value.kind==="video")?value:null);};
  tx.onabort=()=>reject(tx.error||new Error("读取本地背景失败"));
 });}finally{db.close();}
}
export async function saveWallpaper(wallpaper:LocalWallpaper):Promise<void>{
 const db=await openDatabase();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(storeName,"readwrite");tx.objectStore(storeName).put(wallpaper,"current");
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error(tx.error?.name==="QuotaExceededError"?"浏览器存储空间不足，请选择更小的背景文件。":"保存本地背景失败，请检查浏览器存储权限。"));
 });}finally{db.close();}
}
export async function validateWallpaper(file:File):Promise<"image"|"video">{
 const images=["image/jpeg","image/png","image/webp","image/gif","image/avif"],videos=["video/mp4","video/webm"];
 const kind=images.includes(file.type)?"image":videos.includes(file.type)?"video":null;
 if(!kind)throw new Error("请选择 JPG、PNG、WebP、GIF、AVIF 图片或 MP4、WebM 视频。");
 if(!file.size)throw new Error("文件为空，请选择有效的背景文件。");
 if(file.size>(kind==="image"?10:50)*1024*1024)throw new Error(kind==="image"?"图片大小不能超过 10 MB。":"视频大小不能超过 50 MB，建议使用短视频。");
 const url=URL.createObjectURL(file);
 try{await new Promise<void>((resolve,reject)=>{
  const media=kind==="image"?new Image():document.createElement("video");
  const timer=window.setTimeout(()=>finish(new Error("背景读取超时，请选择更小或其他格式的文件。")),12000);
  function finish(error?:Error){window.clearTimeout(timer);media.onload=null;media.onerror=null;media.onloadeddata=null;media.removeAttribute("src");if(media instanceof HTMLVideoElement)media.load();error?reject(error):resolve();}
  media.onerror=()=>finish(new Error("无法读取此文件，请确认文件完整且格式受浏览器支持。"));
  if(media instanceof HTMLVideoElement){media.preload="auto";media.muted=true;media.onloadeddata=()=>finish();}else media.onload=()=>finish();
  media.src=url;
 });}finally{URL.revokeObjectURL(url);}
 return kind;
}
