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
  preview?:boolean;
  work?:{deviceOperations:number;stateChecks:number;apps:{total:number;succeeded:number;failed:number;unknown:number};arc:{total:number;succeeded:number;failed:number;unknown:number};completedGoals:null;retries:null};
  cost?:{currency:string;modelCostMicros:number|null;settledRequests:number;unresolvedRequests:number;cloudCostMicros:null;totalCostMicros:null;basis:string};
};
const fmt = (v:number) => v.toLocaleString();

export function AdminUserUsageInsights({userId,used,allowance,extra}:{userId:string;used:number;allowance:number|null;extra:number}){
  const {tr}=useI18n();
  const [data,setData]=useState<Insight|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    setData(null);setError("");setLoading(true);
    void fetch("/api/admin/usage-insights?userId="+encodeURIComponent(userId),{credentials:"same-origin",cache:"no-store"})
      .then(async r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json() as Promise<Insight>;})
      .then(value=>{if(!cancelled)setData(value);})
      .catch(e=>{if(!cancelled)setError(String(e));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[userId,revision]);
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
      <div className="usageInsightTopActions">{data?.preview&&<span className="usageInsightPreview">{tr('Sample data','示例数据')}</span>}{allowance!==null&&<span className={"usageInsightStatus "+(pct>=100?"isMax":pct>=80?"isHigh":"")}>{pct>=100?tr("Limit reached","额度已满"):pct>=80?tr("Near limit","接近上限"):tr("Within budget","额度正常")}</span>}<button type="button" disabled={loading} onClick={()=>setRevision(value=>value+1)}>{tr('Refresh diagnostics','刷新诊断')}</button></div>
    </div>
    {data&&<div className="usageQualityGrid">
      {data.preview&&<p className="usageQualityPreviewNote">{tr('Preview with sample data — these figures do not describe a real customer.','示例数据预览 · 以下数字不代表任何真实用户。')}</p>}
      <section className="usageQualityPane" aria-label={tr('Work delivered','有效工作量')}>
        <header><h4>{tr('Work delivered','有效工作量')}</h4><span>{tr('Recorded outcomes','已记录结果')}</span></header>
        <div className="usageQualityHeadline"><strong>{data.work?fmt(data.work.deviceOperations+data.work.apps.succeeded):'—'}</strong><span>{tr('successful operations','次成功业务操作')}</span></div>
        <p>{tr('Successful device and App operations, excluding status/wait tools.','设备与 App 成功操作，排除状态／等待类工具。')}</p>
        <dl>
          <div><dt>{tr('Device / App successes','设备 / App 成功')}</dt><dd>{data.work?fmt(data.work.deviceOperations)+' / '+fmt(data.work.apps.succeeded):'—'}</dd></div>
          <div><dt>{tr('Successful Arc runs','成功 Arc 运行')}</dt><dd>{data.work?fmt(data.work.arc.succeeded):'—'}<small>{data.work?tr('of '+fmt(data.work.arc.total)+' started','共发起 '+fmt(data.work.arc.total)+' 次'):''}</small></dd></div>
          <div><dt>{tr('Status / wait calls','状态／等待类调用')}</dt><dd>{data.work?fmt(data.work.stateChecks):'—'}<small>{data.work&&data.audited.total?((data.work.stateChecks/data.audited.total)*100).toFixed(1)+'% '+tr('of audited device calls','审计内设备调用'):''}</small></dd></div>
          <div><dt>{tr('Failed dispatches / App calls','设备派发 / App 失败')}</dt><dd>{data.work?fmt(data.audited.failed)+' / '+fmt(data.work.apps.failed):'—'}</dd></div>
          <div><dt>{tr('Retries / completed user goals','重复重试 / 用户目标完成')}</dt><dd className="usageQualityUnknown">{tr('Not tracked reliably','尚未可靠追踪')}</dd></div>
        </dl>
      </section>
      <section className="usageQualityPane" aria-label={tr('Cost visibility','成本归因')}>
        <header><h4>{tr('Cost visibility','成本归因')}</h4><span>{tr('USD · partial','USD · 部分成本')}</span></header>
        <div className="usageQualityHeadline"><strong>{data.cost?.modelCostMicros===null||data.cost?.modelCostMicros===undefined?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4}).format(data.cost.modelCostMicros/1_000_000)}</strong><span>{tr('recorded Arc model cost','已记录 Arc 模型成本')}</span></div>
        <p>{tr('Calculated from recorded usage and model prices; not a cloud invoice.','按已记录用量与模型单价核算，不等于云服务账单。')}</p>
        <dl>
          <div><dt>{tr('Settled model requests','已有成本核算的模型请求')}</dt><dd>{data.cost?fmt(data.cost.settledRequests):'—'}</dd></div>
          <div><dt>{tr('Unresolved model requests','成本待确认的模型请求')}</dt><dd>{data.cost?fmt(data.cost.unresolvedRequests):'—'}</dd></div>
          <div><dt>Workers / D1 / R2 / Relay</dt><dd className="usageQualityUnknown">{tr('Not attributed per user','尚未按用户归因')}</dd></div>
          <div><dt>{tr('External AI client cost','外部 AI 客户端成本')}</dt><dd className="usageQualityUnknown">{tr('Outside this ledger','不在本账本内')}</dd></div>
          <div><dt>{tr('Total cost / margin','总成本 / 毛利')}</dt><dd className="usageQualityUnknown">{tr('Incomplete coverage','覆盖不足，暂不计算')}</dd></div>
        </dl>
      </section>
    </div>}
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
      "Recorded operations and successful Arc runs do not prove an entire user goal was completed. Status/wait calls are a tool category, not proof of waste or retries. Summaries cover records started this UTC month and their current state; retained metadata may be incomplete. Missing cost is unknown, not zero.",
      "成功操作或 Arc 运行不代表整个用户目标已完成。状态／等待是工具分类，不等于浪费或重试。按本 UTC 月发起的记录及当前状态统计，保留的元数据可能不完整。缺失成本表示未知，不是零。"
    )}</p>
  </section>;
}
