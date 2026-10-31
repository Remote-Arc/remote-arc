import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../app/i18n.js";
import "./user-usage-insights.css";

type Insight = {
  month: string; timeZone: string; chargedCalls: number;
  audited: {total:number;succeeded:number;failed:number};
  daily: {day:string;calls:number;failures:number}[];
  tools: {tool:string;calls:number;failures:number}[];
  outcomes: {outcome:string;calls:number}[];
  taskSuccessAvailable:boolean;retriesAvailable:boolean;
};
const fmt = (v:number) => v.toLocaleString();

export function AdminUserUsageInsights({userId,used,allowance,extra}:{userId:string;used:number;allowance:number|null;extra:number}){
  const {tr}=useI18n();
  const [data,setData]=useState<Insight|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    setData(null);setError("");setLoading(true);
    void fetch("/api/admin/usage-insights?userId="+encodeURIComponent(userId),{credentials:"same-origin",cache:"no-store"})
      .then(async r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json() as Promise<Insight>;})
      .then(value=>{if(!cancelled)setData(value);})
      .catch(e=>{if(!cancelled)setError(String(e));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[userId]);
  const pct=allowance===null?0:Math.min(100,used/Math.max(1,allowance)*100);
  const highest=Math.max(1,...(data?.daily||[]).map(day=>day.calls));
  const maxTool=Math.max(1,...(data?.tools||[]).map(tool=>tool.calls));
  const days=useMemo(()=>{
    if(!data)return [];
    const lookup=new Map(data.daily.map(item=>[item.day,item]));
    const today=new Date().toISOString().slice(0,10);
    const year=Number(data.month.slice(0,4)),month=Number(data.month.slice(5,7));
    const numberOfDays=new Date(Date.UTC(year,month,0)).getUTCDate();
    const lastDay=today.startsWith(data.month)?Number(today.slice(-2)):numberOfDays;
    return Array.from({length:lastDay},(_,idx)=>{
      const day=data.month+"-"+String(idx+1).padStart(2,"0");
      return {day,calls:lookup.get(day)?.calls||0,failures:lookup.get(day)?.failures||0};
    });
  },[data]);
  return <section className="usageInsight" aria-label={tr("Usage diagnostics","调用诊断")}>
    <div className="usageInsightTop">
      <div><span className="usageInsightEyebrow">{tr("USAGE INTELLIGENCE","用量洞察")} · {data?.month||tr("Current month","本月")}</span>
        <h3>{tr("Where the calls went","调用消耗在哪里")}</h3>
        <p>{tr("Privacy-safe metadata only. No device files, conversation text, or tool arguments.","只统计脱敏元数据，不读取设备文件、对话内容或工具参数。")}</p>
      </div>
      {allowance!==null&&<span className={"usageInsightStatus "+(pct>=100?"isMax":pct>=80?"isHigh":"")}>{pct>=100?tr("Limit reached","额度已满"):pct>=80?tr("Near limit","接近上限"):tr("Within budget","额度正常")}</span>}
    </div>
    <div className="usageInsightStats">
      <div><span>{tr("Metered Connect calls","本月计入额度的调用")}</span><strong>{fmt(used)}</strong><small>{allowance===null?tr("Unlimited allowance","无固定上限"):tr("of ","总额度 ")+fmt(allowance)}{extra>0?" · +"+fmt(extra)+" "+tr("granted","赠送"):""}</small></div>
      <div><span>{tr("Audited device calls","有审计记录的设备调用")}</span><strong>{data?fmt(data.audited.total):"—"}</strong><small>{tr("Subset of all charged calls","仅涵盖部分已计费调用")}</small></div>
      <div><span>{tr("Dispatch failures","设备派发失败")}</span><strong>{data?fmt(data.audited.failed):"—"}</strong><small>{tr("Not a task-failure rate","不是任务失败率")}</small></div>
    </div>
    {loading&&<div className="usageInsightEmpty" role="status">{tr("Loading usage metadata…","正在读取调用元数据…")}</div>}
    {error&&<div className="usageInsightEmpty" role="alert">{tr("Diagnostics unavailable. Account quota is still shown above.","诊断暂不可用，上方仍显示账户额度。")} · {error}</div>}
    {data&&<div className="usageInsightBody">
      <div className="usageInsightPane">
        <div className="usageInsightPaneTitle"><strong>{tr("Daily device dispatches","每日设备派发")}</strong><small>{tr("UTC · current month","UTC · 本月")}</small></div>
        {data.audited.total===0?<p className="usageInsightEmpty">{tr("No device dispatch audit rows this month.","本月没有设备派发审计记录。")}</p>:
        <div className="usageInsightChart" role="img" aria-label={tr("Daily audited device calls chart","每日设备调用量图")}>
          {days.map(day=><div key={day.day} className="usageInsightDay" title={day.day+" · "+day.calls+" "+tr("calls","次")+" · "+day.failures+" "+tr("failed","失败")}>
            <div className="usageInsightDayBar" style={{height:Math.max(day.calls?3:0,day.calls/highest*100)+"%"}}/>
            <small>{day.day.endsWith("-01")||Number(day.day.slice(-2))%5===0?Number(day.day.slice(-2)):""}</small>
          </div>)}
        </div>}
        <div className="usageInsightLegend"><span><i/>{tr("Audited device calls","设备调用")}</span><span>{tr("A call ≠ a completed task","一次调用 ≠ 一个完成任务")}</span></div>
      </div>
      <div className="usageInsightPane">
        <div className="usageInsightPaneTitle"><strong>{tr("Most-used device tools","高频设备工具")}</strong><small>{tr("Top 12","前 12 项")}</small></div>
        {data.tools.length===0?<p className="usageInsightEmpty">{tr("No tool metadata.","暂无工具调用记录。")}</p>:<div className="usageInsightTools">{data.tools.slice(0,8).map(tool=><div key={tool.tool} className="usageInsightTool">
          <div><span title={tool.tool}>{tool.tool}</span><strong>{fmt(tool.calls)}</strong></div>
          <div className="usageInsightToolTrack"><i style={{width:Math.max(2,tool.calls/maxTool*100)+"%"}}/></div>
          {tool.failures>0&&<small>{fmt(tool.failures)} {tr("failed dispatches","次派发失败")}</small>}
        </div>)}</div>}
      </div>
    </div>}
    <p className="usageInsightFoot"><strong>{tr("Measurement boundary","指标边界")}</strong> · {tr(
      "The monthly quota counts more than device dispatches (including Apps and Arc). Audit success only means the device dispatch returned successfully. Unique tasks, genuine user outcomes and retries are not reliably tracked yet.",
      "本月额度包含设备派发之外的调用（包括 Apps 与 Arc）。审计成功仅表示设备派发成功返回，暂不能准确统计唯一任务、实际任务完成和重试次数。"
    )}</p>
  </section>;
}
