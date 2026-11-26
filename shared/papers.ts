export type PaperMetric={value:string;year:string;sourceUrl:string;evidence:string};
export type PaperMetadata={
 authors:string[];venue:string;venueType:"journal"|"conference"|"preprint"|"unknown";
 year:string;doi:string;field:string;sciScheme:"JCR"|"中科院"|"unknown";
 sci:PaperMetric;ccf:PaperMetric;impactFactor:PaperMetric;
 metadataSource:string;metadataUrl:string;
 fileName?:string;fileHash?:string;
};
export const metricLabels={sci:"SCI 分区",ccf:"CCF 等级",impactFactor:"影响因子"} as const;
export function emptyMetric():PaperMetric{return{value:"",year:"",sourceUrl:"",evidence:""};}
export function emptyPaper():PaperMetadata{return{authors:[],venue:"",venueType:"unknown",year:"",doi:"",field:"",sciScheme:"unknown",sci:emptyMetric(),ccf:emptyMetric(),impactFactor:emptyMetric(),metadataSource:"",metadataUrl:""};}
export function paperSearch(p?:PaperMetadata){return p?[...p.authors,p.venue,p.doi,p.field,p.year,p.sci.value,p.ccf.value].join(" "):"";}
/** Normalize equivalent DOI/arXiv references without following arbitrary redirects. */
export function paperReference(input:string):{url:string;doi?:string;arxiv?:string}|null{
 const value=input.trim().replace(/^doi:\s*/i,"");
 let doi=/^10\.\d{4,9}\/\S+$/i.test(value)?value:"";
 let url:URL|undefined;
 if(!doi){try{url=new URL(value);}catch{return null;}if(!["https:","http:"].includes(url.protocol)||url.username||url.password)return null;
 if(["doi.org","dx.doi.org"].includes(url.hostname.toLowerCase())){try{doi=decodeURIComponent(url.pathname.slice(1));}catch{return null;}}
 }
 if(doi){if(!/^10\.\d{4,9}\/[^\s?#]+$/i.test(doi)||doi.length>500)return null;doi=doi.toLowerCase();return{doi,url:"https://doi.org/"+doi};}
 if(!url)return null;
 if(/^(?:www\.|export\.)?arxiv\.org$/i.test(url.hostname)){
  const id=url.pathname.match(/^\/(?:abs|pdf|html)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}))(?:v\d+)?(?:\.pdf)?\/?$/i)?.[1];
  if(id)return{arxiv:id,url:"https://arxiv.org/abs/"+id};
 }
 url.hash="";return{url:url.toString()};
}
/** Imported files may have a verified source or DOI without an original URL. */
export function paperTitleUrl(entry:{url:string;paper?:PaperMetadata}):string{
 const direct=paperReference(entry.url);if(direct)return direct.url;
 const paper=entry.paper,doi=paperReference(paper?.doi||""),source=paperReference(paper?.metadataUrl||"");
 if(source){
  const url=new URL(source.url);
  // Crossref's API response is provenance; open the DOI landing page instead.
  if(url.hostname.toLowerCase()==="api.crossref.org"){
   try{const ref=paperReference(decodeURIComponent(url.pathname.replace(/^\/works\//,"")));if(ref?.doi)return ref.url;}catch{}
  }else return source.url;
 }
 return doi?.doi?doi.url:"";
}
