export const pageScaleValues=[80,90,100,110,120] as const;
export const pageScaleStorageKey="ljt-page-scale-v1";
export function validPageScale(value:unknown){const n=typeof value==="string"&&value.trim()?Number(value):value;return typeof n==="number"&&pageScaleValues.some(v=>v===n)?n:100;}

// Run before hydration so re-opening the page keeps the saved scale without a layout jump.
export const pageScaleInitScript="(function(){try{var n=Number(localStorage.getItem('"+pageScaleStorageKey+"'));if("+JSON.stringify(pageScaleValues)+".indexOf(n)<0)n=100;var d=document.documentElement;d.style.zoom=String(n/100);d.style.setProperty('--page-scale',String(n/100));d.dataset.pageScale=String(n);}catch(e){}})();";
