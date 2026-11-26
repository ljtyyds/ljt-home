import {kinds,type Kind,type Category} from "./types";
export type CategoryCatalog=Record<Kind,Category[]>;
export const publicCategoryKinds=["bookmark","article","paper"] as const;
export function categoryCatalogFrom(categories:Category[]=[]):CategoryCatalog{return Object.fromEntries(kinds.map(kind=>[kind,categories])) as CategoryCatalog;}
