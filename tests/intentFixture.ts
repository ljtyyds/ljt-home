// Local protocol fixture: validates transport paths without calling a paid model.
export const imageText="机器人视觉控制研究：实验在真实机械臂上比较了两种控制方法，并记录了动作延迟与成功率。";
export function intentFixture(body:{messages:Array<{role:string;content:string|Array<{type:string;text?:string}>}>}){
 const user=body.messages.at(-1)!.content,images=Array.isArray(user),text=images?user.filter(p=>p.type==="text").map(p=>p.text||"").join("\n"):user;
 const url=(text.match(/https?:\/\/[^\s]+/)?.[0]||String(body.messages[0].content).match(/上下文链接：(https?:\/\/[^\s]+)/)?.[1]||"").replace(/[。,;]+$/g,"");
 const bodyText=text.match(/(?:正文|原文)[：:]\s*([\s\S]+)/)?.[1]||"";
 const intent=/分类|收藏|整理|提取这些截图/.test(text)?"organize":/读取|总结|回答/.test(text)?"read":images?"chat":url?"organize":"chat";
 return{intent,url,title:images?"机器人视觉控制研究":"",material:images?imageText:bodyText,analysis:images?"图片展示了机器人视觉控制研究，并包含机械臂实验与方法比较。":"已理解你的请求。"};
}
