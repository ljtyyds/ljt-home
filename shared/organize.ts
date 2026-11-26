import type { Entry } from "./types";
export type PublicKind="bookmark"|"article";
export type Acquisition={status:"ok"|"partial"|"blocked"|"failed";source:"provided"|"saved"|"web"|"image";message:string};
export type OrganizedDraft={suggestion:{kind:PublicKind;url:string;title:string;description:string;content:string;categoryId:string;tags:string[];source:string};acquisition:Acquisition;metadataRead:boolean;needsContent:boolean;existing?:Entry};
export function messageLinks(text:string){return [...new Set((text.match(/https?:\/\/[^\s<>"'，。；！？）】]+/gi)||[]).map(value=>value.replace(/[),.;!?\]]+$/,"")))];}
