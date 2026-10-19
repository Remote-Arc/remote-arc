// Secret updates can propagate after the management API has returned success.
// Retry readiness reads only; never repeat a paid model attempt or payment.
export async function waitRuntimeReady(fetcher,predicate,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 for(let attempt=0;attempt<8;attempt++){
  try{const response=await fetcher('https://agent.remotearc.app/api/runtime-config',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(response.ok){const state=await response.json();if(predicate(state))return state;}}catch{/* Readiness is retried without logging response bodies. */}
  if(attempt<7)await wait(2000);
 }
 throw Error('Production runtime readiness failed');
}
