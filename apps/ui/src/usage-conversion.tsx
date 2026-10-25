import React from "react";
import { useI18n } from "./i18n.js";
import "./usage-conversion.css";
type Usage={month:string;used:number;limit:number|null;remaining:number|null;unlimited:boolean};
export function UsageConversionBanner({usage,onManagePlan,pricingUrl}:{usage:Usage|null|undefined;onManagePlan:()=>void;pricingUrl:string}){
 const {tr,locale}=useI18n();
 if(!usage||usage.unlimited||!usage.limit||usage.used/usage.limit<.8)return null;
 const ratio=Math.min(1,usage.used/usage.limit),ended=ratio>=1;
 const remaining=Math.max(0,usage.limit-usage.used);
 const [y,m]=usage.month.split("-").map(Number);
 const reset=new Date(Date.UTC(y ?? 2026,m ?? 1,1));
 const resetText=Number.isNaN(reset.getTime())?"—":new Intl.DateTimeFormat(locale==="zh"?"zh-CN":"en-NZ",{timeZone:"UTC",month:"short",day:"numeric"}).format(reset);
 return <section className={"usageConversion "+(ended?"usageConversionMax":"")} aria-label={tr("Monthly Connect allowance","每月 Connect 调用额度")}>
   <div className="usageConversionCopy"><span className="usageConversionKicker"><i/>{tr("CONNECT · MONTHLY ALLOWANCE","CONNECT · 本月调用额度")}</span>
    <h2>{ended?tr("Your monthly calls are used up","本月调用额度已用完"):tr("You're getting close to your monthly limit","本月额度即将用完")}</h2>
    <p>{ended?tr("New metered Connect calls pause until your allowance renews or your plan changes.","新的计量 Connect 调用将暂停，直到月度额度重置或套餐发生变更。"):tr("Your existing connections stay paired. Plan ahead so your next workflow isn't interrupted.","现有设备连接保持配对。提前安排额度，避免下次工作流程中断。")}</p>
    <div className="usageConversionActions">
      <button type="button" className="usageConversionPrimary" onClick={onManagePlan}>{tr("View plans & usage","查看套餐与用量")} <span aria-hidden="true">↗</span></button>
      <a href={pricingUrl}>{tr("Compare plans","比较套餐")} <span aria-hidden="true">→</span></a>
    </div>
   </div>
   <div className="usageConversionPanel">
     <div className="usageConversionPanelTop"><span>{tr("Used this month","本月已使用")}</span><strong>{Math.round(ratio*100)}%</strong></div>
     <div className="usageConversionNumbers"><strong>{usage.used.toLocaleString()}</strong><span> / {usage.limit.toLocaleString()}</span></div>
     <div className="usageConversionTrack" role="progressbar" aria-label={tr("Monthly allowance used","月度额度使用情况")} aria-valuemin={0} aria-valuemax={usage.limit} aria-valuenow={Math.min(usage.used,usage.limit)}><i style={{width:ratio*100+"%"}}/></div>
     <div className="usageConversionPanelBottom"><span>{ended?tr("No calls remaining","剩余额度为 0"):remaining.toLocaleString()+" "+tr("calls remaining","次剩余额度")}</span><span>{tr("Resets","重置于")} {resetText} UTC</span></div>
   </div>
 </section>;
}
