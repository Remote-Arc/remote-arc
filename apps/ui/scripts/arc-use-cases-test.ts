import assert from 'node:assert/strict';
import {ARC_DELEGATED_WORK,ARC_USE_CASES,arcChatHref,arcUseCasePrompt} from '../../../packages/docs/src/arc-use-cases.js';
import {chinesePages} from '../src/marketing-paths.js';
import type {UseCaseSlug} from '../src/use-cases.js';

const published=[...chinesePages].filter(path=>path.startsWith('/use-cases/')).map(path=>path.slice('/use-cases/'.length)).sort();
assert.deepEqual(Object.keys(ARC_USE_CASES).sort(),published,'Every published use case must have an Arc execution path');
assert.equal(new Set(ARC_DELEGATED_WORK.map(item=>item.id)).size,4,'Four distinct delegated responsibilities');
for(const item of ARC_DELEGATED_WORK)for(const locale of ['en','zh'] as const){
 for(const field of ['title','detail','retains','checks','prompt'] as const)assert(item[field][locale].trim(),item.id+' '+field);
 const url=new URL(arcChatHref(item.prompt[locale],'delegated-work:'+item.id));
 assert.equal(url.searchParams.get('prompt'),item.prompt[locale]);
 assert.deepEqual([...url.searchParams.keys()].sort(),['prompt','source']);
 assert.match(item.prompt[locale],locale==='en'?/Confirm/:/确认/,'A workflow gathers its sources and scope before being saved');
}
const connectOnly=(published as UseCaseSlug[]).filter(slug=>ARC_USE_CASES[slug].connectOnly);
assert.deepEqual(connectOnly,['job-applications'],'Only Browser Runner work is Connect-only today');
for(const slug of connectOnly){
 // These pages offer no Arc draft; their Arc copy must say so plainly.
 assert.match(ARC_USE_CASES[slug].intro.en,/through Connect/);assert.match(ARC_USE_CASES[slug].prompt.en,/does not drive/);
 assert.match(ARC_USE_CASES[slug].intro.zh,/Connect/);assert.match(ARC_USE_CASES[slug].prompt.zh,/暂不支持/);
}
for(const slug of published as UseCaseSlug[])for(const locale of ['en','zh'] as const){
 if(ARC_USE_CASES[slug].connectOnly)continue;
 const item=ARC_USE_CASES[slug],prompt=arcUseCasePrompt(slug,locale),url=new URL(arcChatHref(prompt,'use-case:'+slug));
 for(const field of ['intro','prompt','requires','boundary'] as const){assert(item[field][locale].trim().length>0,slug+' '+field);if(locale==='zh')assert(/[\u3400-\u9fff]/u.test(item[field][locale]),slug+' must be localized');}
 assert(prompt.length<=6000,'Fits the actual Arc message contract');
 assert.equal(url.origin,'https://agent.remotearc.app');assert.equal(url.pathname,'/dashboard/agent/chat');
 assert.equal(url.searchParams.get('prompt'),prompt);assert.equal(url.searchParams.get('source'),'use-case:'+slug);
 assert.deepEqual([...url.searchParams.keys()].sort(),['prompt','source'],'Entry prepares a draft, with no auto-send or permission-changing flag');
 assert.doesNotMatch(prompt,/create_automation|create_agent_goal|condition_watch|schedule_watch|kind=long_task/,'Arc requests use native Arc decisions rather than Connect-only commands');
}
assert.match(ARC_USE_CASES['ci-follow-up'].boundary.en,/interval|checks now/);
assert.match(ARC_USE_CASES['long-running-jobs'].prompt.en,/process ID/);
assert.match(ARC_USE_CASES['presentation-deck'].requires.en,/library/);
assert.match(ARC_USE_CASES['desktop-automation'].boundary.en,/does not provide arbitrary/);
const hostile='A draft & not a query flag #?<script>alert(1)</script> 中文';
const encoded=new URL(arcChatHref(hostile,'test'));assert.equal(encoded.searchParams.get('prompt'),hostile);assert.equal(encoded.hash,'');
assert.throws(()=>arcChatHref(' ','test'));assert.throws(()=>arcChatHref('x'.repeat(6001),'test'));
console.log('PASS: 16 bilingual use cases; the 15 Arc-capable ones enter Arc as bounded reviewable drafts, and Browser Runner work is offered through Connect only');
