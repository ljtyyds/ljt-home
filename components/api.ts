export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 const res=await fetch("/api/"+path,{...options,cache:"no-store",headers:{"Content-Type":"application/json",...options.headers}});
 let data;try{data=await res.json();}catch{throw new Error("服务器暂时没有响应，请重试");}
 if(!res.ok){if(res.status===401)window.dispatchEvent(new Event("xingyu-session-expired"));throw new Error(data.error||"操作失败");}
 return data as T;
}
export const send=(method:string,data:unknown)=>({method,body:JSON.stringify(data)});
export function dateLabel(value:string,withTime=false){
 if(!value)return "";const d=new Date(value);if(Number.isNaN(d.getTime()))return value;
 return new Intl.DateTimeFormat("zh-CN",{month:"short",day:"numeric",...(withTime?{hour:"2-digit",minute:"2-digit"}:{})}).format(d);
}
