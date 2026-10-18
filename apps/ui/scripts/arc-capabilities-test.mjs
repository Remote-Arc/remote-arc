import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const arc=readFileSync(path.join(root,"src/arc-capabilities.tsx"),"utf8");
const landing=readFileSync(path.join(root,"src/arc-future.tsx"),"utf8");
const scene=readFileSync(path.join(root,"src/arc-workspace-scene.tsx"),"utf8");
const main=readFileSync(path.join(root,"src/main.tsx"),"utf8");
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
assert.match(landing,/not publicly available/,"Arc Hosted remains in development");
assert.doesNotMatch(arc,/Not yet connectable|PLANNED INTEGRATION/,"Use the executable Apps directory and its explicit release gates");
assert.match(scene,/arcV3ScenePlayback/,"hero scene must have a playback control");
assert.match(arc,/arcRoutinePlayback/,"routine demo must have a playback control");
assert.match(landingCss,/\.arcV3\{[^}]*overflow:visible/,"hero ambient glow must not be cut off by outer clipping");
assert.match(landingCss,/\.arcV3HeroGlow\{[^}]*mask-image:/,"hero ambient glow needs a soft falloff");
assert.match(appCss,/@media\(prefers-reduced-motion:reduce\)/,"motion accessibility fallback required");
assert.match(main,/https:\/\/admin\.remotearc\.app\//,"Admin link must point to the independently hosted console");
assert.ok(!existsSync(path.join(root,"src/admin/admin-console.tsx")),"No legacy Admin UI is shipped with consumer dashboard");
assert.ok(!existsSync(path.join(root,"src/admin-operations.tsx")),"Operations UI must live only in admin-remote-arc");
console.log("Arc catalog & independent Admin boundary smoke passed:",expected.length,"vendored brand SVGs, capability scope and no duplicate Admin bundle");
