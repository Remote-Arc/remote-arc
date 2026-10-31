export function extractCaptchaImages(value:unknown) {
 const clean=value && typeof value==="object" && !Array.isArray(value)?{...value as Record<string,unknown>}:value;
 const images: {type:"image";data:string;mimeType:string}[]=[];
 if(clean && typeof clean==="object" && "captcha_images" in clean){
  const entries=(clean as Record<string,unknown>).captcha_images;
  delete (clean as Record<string,unknown>).captcha_images;
  (clean as Record<string,unknown>).captcha_image_frames=Array.isArray(entries)?entries.slice(0,2).map(image=>image?.frame):[];
  if(Array.isArray(entries))for(const image of entries.slice(0,2)){
   if(image?.mimeType==="image/png" && typeof image.data==="string" && image.data.length<=6_000_000 && /^[A-Za-z0-9+/=\r\n]+$/.test(image.data))images.push({type:"image",mimeType:"image/png",data:image.data});
  }
 }
 return {clean,images};
}
