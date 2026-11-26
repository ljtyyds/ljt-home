import {z} from "zod";
const referenceUrl=z.string().max(2000).refine(v=>{if(!v)return true;try{const u=new URL(v);return["http:","https:"].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}},"来源须为 HTTP / HTTPS 链接");
const year=z.string().max(4).refine(v=>!v||/^(19|20)\d{2}$/.test(v),"年份应为四位数字");
export const paperMetric=z.object({value:z.string().trim().max(100),year,sourceUrl:referenceUrl,evidence:z.string().max(1000)}).strict();
export const paperMetadata=z.object({
 authors:z.array(z.string().trim().min(1).max(160)).max(200),venue:z.string().max(500),venueType:z.enum(["journal","conference","preprint","unknown"]),year,
 doi:z.string().max(500).refine(v=>!v||/^10\.\d{4,9}\/[^\s?#]+$/i.test(v),"DOI 格式不正确"),field:z.string().max(200),sciScheme:z.enum(["JCR","中科院","unknown"]),
 sci:paperMetric,ccf:paperMetric.refine(v=>!v.value||/^[ABC]$/.test(v.value),"CCF 等级应为 A、B 或 C"),
 impactFactor:paperMetric.refine(v=>!v.value||/^\d{1,3}(?:\.\d{1,3})?$/.test(v.value),"影响因子须为非负数值"),
 metadataSource:z.string().max(200),metadataUrl:referenceUrl,
 fileName:z.string().max(200).optional(),fileHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
