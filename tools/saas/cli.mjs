import fs from 'node:fs';
import http from 'node:http';
import {economics} from './economics.mjs';
const args=process.argv.slice(2),input=args.indexOf('--input');
const overrides=input>=0?JSON.parse(fs.readFileSync(args[input+1],'utf8')):{};
const report=economics(overrides);
if(args.includes('--serve')){
 const html=fs.readFileSync(new URL('./index.html',import.meta.url));
 http.createServer((req,res)=>{
  if(req.url==='/api/economics'&&req.method==='POST'){
   let raw='';req.on('data',c=>{raw+=c;if(raw.length>8192)req.destroy();});req.on('end',()=>{try{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(economics(JSON.parse(raw))));}catch{res.writeHead(400);res.end('Invalid assumptions');}});return;
  }
  if(req.url==='/catalog'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(report));return;}
  if(req.url!=='/'){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);
 }).listen(4319,'127.0.0.1',()=>console.log('SaaS economics: http://127.0.0.1:4319 — local only, no secrets or external calls'));
}else{
 if(args.includes('--json'))console.log(JSON.stringify(report,null,2));else{
  console.table(report.plans.map(p=>({plan:p.label,price:p.revenue,credits:p.monthlyCredits,fullUsageCost:p.total.toFixed(2),grossMargin:(100*p.margin).toFixed(1)+'%',firstMonthAfterTrials:(100*p.firstMonthContributionMargin).toFixed(1)+'%',headroom:p.firstMonthHeadroom.toFixed(2),customersForMillionARR:p.customersForMillionARR})));
  console.table(report.models.map(m=>({model:m.label,creditsPer1000Input:m.creditsPer1000Input,creditsPer1000Output:m.creditsPer1000Output,example8kIn1kOut:m.exampleCredits})));
  console.log('Full model and Connect allowance utilization. Hosting, Apps, support and payment costs are editable assumptions, not vendor quotes. Taxes are excluded from revenue. Trial acquisition cost is reported separately.');
 }
 if(args.includes('--check')&&!report.plans.every(p=>p.meetsTarget))process.exitCode=1;
}
