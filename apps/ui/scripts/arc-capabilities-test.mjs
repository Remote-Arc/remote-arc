import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const arc=readFileSync(path.join(root,"src/arc-capabilities.tsx"),"utf8");
const landing=readFileSync(path.join(root,"src/arc-future.tsx"),"utf8");
const scene=readFileSync(path.join(root,"src/arc-workspace-scene.tsx"),"utf8");
const admin=readFileSync(path.join(root,"src/admin/admin-console.tsx"),"utf8");
const landingCss=readFileSync(path.join(root,"src/arc-future.css"),"utf8");
const appCss=readFileSync(path.join(root,"src/arc-capabilities.css"),"utf8");
const directory=JSON.parse(readFileSync(path.join(root,"src/app-directory.json"),"utf8"));
const expected=[...new Set(directory.apps.map(app=>app.brand))];
assert.equal(directory.apps.length,29);assert.equal(directory.categories.length,8);
for(const key of expected){const p=path.join(root,"public/app-brands",key+".svg");assert.ok(existsSync(p),"missing logo "+key);assert.match(readFileSync(p,"utf8"),/<svg\b[^>]*viewBox=/);}
assert.match(arc,/<AppsDirectory id="arc-apps"/);
assert.match(arc,/<AppWorkflowShowcase/);
assert.doesNotMatch(arc,/Phase\s+[234]\b|阶段\s*[234]/i,"Arc feature page must not present roadmap phases");
for(const token of ["Routines","Skills","Teach Arc","Workspace","billing","approvals"]){
  assert.ok(arc.toLowerCase().includes(token.toLowerCase())||landing.toLowerCase().includes(token.toLowerCase()),"missing product capability: "+token);
}
assert.match(landing,/Hosted execution is available after platform setup/,"Arc preview must disclose the platform configuration gate");
assert.match(landing,/trial starts only when you activate it/,"The trial must not start from a marketing page visit");
assert.match(landing,/https:\/\/agent\.remotearc\.app\/dashboard\/agent\/chat\?trial=1/,"Arc trial CTA must open the actual workspace");
assert.doesNotMatch(arc,/Not yet connectable|PLANNED INTEGRATION/,"Use the executable Apps directory and its explicit release gates");
assert.match(scene,/arcV3ScenePlayback/,"hero scene must have a playback control");
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
