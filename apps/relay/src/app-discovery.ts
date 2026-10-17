import { z } from "zod";
import { APP_PROVIDERS, APP_CATEGORIES, type AppEnv } from "./app-catalog.js";
import { listApps } from "./apps.js";
export const appDiscoverySchema=z.object({provider:z.enum(APP_PROVIDERS).optional(),category:z.enum(APP_CATEGORIES.map(c=>c.id) as [string,...string[]]).optional(),query:z.string().max(100).optional(),limit:z.number().int().min(1).max(25).default(12),cursor:z.number().int().min(0).max(10000).default(0)}).strict();
export async function discoverApps(env:AppEnv,userId:string,raw:unknown={}){
 const input=appDiscoverySchema.parse(raw),all=await listApps(env,userId),query=input.query?.trim().toLowerCase();
 const filtered=all.apps.filter(app=>(!input.provider||app.provider===input.provider)&&(!input.category||app.category===input.category)&&(!query||[app.name,app.provider,app.category].some(v=>v?.toLowerCase().includes(query))));
 const page=filtered.slice(input.cursor,input.cursor+input.limit),ids=new Set(page.map(a=>a.provider));
 return{enabled:all.enabled,categories:APP_CATEGORIES,total:filtered.length,nextCursor:input.cursor+page.length<filtered.length?input.cursor+page.length:null,
 apps:page.map(({operations,...app})=>({...app,operationCount:operations.length,...(input.provider?{operations}:{})})),
 connections:all.connections.filter(c=>ids.has(c.provider)),guidance:"Choose a provider to load its operation schemas. Connect Apps works without Arc Agent. Provider usage may incur charges on the connected account or API project."};
}
