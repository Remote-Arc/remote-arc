import React from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../src/app/i18n.js';
import {ServiceHealth} from '../src/features/admin/service-health.js';
import type {HealthSnapshot} from '../src/features/admin/service-health-model.js';
import '../src/features/admin/admin-console.css';
import '../src/features/admin/admin-design.css';
// Local regression entry only; never bundled into the production app.
const nativeFetch=(window as Window&{healthTestFetch?:typeof fetch}).healthTestFetch;if(nativeFetch)window.fetch=nativeFetch;
const shell=document.createElement('div');shell.className='adminShell';Object.assign(shell.style,{display:'block',height:'auto',minHeight:'100vh',overflow:'visible'});
const host=document.createElement('main');host.id='health-browser-fixture';host.className='adminContent';Object.assign(host.style,{margin:'0 auto',padding:'24px',height:'auto',overflow:'visible',maxWidth:'1350px'});
document.getElementById('root')!.hidden=true;document.body.append(shell);shell.append(host);
const health:HealthSnapshot={status:'degraded',checkedAt:new Date().toISOString(),worker:{status:'operational',errors15m:0,errors1h:1,errors24h:3},dependencies:{d1:{status:'operational'},durableObjects:{status:'operational'}},alerts:{emailConfigured:false,destination:null,recent:[]},account:{users:62,devices:42,activeTokens:30},incidents:[{id:'infra1',created_at:new Date().toISOString(),severity:'error',kind:'http_5xx',status_code:503,method:'POST',path:'/api/apps/:redacted',message:'Remote Arc returned HTTP 503'}]};
createRoot(host).render(<I18nProvider><ServiceHealth health={health} loading={false} reload={()=>{}}/></I18nProvider>);
