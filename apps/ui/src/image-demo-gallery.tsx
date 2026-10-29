import React,{useEffect,useRef,useState} from 'react';
import {useI18n} from './i18n.js';
import {arcChatHref} from '../../../packages/docs/src/arc-use-cases.js';
import {IMAGE_DEMOS,type ImageDemo} from '../../../packages/docs/src/image-gallery.js';
import {mediaDemoPath} from '../../../packages/docs/src/media-gallery.js';
import './media-demo-gallery.css';
import './image-demo-gallery.css';

export function ImageDemoGallery(){
 const {tr,locale}=useI18n(),[selected,setSelected]=useState<ImageDemo|null>(null),[failed,setFailed]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLButtonElement|null>(null);
 const base=(import.meta.env.VITE_MEDIA_GALLERY_BASE_URL||'').replace(/\/$/,'');
 const src=(name:string)=>base+mediaDemoPath(name);
 useEffect(()=>{if(selected){setFailed(false);if(!dialog.current?.open)dialog.current?.showModal();}else if(dialog.current?.open){dialog.current.close();opener.current?.focus();}},[selected]);
 const close=()=>setSelected(null);
 return <section id="image-gallery" className="mediaDemoGallery imageDemoGallery" aria-labelledby="image-gallery-heading">
 <header className="mediaGalleryHeader"><div><span className="eyebrow">{tr('THE IMAGE GALLERY','图片参考作品')}</span><h2 id="image-gallery-heading">{tr('An idea, drawn in code.','把想法，画成作品。')}</h2><p>{tr('Posters, editorial illustration and generative art, rendered on a personal computer. Open an example, then use its brief as a starting point.','海报、编辑插画与生成艺术，全部在个人电脑上渲染。点开参考图，借用创作需求开始自己的作品。')}</p></div><div className="mediaGalleryStamp"><strong>{String(IMAGE_DEMOS.length).padStart(2,'0')}</strong><span>{tr('ORIGINAL EXAMPLES','原创示例')}<br/>{tr('RENDERED LOCALLY','本地渲染')}</span></div></header>
 <div className="imageGalleryGrid">{IMAGE_DEMOS.map((item,index)=><article className="mediaDemoCard imageDemoCard" key={item.id}><button type="button" className="imageDemoPreview" aria-label={tr('View image: ','查看图片：')+item.title[locale]} onClick={event=>{opener.current=event.currentTarget;setSelected(item);}}><img src={src(item.thumb)} alt={item.title[locale]} width={item.width} height={item.height} loading={index<2?'eager':'lazy'} decoding="async"/><span aria-hidden="true">↗</span></button><div className="mediaDemoCopy"><div className="mediaDemoCategory">{tr('CODE GRAPHICS','代码绘图')}<span>{item.engine}</span></div><h3>{item.title[locale]}</h3><p>{item.description[locale]}</p><button className="mediaDemoTextPlay" type="button" onClick={event=>{opener.current=event.currentTarget;setSelected(item);}}>{tr('View reference','查看参考图')} ↗</button></div></article>)}</div>
 <footer className="mediaGalleryFooter"><p>{tr('These examples use code, local fonts and seeded algorithms. No image model is required. Photographic image generation uses a separately configured local ComfyUI backend.','这些示例使用代码、本地字体与固定种子算法，无需绘图模型。照片级图片生成则使用另行配置的本地 ComfyUI 后端。')}</p></footer>
 <dialog ref={dialog} className="mediaGalleryDialog imageGalleryDialog" aria-labelledby="image-viewer-title" onCancel={close} onClose={()=>{setSelected(null);opener.current?.focus();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
 {selected&&<div className="mediaPlayerShell"><div className="mediaPlayerTop"><span>{tr('IMAGE REFERENCE','图片参考')}</span><button type="button" className="mediaPlayerClose" autoFocus aria-label={tr('Close image','关闭图片')} onClick={close}>×</button></div><div className="imageViewerStage"><img src={src(selected.image)} alt={selected.title[locale]} width={selected.width} height={selected.height} onError={()=>setFailed(true)}/></div><div className="mediaPlayerInfo"><div><h3 id="image-viewer-title">{selected.title[locale]}</h3><p>{selected.description[locale]}</p><span className="mediaPlayerMeta">{selected.engine} · {selected.width} × {selected.height} · PNG</span></div><a className="mediaPlayerCreate" href={arcChatHref(selected.prompt[locale],'image-demo:'+selected.id)}>{tr('Make something like this','制作类似图片')} ↗</a></div>{failed&&<p className="mediaPlayerError" role="alert">{tr('This image could not load.','图片暂时无法加载。')} <a href={src(selected.image)} target="_blank" rel="noreferrer">{tr('Open image','打开图片')}</a></p>}</div>}
 </dialog></section>;
}
