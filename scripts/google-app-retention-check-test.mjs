import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {retentionQuery,parseCounts,verifyRetention} from './google-app-retention-check.mjs';

test('real SQLite preview works on old schema, never returns contents, and verifies cleanup separately from ledger retention',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users(id TEXT); INSERT INTO users VALUES('owner');
    CREATE TABLE app_connections(id TEXT,user_id TEXT,provider TEXT); INSERT INTO app_connections VALUES('google','owner','gmail'),('other','owner','github');
    CREATE TABLE app_calls(id TEXT,user_id TEXT,connection_id TEXT,created_at TEXT,arguments_ciphertext TEXT,result_ciphertext TEXT,review_ciphertext TEXT);
    INSERT INTO app_calls VALUES('old','owner','google','2026-10-26T12:00:00.000Z','private-argument','private-result',NULL),('recent','owner','google','2026-10-26T12:00:00.001Z','recent-private',NULL,NULL),('foreign','owner','other','2026-10-01T00:00:00.000Z','other-private',NULL,NULL);`);
  const at=new Date('2026-11-02T12:00:00.000Z');
  const before={...db.prepare(retentionQuery('before',at)).get()};
  assert.deepEqual(before,{users:1,connections:2,google_calls:2,expired_calls:1,expired_payloads:1,purge_markers:0});
  assert(!JSON.stringify(before).includes('private'));
  assert.throws(()=>db.prepare(retentionQuery('after',at)),/content_purged_at/);
  db.exec("ALTER TABLE app_calls ADD COLUMN content_purged_at TEXT; UPDATE app_calls SET arguments_ciphertext='',result_ciphertext=NULL,content_purged_at='2026-11-02T12:00:00.000Z' WHERE id='old'");
  const after={...db.prepare(retentionQuery('after',at)).get()};
  assert.deepEqual(after,{users:1,connections:2,google_calls:2,expired_calls:1,expired_payloads:0,purge_markers:1});
  assert.equal(db.prepare("SELECT arguments_ciphertext FROM app_calls WHERE id='recent'").get().arguments_ciphertext,'recent-private');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM app_calls').get().n,3);db.close();
});
test('metadata parsing fails closed for errors, missing counts, extra results and invalid counts',()=>{
  const good={users:1,connections:2,google_calls:3,expired_calls:2,expired_payloads:1,purge_markers:0};
  const envelope=row=>JSON.stringify([{success:true,results:[row]}]);
  assert.deepEqual(parseCounts(envelope({...good,unrequested:'discarded'})),good);
  for(const value of ['bad','[]','[{}]',JSON.stringify([{success:false,results:[good]}]),JSON.stringify([{success:true,results:[good,good]}]),envelope({}),envelope({...good,expired_payloads:-1}),envelope({...good,users:'1'})])assert.throws(()=>parseCounts(value));
  assert.throws(()=>retentionQuery('other'));
});
test('before never waits; after polls until payloads disappear and reports persistent failures',async()=>{
  let reads=0,waits=0;
  const read=async()=>JSON.stringify([{success:true,results:[{users:1,connections:1,google_calls:2,expired_calls:1,expired_payloads:++reads===1?1:0,purge_markers:reads===1?0:1}]}]);
  assert.equal((await verifyRetention('after',{read,wait:async(ms)=>{assert.equal(ms,15000);waits++;},log:()=>{}})).purge_markers,1);assert.equal(reads,2);assert.equal(waits,1);
  reads=0;waits=0;assert.equal((await verifyRetention('before',{read,wait:async()=>{waits++;},log:()=>{}})).expired_payloads,1);assert.equal(waits,0);
  reads=0;await assert.rejects(()=>verifyRetention('after',{read,attempts:1,log:()=>{}}),/did not converge/);
  await assert.rejects(()=>verifyRetention('after',{read,attempts:0}),/No retention/);
  await assert.rejects(()=>verifyRetention('after',{read:async()=>{throw Error('offline');},log:()=>{}}),/offline/);
});
