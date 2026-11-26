import {AsyncLocalStorage} from "node:async_hooks";
import {randomUUID} from "node:crypto";

const sessions=new AsyncLocalStorage<string>();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A client session groups a conversation, never grants access to site data. */
export function withAiSession<T>(candidate:string|null,operation:()=>T):T{
 return sessions.run(candidate&&uuid.test(candidate)?candidate.toLowerCase():randomUUID(),operation);
}

export function isOpenCodeGo(baseUrl:string){
 try{const url=new URL(baseUrl);return url.protocol==="https:"&&url.hostname==="opencode.ai"&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&["/inference/go/openai/v1","/zen/go/v1"].includes(url.pathname.replace(/\/$/,""));}catch{return false;}
}

export function providerHeaders(baseUrl:string,apiKey:string):Record<string,string>{
 const headers:Record<string,string>={Authorization:"Bearer "+apiKey,"Content-Type":"application/json"};
 if(isOpenCodeGo(baseUrl)){headers["User-Agent"]="personal-portal/1.0";headers["x-opencode-session"]=sessions.getStore()||randomUUID();}
 return headers;
}

/** Read only a bounded error body; never pass arbitrary provider text or credentials to the UI. */
async function errorIdentity(response:Response){
 const reader=response.body?.getReader();if(!reader)return "";
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384)return "";chunks.push(part.value);
  }
  const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return [value?.error?.type,value?.error?.code,value?.error?.message,typeof value?.error==="string"?value.error:"",value?.type,value?.code,value?.message].filter(v=>typeof v==="string").join(" ").slice(0,16000);
 }catch{return "";}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

export async function providerFailure(response:Response,go:boolean,hasImages:boolean){
 const identity=await errorIdentity(response),status=response.status;
 if(go&&/MissingSessionID|missing x-opencode-session/i.test(identity))return "OpenCode Go 未收到有效的会话标识（HTTP "+status+"）。请刷新页面后重试；若仍失败，请检查网站版本或中间代理是否保留会话请求头。";
 if(status===401)return "模型服务认证失败（HTTP 401）：API 密钥无效、已撤销或未被接受。请填写该服务商的有效密钥，先保存设置，再测试连接。";
 if(status===402)return "模型服务拒绝请求（HTTP 402）：请在服务商控制台检查余额、订阅及工作空间额度。";
 if(go&&[400,403].includes(status)&&/privacy|region|global|restricted model/i.test(identity))return "OpenCode Go 的工作空间隐私或区域设置限制了此模型（HTTP "+status+"）。请在 OpenCode 控制台检查 Settings → Privacy；DeepSeek 模型需要允许 Global 区域。";
 if(status===403)return "模型服务拒绝访问（HTTP 403）：请检查密钥所属工作空间、模型权限、订阅及区域限制。";
 if(status===429)return "模型服务限流或额度已用尽（HTTP 429）：请稍后重试，并在服务商控制台检查用量。";
 if(hasImages&&[400,404,415,422].includes(status))return "当前模型或接口未接受图片输入（HTTP "+status+"）。请确认模型具备视觉能力，也可继续使用文字；图片和输入已保留。";
 return "模型服务返回 HTTP "+status+"：请核对模型名称、接口地址和请求兼容性；输入已保留。";
}
