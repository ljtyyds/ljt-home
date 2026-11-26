import type { PaperMetadata } from "./papers";
export const kinds = ["bookmark","article","paper","memo","todo"] as const;
export type Kind = typeof kinds[number];
export type Entry = {
  id:string; kind:Kind; title:string; url:string; description:string; content:string;
  categoryId:string; tags:string[]; pinned:boolean; visibility:"public"|"private";
  published:boolean; source:string; publishedAt:string; dueAt:string;
  priority:"low"|"medium"|"high"; status:"todo"|"doing"|"done"; relatedId:string;
  revision:number; createdAt:string; updatedAt:string;
  paper?:PaperMetadata;
};
export type Category = {id:string;name:string};
export type Identity = {admin:boolean;username?:string;setupNeeded:boolean};
export type Notice = {kind:"success"|"error";message:string};
export const kindLabels:Record<Kind,string>={bookmark:"关注网站",article:"行业前沿",paper:"论文库",memo:"个人备忘录",todo:"待办事项"};
export const descriptions:Record<Kind,string>={
  bookmark:"收藏值得反复访问的灵感与工具。",
  article:"让值得关注的进展，留在你的视野里。",
  paper:"把值得精读的论文，整理成有据可查的研究线索。",
  memo:"给一闪而过的想法，一个安静的落点。",
  todo:"把想做的事，一件一件变成已完成。",
};
