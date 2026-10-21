/** Decode provider file transport, without interpreting content as authority.
 * Binary/invalid UTF-8 and oversized payloads keep their original metadata. */
export function readableArcAppContent(operation:string,result:unknown){
 if(operation!=='contents.read'||!result||typeof result!=='object'||Array.isArray(result))return result;
 const value=result as Record<string,unknown>;
 if(value.encoding!=='base64'||typeof value.content!=='string'||value.content.length>350000)return result;
 try{
  const bytes=Uint8Array.from(atob(value.content.replace(/\s/g,'')),char=>char.charCodeAt(0));
  const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(/[\x00-\x08\x0e-\x1f]/.test(content))return result;
  return{...value,content,encoding:'utf-8',sourceEncoding:'base64',untrustedData:true};
 }catch{return result;}
}
