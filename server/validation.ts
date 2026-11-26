import { z } from "zod";
import { kinds } from "@/shared/types";
import { paperMetadata } from "./paperValidation";
import {sortableKinds} from "@/shared/entryOrder";
const dateString=z.string().max(40).refine(v=>!v||!Number.isNaN(Date.parse(v)),"日期格式有误");
export const entryData=z.object({
 kind:z.enum(kinds),title:z.string().trim().min(1,"请填写标题").max(200),url:z.string().trim().max(2000),
 description:z.string().max(4000),content:z.string().max(50000),categoryId:z.string().max(60),
 tags:z.array(z.string().trim().min(1).max(30)).max(12).transform(v=>[...new Set(v)]),
 pinned:z.boolean(),visibility:z.enum(["public","private"]),published:z.boolean(),
 source:z.string().max(200),publishedAt:dateString,dueAt:dateString,
 priority:z.enum(["low","medium","high"]),status:z.enum(["todo","doing","done"]),relatedId:z.string().max(80),
 paper:paperMetadata.optional(),
}).strict().refine(v=>!["bookmark","article"].includes(v.kind)||!!v.url,"请填写网址").refine(v=>v.kind!=="paper"||!!v.paper,"请填写论文信息");
export const entryUpdate=z.object({id:z.string().min(1).max(80),revision:z.number().int().positive(),data:entryData}).strict();
export const entryOrderInput=z.object({kind:z.enum(sortableKinds),pinned:z.boolean(),id:z.string().min(1).max(80),targetId:z.string().min(1).max(80),position:z.enum(["before","after"]),version:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
