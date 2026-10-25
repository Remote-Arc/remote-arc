import {MEDIA_DEMOS} from './media-gallery.js';
import {IMAGE_DEMOS} from './image-gallery.js';
export const GALLERY_ASSETS=[
 ...MEDIA_DEMOS.flatMap(item=>[{name:item.video,sha256:item.sha256},{name:item.poster,sha256:item.posterSha256}]),
 ...IMAGE_DEMOS.flatMap(item=>[{name:item.image,sha256:item.sha256},{name:item.thumb,sha256:item.thumbSha256}]),
];
export const galleryContentType=(name:string)=>name.endsWith('.mp4')?'video/mp4':name.endsWith('.png')?'image/png':'image/webp';
