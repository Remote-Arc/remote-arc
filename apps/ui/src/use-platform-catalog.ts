import {useEffect,useState} from 'react';
export type PlatformCatalog={arcAvailable:boolean;billingAvailable:boolean;connectFreeCalls:number};
let current:PlatformCatalog|null=null,pending:Promise<PlatformCatalog>|null=null;
function load(){
 if(current)return Promise.resolve(current);
 if(!pending)pending=fetch('/api/billing/catalog',{credentials:'omit'}).then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(typeof value.arcAvailable!=='boolean'||typeof value.billingAvailable!=='boolean'||!Number.isSafeInteger(value.connectFreeCalls)||value.connectFreeCalls<1)throw Error();return current=value as PlatformCatalog;}).finally(()=>{pending=null;});
 return pending;
}
export function usePlatformCatalog(){
 const [catalog,setCatalog]=useState<PlatformCatalog|null>(current);
 useEffect(()=>{let active=true;load().then(value=>{if(active)setCatalog(value);}).catch(()=>{});return()=>{active=false;};},[]);
 return catalog;
}
