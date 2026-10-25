import React,{useEffect,useRef,useState} from 'react';
import {useI18n} from './i18n.js';
import {arcChatHref} from '../../../packages/docs/src/arc-use-cases.js';
import {MEDIA_DEMOS,MEDIA_CATEGORIES,mediaDemoPath,type MediaDemo,type MediaCategory} from '../../../packages/docs/src/media-gallery.js';
import './media-demo-gallery.css';
import './image-demo-gallery.css';

export function MediaDemoGallery(){
 const {tr,locale}=useI18n(),[filter,setFilter]=useState<MediaCategory|'all'>('all'),[language,setLanguage]=useState<'all'|'en'|'zh'>('all'),[selected,setSelected]=useState<MediaDemo|null>(null),[failed,setFailed]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null),opener=useRef<HTMLButtonElement|null>(null);
 const base=(import.meta.env.VITE_MEDIA_GALLERY_BASE_URL||'').replace(/\/$/,'');
 const src=(file:string)=>base+mediaDemoPath(file);
 const visible=MEDIA_DEMOS.filter(item=>(filter==='all'||item.category===filter)&&(language==='all'||item.language===language)).slice().sort((a,b)=>locale==='en'?Number(b.language==='en')-Number(a.language==='en'):0);
 useEffect(()=>{
  if(selected){setFailed(false);if(!dialog.current?.open)dialog.current?.showModal();}
  else if(dialog.current?.open){video.current?.pause();dialog.current.close();opener.current?.focus();}
 },[selected]);
 const close=()=>{video.current?.pause();setSelected(null);};
 const category=(value:MediaCategory)=>MEDIA_CATEGORIES.find(item=>item.id===value)![locale];
 const sound=(value:MediaDemo['audio'])=>value==='silent'?tr('Silent original','原版无声'):value==='narration'?tr('Narration & sound','解说与声音'):tr('Original score','原创配乐');
 return <section className="mediaDemoGallery" id="video-gallery" aria-labelledby="video-gallery-heading">
  <header className="mediaGalleryHeader">
   <div><span className="eyebrow">{tr('THE VIDEO GALLERY','视频作品画廊')}</span><h2 id="video-gallery-heading">{tr('A prompt. A real film.','一句想法，一支成片。')}</h2><p>{tr('Sports, science, products, data and places. Explore films made through Remote Arc on personal computers.','从运动、科普，到产品、数据与地图。看看 Remote Arc 在个人电脑上制作的真实作品。')}</p></div>
   <div className="mediaGalleryStamp"><strong>{String(MEDIA_DEMOS.length).padStart(2,'0')}</strong><span>{tr('REAL DEMOS','真实作品')}<br/>{tr('RENDERED LOCALLY','本地渲染')}</span></div>
  </header>
  <div className="mediaGalleryToolbar"><div className="mediaGalleryFilters" role="group" aria-label={tr('Filter video demos','筛选视频作品')}>
   <button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>{tr('All work','全部作品')}</button>
   {MEDIA_CATEGORIES.map(item=><button key={item.id} type="button" aria-pressed={filter===item.id} onClick={()=>setFilter(item.id)}>{item[locale]}</button>)}
  </div><span className="mediaGalleryCount" aria-live="polite">{visible.length} {tr('films','支作品')}</span></div>
  <div className="mediaGalleryLanguages" role="group" aria-label={tr('Video language','视频语言')}><span>{tr('Language','语言')}</span>{([{id:'all',en:'All languages',zh:'全部语言'},{id:'en',en:'English',zh:'英文'},{id:'zh',en:'Chinese',zh:'中文'}] as const).map(item=><button type="button" key={item.id} aria-pressed={language===item.id} onClick={()=>setLanguage(item.id)}>{item[locale]}</button>)}</div>
  {visible.length===0&&<p role="status">{tr('No films match these filters. Try another category or language.','当前筛选没有作品，请更换分类或语言。')}</p>}
  <div className="mediaGalleryGrid">
   {visible.map((item,index)=><article className="mediaDemoCard" key={item.id}>
    <button className="mediaDemoPreview" type="button" aria-label={tr('Play ','播放：')+item.title[locale]} onClick={event=>{opener.current=event.currentTarget;setSelected(item);}}>
     <img src={src(item.poster)} alt="" loading={index<3?'eager':'lazy'} decoding="async" width={item.width} height={item.height}/>
     <span className="mediaDemoPlay" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 5v14l11-7z"/></svg></span>
     <span className="mediaDemoLanguage">{item.language==='en'?'ENGLISH':'中文'}</span>
     <span className="mediaDemoDuration">{Math.round(item.duration)}s</span><span className="mediaDemoFormat">{item.width<item.height?'9:16':'16:9'}</span>
    </button>
    <div className="mediaDemoCopy"><div className="mediaDemoCategory">{category(item.category)}<span>{item.engine}</span></div><h3>{item.title[locale]}</h3><p>{item.description[locale]}</p><button type="button" className="mediaDemoTextPlay" onClick={event=>{opener.current=event.currentTarget;setSelected(item);}}>{tr('Watch film','观看作品')} <span aria-hidden="true">↗</span></button></div>
   </article>)}
  </div>
  <footer className="mediaGalleryFooter"><p>{tr('These are finished films made on personal computers. Connect your own computer to create; large voice or music model downloads are confirmed first.','展示的都是在个人电脑上制作的实际成片。连接自己的电脑即可创作；大型语音或音乐模型会在下载前确认。')}</p><a href={arcChatHref(tr('Help me make a finished video on my computer. Ask for the topic and format, then check my available local tools.','帮我在自己的电脑上制作一支成片。先明确主题和画幅，再检查可用的本地工具。'),'video-gallery')}>{tr('Make your own film','制作你的作品')} <span aria-hidden="true">→</span></a></footer>
  <dialog ref={dialog} className="mediaGalleryDialog" aria-labelledby="media-player-title" onCancel={close} onClose={()=>{video.current?.pause();setSelected(null);opener.current?.focus();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
   {selected&&<div className="mediaPlayerShell"><div className="mediaPlayerTop"><span>{category(selected.category)}</span><button type="button" className="mediaPlayerClose" autoFocus aria-label={tr('Close video','关闭视频')} onClick={close}>×</button></div><div className="mediaPlayerStage"><video key={selected.id} ref={video} controls playsInline autoPlay preload="metadata" poster={src(selected.poster)} src={src(selected.video)} aria-label={selected.title[locale]} onError={()=>setFailed(true)}/></div>
   <div className="mediaPlayerInfo"><div><h3 id="media-player-title">{selected.title[locale]}</h3><p>{selected.description[locale]}</p><span className="mediaPlayerMeta">{selected.engine} · {selected.width} × {selected.height} · {Math.round(selected.duration)}s · {sound(selected.audio)} · {selected.language==='en'?tr('English','英文'):tr('Chinese','中文')}</span></div><a className="mediaPlayerCreate" href={arcChatHref(selected.prompt[locale],'video-demo:'+selected.id)}>{tr('Make something like this','制作类似视频')} ↗</a></div>
   {failed&&<p className="mediaPlayerError" role="alert">{tr('This video could not load. ','视频暂时无法加载。')}<a href={src(selected.video)} target="_blank" rel="noreferrer">{tr('Open the video file','打开视频文件')}</a></p>}
   </div>}
  </dialog>
 </section>;
}
