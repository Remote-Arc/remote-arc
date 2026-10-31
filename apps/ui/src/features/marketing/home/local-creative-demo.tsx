import {useState} from 'react';
import {useI18n} from '../../../app/i18n.js';
import {localizedWebsiteHref} from '../../../lib/marketing-paths.js';
import {PUBLISHED_MEDIA_DEMOS,mediaDemoPath} from '../../../../../../packages/docs/src/media-gallery.js';
import {IMAGE_DEMOS} from '../../../../../../packages/docs/src/image-gallery.js';
import './local-creative-demo.css';

export const creativeMediaSrc=(file:string)=>(import.meta.env?.VITE_MEDIA_GALLERY_BASE_URL||'').replace(/\/$/,'')+mediaDemoPath(file);
export function LocalCreativeResult({kind}:{kind:'video'|'image'}){
 const {tr,locale}=useI18n(),[playing,setPlaying]=useState(false),[failed,setFailed]=useState(false);
 const film=PUBLISHED_MEDIA_DEMOS.find(item=>item.id==='basketball-return-'+locale);
 const images=IMAGE_DEMOS.filter(item=>['court-energy','quiet-objects'].includes(item.id));
 const href=localizedWebsiteHref(kind==='video'?'/use-cases/video-creation#video-gallery':'/use-cases/image-studio#image-gallery',locale);
 return <article className="localCreativeResult" data-kind={kind}>
  <header><span>{tr('REAL WORK · RENDERED LOCALLY','真实作品 · 本地渲染')}</span><span>{kind==='video'?'MP4 · 60s':'PNG · 1200 × 1500'}</span></header>
  {kind==='video'&&film?<div className="localCreativeFilm">
   {playing?<video key={film.id} controls playsInline autoPlay preload="metadata" src={creativeMediaSrc(film.video)} poster={creativeMediaSrc(film.poster)} aria-label={film.title[locale]} onError={()=>setFailed(true)}/>:
    <button type="button" onClick={()=>setPlaying(true)} aria-label={tr('Play ','播放：')+film.title[locale]}><img src={creativeMediaSrc(film.poster)} width={film.width} height={film.height} alt="" loading="lazy"/><span aria-hidden="true">▶</span></button>}
   <strong>{film.title[locale]}</strong><p>{tr('60 seconds · connected scenes · music · no voiceover','60 秒 · 连贯分镜 · 配乐 · 无旁白')}</p>
   {failed&&<p role="alert">{tr('Video unavailable. Open the gallery to try again.','视频暂时无法播放，可打开画廊重试。')}</p>}
  </div>:<div className="localCreativeImages">{images.map(item=><a key={item.id} href={href}><img src={creativeMediaSrc(item.thumb)} width={item.width} height={item.height} alt={item.title[locale]} loading="lazy"/><span>{item.title[locale]}</span></a>)}</div>}
  <footer><span>{kind==='video'?tr('Vibe Knowledge Film · editable project','Vibe Knowledge Film · 可编辑工程'):tr('Code graphics · editable drawing sources','代码绘图 · 可编辑源码')}</span><a href={href}>{tr('Explore the gallery','查看作品画廊')} ↗</a></footer>
 </article>;
}
export function CreativeDirectoryPreviews(){
 const {tr,locale}=useI18n();
 const film=PUBLISHED_MEDIA_DEMOS.find(item=>item.id==='basketball-return-'+locale),image=IMAGE_DEMOS.find(item=>item.id==='court-energy');
 return <div className="creativeDirectoryPreviews">
  {film&&<a href={localizedWebsiteHref('/use-cases/video-creation#video-gallery',locale)}><img src={creativeMediaSrc(film.poster)} width={film.width} height={film.height} alt="" loading="lazy"/><span>{tr('Video creation','视频制作')} <small>60s · MP4</small></span><b aria-hidden="true">▶</b></a>}
  {image&&<a href={localizedWebsiteHref('/use-cases/image-studio#image-gallery',locale)}><img src={creativeMediaSrc(image.thumb)} width={image.width} height={image.height} alt="" loading="lazy"/><span>{tr('Image creation','图片创作')} <small>PNG</small></span><b aria-hidden="true">↗</b></a>}
 </div>;
}
