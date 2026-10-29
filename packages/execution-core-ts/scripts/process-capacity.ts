import assert from "node:assert/strict";
import {startBackgroundProcess,waitManagedProcessStatus,getManagedProcessStatus,stopManagedProcess} from "../src/process.js";
const before=process.env.REMOTEARC_MAX_ACTIVE_PROCESSES;
try{
 process.env.REMOTEARC_MAX_ACTIVE_PROCESSES="1";
 const running=await startBackgroundProcess('"'+process.execPath+'" -e "setTimeout(()=>{},30000)"');
 try{await assert.rejects(startBackgroundProcess("echo denied"),/Running: 1; limit: 1/);}
 finally{await stopManagedProcess(running.process_id);}
 await waitManagedProcessStatus(running.process_id,5000);
 let first="",last="";
 for(let i=0;i<130;i++){
  const job=await startBackgroundProcess("echo history-"+i);
  if(!first)first=job.process_id;last=job.process_id;
  const status=await waitManagedProcessStatus(job.process_id,5000);
  assert.equal(status.status,"exited");
 }
 assert.equal(getManagedProcessStatus(last).status,"exited");
 assert.throws(()=>getManagedProcessStatus(first),/retention window/);
 console.log("PASS: configured active admission, completed-job reuse past 32 launches and bounded newest history");
}finally{
 if(before===undefined)delete process.env.REMOTEARC_MAX_ACTIVE_PROCESSES;
 else process.env.REMOTEARC_MAX_ACTIVE_PROCESSES=before;
}
