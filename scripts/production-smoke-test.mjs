import assert from "node:assert/strict";
import { verifyProduction, verifyWithRetry } from "./production-smoke.mjs";
const sha = "a".repeat(40), installer = "#!/bin/sh\n# fixture\n", requests=[];
function fetchFixture({deployment=sha,version="0.6.1",badShell=false,badBundle=false,badProviders=false,badLogin=false,pageStatus=200}={}) {
 return async (url,init)=>{
  assert.equal(init.method,"GET"); assert.equal(init.redirect,"manual");assert.equal(init.headers.authorization,undefined);requests.push(url);
  const path=new URL(url).pathname;
  if(path==="/health")return Response.json({ok:true,service:"remotearc-relay",version,deployment});
  if(path==="/api/apps/status")return Response.json({enabled:true,providers:[{provider:badProviders?"unknown":"runway",ready:true}]});
  if(path==="/apps")return new Response(null,{status:302,headers:{location:badLogin?"https://evil.example":"https://mcp.remotearc.app/auth/login?return_to=%2Fapps%3Fcategory%3Ddocs_files"}});
  if(path==="/install.sh")return new Response(badShell?"<html>wrong</html>":installer,{headers:{"content-type":badShell?"text/html":"text/x-shellscript"}});
  if(path.startsWith("/assets/"))return new Response("console.log('loaded')",{headers:{"content-type":badBundle?"text/html":"application/javascript"}});
  if(path==="/docs/unknown-release-check")return new Response("not found",{status:404});
  return new Response('<html><div id="root"></div><script type="module" src="/assets/app.js"></script></html>',{status:pageStatus,headers:{"content-type":"text/html"}});
 };
}
const options={sha,version:"0.6.1",installer,providers:["runway"]};
const result=await verifyProduction({...options,fetcher:fetchFixture()});
assert.equal(result.configuredProviders,1);assert(result.checks.length>15);
for(const [input,pattern]of [
 [{deployment:"b".repeat(40)},/deployment SHA/],[{version:"0.5.0"},/health\/version/],
 [{badShell:true},/installer returned/],[{badBundle:true},/bundle returned/],
 [{badProviders:true},/catalog differs/],[{badLogin:true},/login destination/],
 [{pageStatus:503},/HTTP 200/],
])await assert.rejects(verifyProduction({...options,fetcher:fetchFixture(input)}),pattern);
let calls=0,waits=0;
const good=fetchFixture();
const retry=await verifyWithRetry({...options,fetcher:async(...args)=>{if(++calls===1)throw new Error("warming up");return good(...args);}},
 {attempts:2,wait:async()=>{waits++;},log:()=>{}});
assert.equal(retry.deployment,sha);assert.equal(waits,1);
await assert.rejects(verifyWithRetry({...options,fetcher:fetchFixture({deployment:"b".repeat(40)})},{attempts:2,wait:async()=>{},log:()=>{}}),/deployment SHA/);
assert(requests.every(url=>!url.includes("/oauth/")&&!url.includes("/mcp?")),"No provider authorization or device execution");
console.log("PASS: production SHA/HTML/bundle/installer/readiness/login checks, bounded retry and no external writes");
