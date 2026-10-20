import test from 'node:test';
import assert from 'node:assert/strict';
import {arcTranscript} from '../src/arc-transcript.ts';
test('chat hides tool traces and legacy intent while preserving user messages and final answers',()=>{
 const messages=[{id:'run:user',run_id:'run',role:'user',text:'Summarize my inbox'},...Array.from({length:6},(_,i)=>[{id:`run:${i}:intent`,run_id:'run',role:'assistant',text:'Working'}, {id:`run:${i}:tool`,run_id:'run',role:'tool',text:'Working',tool:'list_apps',status:'completed'}]).flat(),{id:'run:6:reply',run_id:'run',role:'assistant',text:'Verified summary'}, {id:'next:user',run_id:'next',role:'user',text:'Read the next page'}, {id:'next:0:tool',run_id:'next',role:'tool',text:'Read',tool:'read_inbox',status:'unknown'}];
 const entries=arcTranscript(messages);
 assert.equal(entries.length,3);assert.deepEqual(entries.map(e=>e.message.text),['Summarize my inbox','Verified summary','Read the next page']);
 assert.equal(messages.filter(message=>message.role==='tool').length,7,'Source audit data is retained');
});
test('a running trace has a stable key across polling and legacy messages use the run prefix',()=>{
 const first={id:'old:0:tool',role:'tool',tool:'read_inbox',text:'Read',status:'running'},second={...first,status:'completed',result:'Observed data'};
 assert.deepEqual(arcTranscript([first]),[]);assert.deepEqual(arcTranscript([second]),[]);
 assert.equal(arcTranscript([{id:'old:0:intent',role:'assistant',text:'Read'}]).length,0);
 assert.equal(arcTranscript([{id:'legacy-answer',role:'assistant',text:'A real answer'}])[0].message.text,'A real answer');
});
