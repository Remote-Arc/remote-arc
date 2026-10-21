import {arcSession,arcContext,ArcError,type ArcEnv,type ArcMessageBody} from './arc-chat.js';
import {unseal} from './app-oauth.js';

/** Stable, owner-bound cursor pagination over the full encrypted journal. */
export async function arcChatHistory(env:ArcEnv,userId:string,sessionId:string,before?:string){
 await arcSession(env,userId,sessionId);
 const cursor=before?await env.DB.prepare('SELECT id,created_at FROM arc_chat_messages WHERE id=?1 AND session_id=?2 AND user_id=?3').bind(before,sessionId,userId).first<{id:string;created_at:string}>():null;
 if(before&&!cursor)throw new ArcError('ARC_HISTORY_CURSOR_NOT_FOUND',404);
 const rows=(await env.DB.prepare(`SELECT id,role,body_ciphertext,created_at,run_id FROM arc_chat_messages WHERE session_id=?1 AND user_id=?2 AND (?3 IS NULL OR created_at<?3 OR (created_at=?3 AND id<?4)) ORDER BY created_at DESC,id DESC LIMIT 101`).bind(sessionId,userId,cursor?.created_at??null,cursor?.id??null).all<{id:string;role:string;body_ciphertext:string;created_at:string;run_id:string|null}>()).results;
 const visible=rows.slice(0,100).reverse(),messages=await Promise.all(visible.map(async({body_ciphertext,...row})=>({...row,...await unseal<ArcMessageBody>(env,body_ciphertext,arcContext(userId,row.id))})));
 return{messages,hasMore:rows.length>100,before:messages[0]?.id??null};
}
