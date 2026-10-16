import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const arc=readFileSync(path.join(root,"src/arc-capabilities.tsx"),"utf8");
const landing=readFileSync(path.join(root,"src/arc-future.tsx"),"utf8");
const admin=readFileSync(path.join(root,"src/admin/admin-console.tsx"),"utf8");
const landingCss=readFileSync(path.join(root,"src/arc-future.css"),"utf8");
const appCss=readFileSync(path.join(root,"src/arc-capabilities.css"),"utf8");
const expected=["github","slack","notion","linear","jira","gmail","googlecalendar","googledrive","googlesheets","googledocs","airtable","hubspot","salesforce","discord","microsoftoutlook","confluence"];
for(const key of expected){
  assert.match(arc,new RegExp('slug:"'+key+'"'),"missing ecosystem logo registration for "+key);
  const p=path.join(root,"public/app-brands",key+".svg");
  assert.ok(existsSync(p), "missing logo asset "+p);
  assert.match(readFileSync(p,"utf8"),/<svg\b[^>]*viewBox=/,"invalid SVG "+key);
}
assert.doesNotMatch(arc,/Phase\s+[234]\b|阶段\s*[234]/i,"Arc feature page must not present roadmap phases");
for(const token of ["Routines","Skills","Teach Arc","Workspace","Connector SDK","Tool Registry","billing","approvals"]){
  assert.ok(arc.includes(token)||landing.includes(token),"missing product capability: "+token);
}
assert.match(arc,/NOT LIVE/,"target apps must not be falsely represented as available");
assert.match(arc,/arcAppDetail/,"clickable app cards must show planned-use details");
assert.match(landing,/arcV3ScenePlayback/,"hero scene must have a playback control");
assert.match(arc,/arcRoutinePlayback/,"routine demo must have a playback control");
assert.match(landingCss,/\.arcV3\{[^}]*overflow:visible/,"hero ambient glow must not be cut off by outer clipping");
assert.match(landingCss,/\.arcV3HeroGlow\{[^}]*mask-image:/,"hero ambient glow needs a soft falloff");
assert.match(appCss,/@media\(prefers-reduced-motion:reduce\)/,"motion accessibility fallback required");
assert.match(admin,/adminOverview/);
assert.match(admin,/api\/admin\/operations/);
assert.match(admin,/api\/admin\/submissions/);
assert.match(admin,/api\/monitor/);
assert.match(admin,/AdminOperations/,"existing admin operations must be preserved");
console.log("Arc catalog & Admin shell smoke passed:",expected.length,"vendored brand SVGs, capability scope, existing API seams");
