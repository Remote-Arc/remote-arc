import {useEffect,useRef,useState} from 'react';
import {useI18n} from '../../../app/i18n.js';
import './request-volume.css';

// Traffic snapshot supplied by the owner, 2026-11-02. This is a projection,
// not a measured rolling month or a count of user tool calls/completed tasks.
export const REQUEST_TRAFFIC={daily:265_250,days:30,asOf:'2026-11-02'} as const;
const monthly=REQUEST_TRAFFIC.daily*REQUEST_TRAFFIC.days;
const countFormat=new Intl.NumberFormat('en-US');
const monthlyLabel=countFormat.format(monthly);

export function RequestVolume(){
  const {tr}=useI18n(),ref=useRef<HTMLElement>(null);
  const [count,setCount]=useState(0),[entered,setEntered]=useState(false);
  useEffect(()=>{
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,started=false,finished=false;
    const finish=()=>{finished=true;window.cancelAnimationFrame(frame);setCount(monthly);setEntered(true);};
    const start=()=>{
      if(started)return;started=true;setEntered(true);
      if(motion.matches){finish();return;}
      const at=performance.now();
      const tick=(time:number)=>{const progress=Math.min(1,(time-at)/3200);setCount(monthly*progress*progress*(3-2*progress));if(progress<1&&!finished)frame=requestAnimationFrame(tick);else finish();};
      frame=requestAnimationFrame(tick);
    };
    const preference=()=>{if(motion.matches)finish();};
    const visibility=()=>{if(document.hidden&&started)finish();};
    motion.addEventListener('change',preference);document.addEventListener('visibilitychange',visibility);
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){start();observer?.disconnect();}},{threshold:.25});
    if(motion.matches)finish();else if(observer&&ref.current)observer.observe(ref.current);else start();
    return()=>{finished=true;cancelAnimationFrame(frame);observer?.disconnect();motion.removeEventListener('change',preference);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  return <section ref={ref} className="homeRequestVolume" id="request-volume" data-entered={entered} data-monthly-estimate={monthly} aria-label={tr('Estimated monthly server requests','月度服务器请求量估算')}>
    <div className="requestVolumeIntro"><h2>{tr('Remote Arc serves','Remote Arc 承接')}</h2><p className="requestVolumeNote">{tr('30-day estimate · 265.25K / day · Nov 2, 2026','按日请求量估算 · 2026 年 11 月 2 日')}</p></div>
    <div className="requestVolumeMetric"><span className="requestVolumeAccessible">{tr(monthlyLabel+' server requests per month, estimated.','每月 '+monthlyLabel+' 次服务器请求，按日流量估算。')}</span><div className="requestVolumeNumber" aria-hidden="true"><span className="requestVolumeApprox">~</span><span data-request-count>{countFormat.format(Math.floor(count))}</span></div><span className="requestVolumeLabel">{tr('server requests / month','次服务器请求 / 月')}</span></div>
  </section>;
}
