import {useI18n} from './i18n.js';
import './landing-demo-result.css';
export function DemoResultCard({id}:{id:string}){
 const {tr}=useI18n();
 const files:Record<string,{type:string;name:string;meta:string}>={
  code:{type:'TS',name:'formatter.ts',meta:tr('1 file changed · 24 checks passed','修改 1 个文件 · 24 项检查通过')},
  release:{type:'DEPLOY',name:tr('Release review','发布核对'),meta:tr('4 merged PRs · 1 preview needs attention','4 个合并 PR · 1 个预览需处理')},
  knowledge:{type:'DOC',name:tr('Launch decisions & next steps','发布决策与下一步'),meta:tr('Notion page · Drive source included','Notion 页面 · 附 Drive 来源')},
  slides:{type:'PPT',name:'review.pptx',meta:tr('12 slides · editable presentation','12 页 · 可编辑演示文稿')},
  excel:{type:'XLS',name:'summary.xlsx',meta:tr('Monthly summary · totals reconciled','月度汇总 · 合计已核对')},
  report:{type:'CSV',name:'export.csv',meta:tr('Export complete · file verified','导出完成 · 已核对文件')},
  mail:{type:'MAIL',name:'Re: Launch',meta:tr('Reply draft · not sent','回复草稿 · 未发送')},
  calendar:{type:'EVENT',name:tr('Project review','项目评审'),meta:tr('10:00–10:30 · no conflicts','10:00–10:30 · 无时间冲突')},
  schedule:{type:'TASK',name:tr('Service health check','服务健康检查'),meta:tr('Scheduled · read-only checks','已安排 · 只读检查')},
  inspect:{type:'LOG',name:'service-diagnostics.log',meta:tr('Connection timeouts · no changes made','连接超时 · 未修改服务')},
 };
 const file=files[id];if(!file)return null;
 return <details className="homeDemoResult" data-kind={file.type}>
  <summary aria-label={tr('Preview result: ','预览结果：')+file.name}><span className="homeDemoResultType">{file.type}</span><span className="homeDemoResultInfo"><span>{tr('EXAMPLE RESULT','示例结果')}</span><strong>{file.name}</strong><small>{file.meta}</small></span><span className="homeDemoResultOpen">{tr('Preview','预览')} <span aria-hidden="true">↗</span></span></summary>
  <div className="homeDemoResultPreview">
   {id==='code'?<><div className="homeDemoResultPreviewBar"><span>{tr('Code changes','代码修改')}</span><span>+2 −1</span></div><pre className="homeDemoDiff"><span className="removed">- return value.toString();</span>{'\n'}<span className="added">+ if (value == null) return '';</span>{'\n'}<span className="added">+ return String(value);</span></pre><p className="homeDemoResultCheck">✓ {tr('24 checks passed · local Undo available','24 项检查通过 · 支持本地 Undo')}</p></>:
   id==='slides'?<div className="homeDemoSlidePreviews">{[tr('Quarterly review','季度复盘'),tr('Progress & results','进展与成果'),tr('What comes next','下一步工作')].map((title,index)=><article key={title}><span>0{index+1}</span><strong>{title}</strong><i/><i/><small>REMOTE ARC · {tr('SAMPLE','示例')}</small></article>)}</div>:
   id==='excel'||id==='report'?<div className="homeDemoResultSheet"><table><thead><tr><th>{tr('Month','月份')}</th><th>{tr('Revenue','收入')}</th><th>{tr('Costs','成本')}</th><th>{tr('Net','净额')}</th></tr></thead><tbody><tr><td>Apr</td><td>12,500</td><td>7,800</td><td>4,700</td></tr><tr><td>May</td><td>14,800</td><td>9,100</td><td>5,700</td></tr><tr><th>{tr('Total','合计')}</th><td>27,300</td><td>16,900</td><td>10,400</td></tr></tbody></table></div>:
   id==='release'?<div className="homeDemoReleaseRows"><div><span>Production</span><b>READY</b></div><div><span>{tr('Latest preview','最新预览')}</span><b className="needsAttention">{tr('Needs attention','需要处理')}</b></div><p>{tr('Review the failing preview before sharing the release. A summary with source links is prepared for #product.','分享发布前先检查失败的预览。已为 #product 整理附有来源链接的摘要。')}</p></div>:
   id==='knowledge'?<article className="homeDemoResultDocument"><small>DRIVE → NOTION</small><h4>{tr('Launch decisions','发布决策')}</h4><p>{tr('Ship the approved release after preview checks pass.','预览检查通过后，发布已批准的版本。')}</p><h4>{tr('Next steps','下一步')}</h4><ol><li>{tr('Investigate the failing preview.','排查失败的预览。')}</li><li>{tr('Review the launch checklist.','核对上线清单。')}</li></ol><footer>{tr('Source: Drive · Launch brief','来源：Drive · 发布资料')}</footer></article>:
   id==='mail'?<article className="homeDemoResultDocument"><small>{tr('EMAIL DRAFT · NOT SENT','邮件草稿 · 未发送')}</small><h4>Re: Launch</h4><p>{tr('Thanks for the update. I’ve reviewed the launch discussion and outlined the remaining checks below.','谢谢更新。我已阅读发布讨论，并在下方整理剩余检查事项。')}</p><p>{tr('Please confirm the preview status and the release owner before we proceed.','请在继续前确认预览状态与发布负责人。')}</p></article>:
   id==='calendar'?<article className="homeDemoResultEvent"><span>10:00</span><div><strong>{tr('Project review','项目评审')}</strong><p>10:00–10:30 · {tr('30 minutes','30 分钟')}</p><small>{tr('Both calendars checked','已核对两个日历')}</small></div></article>:
   id==='schedule'?<article className="homeDemoResultDocument"><small>{tr('SCHEDULED TASK','定时任务')}</small><h4>{tr('Service health check','服务健康检查')}</h4><p>{tr('Collect the current service status and recent logs. Leave the service running.','采集当前服务状态与最近日志，保持服务运行。')}</p><footer>{tr('Status only · no restart','仅检查状态 · 不重启服务')}</footer></article>:
   <pre className="homeDemoDiagnostic">{'10:02  connection timeout\n10:03  retry limit reached\n10:04  read-only inspection complete'}</pre>}
   <span className="homeDemoResultDisclosure">{tr('Sample preview from this guided demo.','本次引导演示中的示例预览。')}</span>
  </div>
 </details>;
}
