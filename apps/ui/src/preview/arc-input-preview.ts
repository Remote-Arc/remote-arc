import type {ArcAttachment} from '@remotearc/protocol';
/** Per-tab file UI fixture. Retains only files explicitly selected in this preview. */
export function createArcInputPreview(){
 const files=new Map<string,{meta:ArcAttachment;blob:Blob;key:string}>();
 return{metadata:files,async handle(url:URL,method:string,body:unknown,headers?:HeadersInit){
  const match=url.pathname.match(/^\/api\/arc\/attachments(?:\/([\w-]+)(?:\/(content))?)?$/);if(!match)return null;
  if(match[1]){const file=files.get(match[1]);if(!file)return Response.json({error:'ARC_ATTACHMENT_NOT_FOUND'},{status:404});if(method==='GET'&&match[2])return new Response(file.blob,{headers:{'content-type':file.meta.mimeType,'cache-control':'no-store'}});if(method==='DELETE'){files.delete(match[1]);return Response.json({deleted:true});}return Response.json({error:'method_not_allowed'},{status:405});}
  if(method!=='POST'||!(body instanceof Blob))return Response.json({error:'ARC_ATTACHMENT_INVALID_FILE'},{status:400});if(body.size>2*1024*1024)return Response.json({error:'ARC_ATTACHMENT_TOO_LARGE'},{status:413});const key=new Headers(headers).get('x-arc-upload-id')||'',existing=[...files.values()].find(file=>file.key===key);if(existing)return Response.json(existing.meta);
  const id=crypto.randomUUID(),meta:ArcAttachment={id,name:(url.searchParams.get('name')||'File').slice(0,180),mimeType:body.type||'text/plain',size:body.size,kind:body.type.startsWith('image/')?'image':'document'};files.set(id,{meta,blob:body,key});return Response.json(meta,{status:201});
 }};
}
