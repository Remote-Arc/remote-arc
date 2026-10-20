/** Delete abandoned content, retaining payment/usage identifiers for reconciliation.
 * A 24-hour window lets already dispatched work finish before its payloads are purged. */
export async function purgeDeletedArcContent(env:{DB:D1Database},at=new Date().toISOString()){
 await env.DB.prepare('DELETE FROM arc_attachments WHERE id IN (SELECT id FROM arc_attachments WHERE expires_at<=?1 ORDER BY expires_at LIMIT 100)').bind(at).run();
 const cutoff=new Date(Date.parse(at)-86400000).toISOString();
 const sessions=(await env.DB.prepare(`SELECT id FROM arc_chat_sessions s WHERE deleted_at<?1 AND content_purged_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM arc_chat_runs r WHERE r.session_id=s.id AND r.deadline>?2) ORDER BY deleted_at LIMIT 25`).bind(cutoff,at).all<{id:string}>()).results;
 for(const session of sessions)await env.DB.batch([
  env.DB.prepare('DELETE FROM arc_chat_messages WHERE session_id=?1').bind(session.id),
  env.DB.prepare('UPDATE arc_chat_steps SET decision_ciphertext=NULL,result_ciphertext=NULL WHERE run_id IN (SELECT id FROM arc_chat_runs WHERE session_id=?1)').bind(session.id),
  env.DB.prepare("UPDATE arc_chat_sessions SET title_ciphertext='',content_purged_at=?1 WHERE id=?2 AND deleted_at IS NOT NULL").bind(at,session.id),
 ]);
 return{purged:sessions.length};
}
