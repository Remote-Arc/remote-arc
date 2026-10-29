import React from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../src/i18n.js';
import {AdminEvents} from '../src/admin/admin-events.js';
import '../src/admin/admin-console.css';
import '../src/admin/admin-design.css';
// Browser-only local regression fixture. This file is not a production entrypoint.
const nativeFetch=(window as Window&{eventsTestFetch?:typeof fetch}).eventsTestFetch;if(nativeFetch)window.fetch=nativeFetch;
const shell=document.createElement('div');shell.className='adminShell';Object.assign(shell.style,{display:'block',height:'auto',minHeight:'100vh',overflow:'visible'});
const host=document.createElement('main');host.id='events-browser-fixture';host.className='adminContent';Object.assign(host.style,{margin:'0 auto',padding:'24px',height:'auto',overflow:'visible',maxWidth:'1400px'});
document.getElementById('root')!.hidden=true;document.body.append(shell);shell.append(host);
createRoot(host).render(<I18nProvider><AdminEvents/></I18nProvider>);
