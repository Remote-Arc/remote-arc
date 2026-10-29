import assert from "node:assert/strict";
import { startBackgroundProcess, waitManagedProcessStatus, stopManagedProcess } from "../src/process.js";
const job = await startBackgroundProcess(`"${process.execPath}" -e "setTimeout(()=>console.log('ready'),150);setTimeout(()=>{},30000)"`);
try {
 const text = await waitManagedProcessStatus(job.process_id,60000,"ready");
 assert.equal(text.wait_reason,"text"); assert.ok(text.note);
 const start=Date.now(); const timeout=await waitManagedProcessStatus(job.process_id,150,"absent");
 assert.equal(timeout.wait_reason,"timeout");assert.ok(Date.now()-start>=140);
 await assert.rejects(waitManagedProcessStatus(job.process_id,-1),/non-negative/);
} finally { await stopManagedProcess(job.process_id); }
assert.equal((await waitManagedProcessStatus(job.process_id,5000)).wait_reason,"exited");
console.log("PASS: process_status waits for output, exit and deadline; large waits are capped");
