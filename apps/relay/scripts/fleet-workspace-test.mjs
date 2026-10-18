import assert from "node:assert/strict";
import { planFleetGitWorkspace } from "../src/fleet-workspace.js";
const sha="a".repeat(40);
const mac={device_id:"mac",device_name:"Mac",platform:"darwin",running:0,eligible_count:2};
const win={...mac,device_id:"windows",platform:"win32"};
const request={repository:"Remote-Arc/remote-arc",revision:sha};
const unix=planFleetGitWorkspace(request,mac,"/Users/samyao/Work");
assert.equal(unix.path,"/Users/samyao/Work/ra-fleet-Remote-Arc-remote-arc-"+sha.slice(0,12));
assert(unix.command.includes("git clone --no-checkout"));
assert(unix.command.includes("test -z"));
assert.equal(unix.cwd,"/Users/samyao/Work");
const windows=planFleetGitWorkspace(request,win,"E:\\Coding");
assert.equal(windows.cwd,"E:\\Coding");
assert(windows.command.includes("if exist"));
assert(windows.command.includes("checkout --quiet --detach"));
for(const repo of ["x;rm -rf /", "../repo", "someone/name && command", "a/b..c", "abc/nope\nhello"]) {
  assert.throws(()=>planFleetGitWorkspace({...request,repository:repo},mac,"/tmp"),/canonical GitHub/);
}
for(const hash of ["main","refs/heads/master","deadbeef","a".repeat(39)+";"]) {
  assert.throws(()=>planFleetGitWorkspace({...request,revision:hash},mac,"/tmp"),/immutable/);
}
assert.throws(()=>planFleetGitWorkspace(request,win,"E:\\Coding & echo trouble"),/trusted local drive/);
assert.throws(()=>planFleetGitWorkspace(request,mac,"/tmp\nmalicious"),/safe trusted/);
console.log("Fleet Git workspace validation and immutable materialization tests passed");
