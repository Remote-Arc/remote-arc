import type {ReactNode} from 'react';
export type ProductIconName='add'|'search'|'apps'|'arrowUp'|'arrowUpRight'|'chat'|'check'|'trash'|'menu'|'history'|'close'|'device'|'spark'|'activity'|'settings'|'stop'|'chevron'|'link'|'tasks'|'logout'|'shield'|'overview'|'routine';
export function ProductIcon({name,size=18}:{name:ProductIconName;size?:number}){
 const paths:Record<ProductIconName,ReactNode>={
 add:<path d="M12 5v14M5 12h14"/>,search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
 apps:<><rect x="4" y="4" width="6" height="6" rx="1.3"/><rect x="14" y="4" width="6" height="6" rx="1.3"/><rect x="4" y="14" width="6" height="6" rx="1.3"/><rect x="14" y="14" width="6" height="6" rx="1.3"/></>,
 arrowUp:<path d="M12 19V5m-6 6 6-6 6 6"/>,arrowUpRight:<path d="M6 18 18 6M6 6h12v12"/>,chat:<path d="M20 11.5a8 8 0 0 1-8 8 8.5 8.5 0 0 1-4-.9L4 20l1.3-4a8 8 0 1 1 14.7-4.5Z"/>,
 check:<path d="m5 12 4 4L19 6"/>,trash:<><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7M10 11v5m4-5v5"/></>,menu:<path d="M4 6h16M4 12h16M4 18h16"/>,history:<><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></>,
 close:<path d="m6 6 12 12M18 6 6 18"/>,device:<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>,spark:<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z"/>,activity:<path d="M2 12h4l3-8 6 16 3-8h4"/>,
 settings:<><path d="m10 3-.5 2.3-2 .9-2-.9L3 9l1.6 1.7v2.6L3 15l2.5 3.7 2-.9 2 .9L10 21h4l.5-2.3 2-.9 2 .9L21 15l-1.6-1.7v-2.6L21 9l-2.5-3.7-2 .9-2-.9L14 3Z"/><circle cx="12" cy="12" r="3"/></>,stop:<rect x="6" y="6" width="12" height="12" rx="2"/>,chevron:<path d="m6 9 6 6 6-6"/>,link:<path d="M10 13a5 5 0 0 0 7 .5l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7-.5l-2 2a5 5 0 0 0 7 7l1-1"/>,
 tasks:<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m7 8 1.5 1.5L11 7M13 8h4m-10 7 1.5 1.5L11 14m2 1h4"/></>,logout:<path d="M9 4H5v16h4m6-12 4 4-4 4m-5-4h9"/>,shield:<><path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
 overview:<><rect x="4" y="4" width="6" height="6" rx="1.3"/><rect x="14" y="4" width="6" height="6" rx="1.3"/><rect x="4" y="14" width="6" height="6" rx="1.3"/><rect x="14" y="14" width="6" height="6" rx="1.3"/></>,routine:<path d="M4 8a8 8 0 0 1 14-3l2 2M20 3v4h-4M20 16a8 8 0 0 1-14 3l-2-2M4 21v-4h4"/>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-product-icon={name}>{paths[name]}</svg>;
}
