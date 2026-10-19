import { useEffect, useState } from 'react';
import { arcRequest } from './use-arc-chat.js';
import { ProductIcon as Icon } from './product-icon.js';
import './arc-home-brief.css';

type Work = { id: string; name: string; kind: 'task' | 'routine'; status: string };
type Run = { id: string; title?: string; status: string; session_id: string; automation_id: string | null };
type Brief = { work: Work[]; runs: Run[] };
type Props = {
  enabled: boolean; onlineDevices: number; totalDevices: number;
  tr: (en: string, zh: string) => string;
  onTasks: () => void; onRoutines: () => void; onDevices: () => void;
  onReview: (prompt: string, sessionId?: string) => void;
};
const needsAttention = (status: string) => ['failed', 'unknown', 'paused'].includes(status);
const ongoing = (status: string) => ['queued', 'thinking', 'working', 'running', 'waiting'].includes(status);

export function ArcHomeBrief({ enabled, onlineDevices, totalDevices, tr, onTasks, onRoutines, onDevices, onReview }: Props) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setError(false);
    void arcRequest<Brief>('work', undefined, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(value.work) || !Array.isArray(value.runs)) throw new Error('CHAT_UNAVAILABLE');
      setBrief(value);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [enabled, revision]);
  if (!enabled) return null;
  if (error) return <div className="arcHomeBriefStatus" role="status"><span>{tr('Your work summary is temporarily unavailable.', '暂时无法加载工作摘要。')}</span><button type="button" onClick={() => setRevision(value => value + 1)}>{tr('Try again', '重试')}</button></div>;
  if (!brief) return <div className="arcHomeBriefStatus" role="status">{tr('Checking what needs your attention…', '正在整理需要你关注的工作…')}</div>;
  const workAttention = brief.work.filter(item => needsAttention(item.status));
  const workIds = new Set(brief.work.map(item => item.id));
  const latestRuns = new Map<string, Run>();
  for (const run of brief.runs) if (!latestRuns.has(run.session_id)) latestRuns.set(run.session_id, run);
  const runAttention = [...latestRuns.values()].filter(run => needsAttention(run.status) && (!run.automation_id || !workIds.has(run.automation_id)));
  const attentionCount = workAttention.length + runAttention.length;
  const offline = Math.max(0, totalDevices - onlineDevices);
  return <section className="arcHomeBrief" aria-label={tr('Your work at a glance', '工作概览')}>
    <div className="arcHomeMetrics">
      <button type="button" onClick={onTasks}><Icon name="tasks" size={16}/><span>{tr('Active tasks', '进行中的任务')}</span><strong>{brief.work.filter(item => item.kind === 'task' && ongoing(item.status)).length}</strong></button>
      <button type="button" onClick={onRoutines}><Icon name="routine" size={16}/><span>{tr('Scheduled routines', '已安排的 Routine')}</span><strong>{brief.work.filter(item => item.kind === 'routine' && ongoing(item.status)).length}</strong></button>
      <button type="button" onClick={onDevices}><Icon name="device" size={16}/><span>{tr('Computers online', '在线电脑')}</span><strong>{onlineDevices}<small> / {totalDevices}</small></strong></button>
    </div>
    {(attentionCount > 0 || offline > 0) && <div className="arcHomeAttention">
      <header><Icon name="inbox" size={15}/><strong>{tr('Pick up where you left off', '接着处理这些事')}</strong><span>{attentionCount + (offline ? 1 : 0)}</span></header>
      {workAttention.slice(0, 3).map(item => <button type="button" key={item.id} onClick={() => onReview(tr(`Review my ${item.kind} "${item.name}" (ID ${item.id}). Read its current status and results before proposing the next step.`, `检查“${item.name}”（ID ${item.id}）的当前状态与结果，再建议下一步。`))}><Icon name={item.kind === 'routine' ? 'routine' : 'tasks'} size={16}/><span><strong>{item.name}</strong><small>{item.status === 'unknown' ? tr('Check the result before repeating this work', '先核实结果，再决定是否重试') : item.status === 'paused' ? tr('Paused · review before continuing', '已暂停 · 检查后再继续') : tr('Needs your attention', '需要关注')}</small></span><Icon name="arrowUpRight" size={14}/></button>)}
      {runAttention.slice(0, Math.max(0, 3 - workAttention.length)).map(run => <button type="button" key={run.id} onClick={() => onReview(tr('Review the last run and its actual results before continuing.', '先检查上次执行及实际结果，再继续处理。'), run.session_id)}><Icon name="history" size={16}/><span><strong>{run.title || tr('A conversation to revisit', '待继续的对话')}</strong><small>{run.status === 'unknown' ? tr('The last action needs verification', '上次操作的结果需要核实') : tr('Review the last run', '检查上次执行')}</small></span><Icon name="arrowUpRight" size={14}/></button>)}
      {offline > 0 && <button type="button" onClick={onDevices}><Icon name="device" size={16}/><span><strong>{tr(`${offline} computer${offline === 1 ? '' : 's'} offline`, `${offline} 台电脑离线`)}</strong><small>{tr('Computer work needs an available device', '电脑上的工作需要设备在线')}</small></span><Icon name="arrowUpRight" size={14}/></button>}
    </div>}
  </section>;
}
