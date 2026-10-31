import {useState} from 'react';
import {percent,retentionState,type Analytics,type Translate} from './admin-events-model.js';

export function GrowthChart({data,tr}:{data:Analytics|null;tr:Translate}) {
 const [metric,setMetric]=useState<'activeUsers'|'payingUsers'>('activeUsers');
 const rows=data?.trend||[],maximum=Math.max(1,...rows.flatMap(row=>[row.newUsers,row[metric]]));
 const width=760,height=210,left=34,top=16,plotWidth=width-52,plotHeight=height-54;
 const point=(value:number,index:number)=>[left+(rows.length>1?index/(rows.length-1):.5)*plotWidth,top+plotHeight-value/maximum*plotHeight];
 return <section className="businessPanel businessGrowth">
  <header><div><h2>{tr('Are more people coming back?','用户有没有增长、有没有回来？')}</h2><p>{tr('Daily registrations and real product activity.','按天看新注册和真实使用的变化。')}</p></div><select aria-label={tr('Trend metric','趋势指标')} value={metric} onChange={event=>setMetric(event.target.value as typeof metric)}><option value="activeUsers">{tr('Active users','活跃用户')}</option><option value="payingUsers">{tr('Paying users','付费用户')}</option></select></header>
  {data?<><div className="businessLegend"><span data-series="new">{tr('New users','新增用户')}</span><span data-series="active">{metric==='activeUsers'?tr('Recorded active users','有记录的活跃用户'):tr('Verified paying users','已确认付费用户')}</span></div>
   <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={tr('Daily user trend; exact values in the table below','每日用户趋势，准确数值可在下方表格查看')}>
    {[0,.5,1].map(fraction=><g key={fraction}><line x1={left} x2={width-18} y1={top+plotHeight*fraction} y2={top+plotHeight*fraction} className="businessGridline"/><text x={left-10} y={top+plotHeight*fraction+4} textAnchor="end">{Math.round(maximum*(1-fraction))}</text></g>)}
    <polyline points={rows.map((row,i)=>point(row[metric],i).join(',')).join(' ')} className="businessLine businessLineActive"/><polyline points={rows.map((row,i)=>point(row.newUsers,i).join(',')).join(' ')} className="businessLine businessLineNew"/>
    {rows.map((row,i)=><g key={row.day}><circle cx={point(row.newUsers,i)[0]} cy={point(row.newUsers,i)[1]} r="3" className="businessPoint"><title>{row.day}: {row.newUsers} / {row[metric]}</title></circle>{(i===0||i===rows.length-1||i%Math.ceil(rows.length/5)===0)&&<text x={point(0,i)[0]} y={height-8} textAnchor="middle">{row.day.slice(5)}</text>}</g>)}
   </svg><details className="businessSource"><summary>{tr('Daily figures','查看每日数值')}</summary><div className="businessTableScroll"><table><thead><tr><th>{tr('Date · UTC','日期 · UTC')}</th><th>{tr('New','新增')}</th><th>{tr('Recorded active','有记录的活跃')}</th><th>{tr('Paid','已付费')}</th></tr></thead><tbody>{rows.map(row=><tr key={row.day}><td>{row.day}</td><td>{row.newUsers}</td><td>{row.activeUsers}</td><td>{row.payingUsers}</td></tr>)}</tbody></table></div></details>
  </>:<div className="businessChartEmpty">{tr('Real user trends appear after data loads.','读取真实数据后显示用户趋势。')}</div>}
 </section>;
}

export function RetentionPanel({data,tr}:{data:Analytics|null;tr:Translate}) {
 const [page,setPage]=useState(0),cohorts=data?.cohorts||[],rows=cohorts.slice(page*7,page*7+7);
 return <section className="businessPanel businessRetention">
  <header><div><h2>{tr('Do new users stay?','新用户留下来了吗？')}</h2><p>{tr('Registration cohorts over 60 days. Returns on the exact next, 7th and 30th day.','最近 60 天注册的用户，在注册后的第 1、7、30 天是否再次使用。')}</p></div><span className="businessTag">{tr('Registration cohorts','按注册批次')}</span></header>
  <div className="businessRetentionSummary">{[1,7,30].map(day=>{const cell=data?.retention.find(item=>item.day===day);return <article key={day}><span>{day===1?tr('Next-day retention','次日留存'):day+tr('-day retention',' 日留存')}</span><strong>{percent(cell?.rate)}</strong><small>{cell?.status==='ready'?`${cell.returned} / ${cell.eligible} `+tr('eligible users returned','位到期用户回访'):retentionState(cell,tr)}</small></article>;})}</div>
  <div className="businessTableScroll"><table className="businessCohorts"><thead><tr><th>{tr('Registered','注册日期')}</th><th>{tr('New users','注册人数')}</th><th>{tr('Day 1','次日')}</th><th>{tr('Day 7','第 7 天')}</th><th>{tr('Day 30','第 30 天')}</th></tr></thead><tbody>{rows.map(row=><tr key={row.day}><th scope="row">{row.day.slice(5)}</th><td>{row.users}</td>{row.cells.map(cell=><td key={cell.day} data-state={cell.status} style={cell.rate===null?undefined:{background:`color-mix(in srgb,var(--business-teal) ${Math.round(cell.rate*24)}%,transparent)`}}><strong>{cell.status==='ready'?percent(cell.rate):retentionState(cell,tr)}</strong><small>{cell.status==='ready'?`${cell.returned} / ${cell.eligible}`:cell.returned?cell.returned+tr(' returns recorded',' 人有回访记录'):'—'}</small></td>)}</tr>)}</tbody></table></div>
  {!cohorts.length&&<p className="businessNoCohort">{data?tr('No new users registered in these cohorts.','这些注册批次中暂无用户。'):tr('Waiting for real registration cohorts.','等待真实注册批次数据。')}</p>}
  {cohorts.length>7&&<div className="businessPager"><span>{page*7+1}–{Math.min(page*7+7,cohorts.length)} / {cohorts.length} {tr('cohorts','个注册批次')}</span><button disabled={!page} onClick={()=>setPage(value=>value-1)}>{tr('Newer','较新批次')}</button><button disabled={(page+1)*7>=cohorts.length} onClick={()=>setPage(value=>value+1)}>{tr('Older','较早批次')}</button></div>}
  <p className="businessFootnote">{tr('Only fully observed return days enter the rate. Future days are still observing; days before complete collection are not treated as lost users. UTC dates.','只用已完整观察的批次计算留存率。尚未到期显示“观察中”，历史未采集不当作用户流失。日期按 UTC。')}</p>
 </section>;
}
