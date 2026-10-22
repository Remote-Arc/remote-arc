import assert from 'node:assert/strict';
import {FOLLOWUP_TEMPLATES,followupTemplate} from '../../../packages/protocol/src/followup-templates.js';
import {renderFollowupEmail} from '../../../packages/protocol/src/followup-email.js';
const urls={setupUrl:'https://remotearc.app/connect-ai',feedbackUrl:'https://remotearc.app/feedback?source=followup%3Afixture',unsubscribeUrl:'https://remotearc.app/email/follow-up/unsubscribe?token=fixture'};
for(const template of FOLLOWUP_TEMPLATES)for(const locale of ['en','zh'] as const){
 const content=followupTemplate(template.id,locale,{name:'Example <img src=x onerror=alert(1)>',...urls});
 const mail=renderFollowupEmail({...content,...urls,locale,templateId:template.id,replyTo:'support@remotearc.app'});
 assert(mail.html.includes('lang="'+(locale==='zh'?'zh-CN':'en')+'" dir="ltr"'));assert.equal((mail.html.match(/<h1\b/g)||[]).length,1);assert(!/<table(?![^>]*role="presentation")/g.test(mail.html));assert(!mail.html.includes('<img src=x'));assert(mail.html.includes('&lt;img'));assert(mail.text.includes(urls.unsubscribeUrl));assert(mail.html.includes('href="'+mail.action.href.replaceAll('&','&amp;')+'"'));assert(mail.html.includes('alt=""'));assert(!/<script\b|<form\b|<iframe\b/.test(mail.html));
 if(template.id==='finish-mcp'){
  for(const client of ['chatgpt','claude','cursor']){const link='https://remotearc.app'+(locale==='zh'?'/zh':'')+'/install/'+client;assert(content.body.includes(link));assert(mail.text.includes(link));assert(mail.html.includes('href="'+link+'"'));}
  assert.equal(mail.action.href,'https://remotearc.app'+(locale==='zh'?'/zh':'')+'/install/chatgpt');
 }
}
assert.throws(()=>renderFollowupEmail({subject:'Test',body:'Test',templateId:'experience',locale:'en',...urls,feedbackUrl:'https://remotearc.app.evil.test/feedback',replyTo:'support@remotearc.app'}),/invalid_followup_link/);
const custom=renderFollowupEmail({subject:'Follow up',body:'Hello, please share feedback. https://suspicious.invalid/raw-link',templateId:'experience',locale:'en',...urls,replyTo:'support@remotearc.app',design:{layout:'spotlight',accent:'#ffffff',headline:'<img src=x onerror=alert(1)>',buttonLabel:'Continue <script>',highlights:[{title:'First result',body:'A real report'}]}});
assert(custom.html.includes('bgcolor="#ffffff"'));assert(custom.html.includes('color:#000000'));assert(!custom.html.includes('<img src=x'));assert(!custom.html.includes('https://suspicious.invalid'));assert(custom.html.includes('First result'));
console.log('PASS: bilingual branded HTML follow-ups, semantic CTA, plain text, static logo, escaping, accessible tables and official-domain links.');
