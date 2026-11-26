export function articleMark(entry:{source?:string;title?:string}):string{
 const source=(entry.source||"").normalize("NFKC").trim();
 const generic=/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(source)||["微信","微信公众号","微信公众平台","公众号"].includes(source.toLowerCase());
 const first=(value:string)=>value.normalize("NFKC").match(/\p{L}/u)?.[0]?.toUpperCase();
 return(!generic&&first(source))||first(entry.title||"")||"文";
}
