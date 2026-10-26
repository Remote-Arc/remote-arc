import React from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../src/i18n.js';
import {AdminEvents} from '../src/admin/admin-events.js';
import '../src/admin/admin-console.css';
import '../src/admin/admin-design.css';
// Browser-only local regression fixture. This file is not a production entrypoint.
const nativeFetch=(window as Window&{eventsTestFetch?:typeof fetch}).eventsTestFetch;if(nativeFetch)window.fetch=nativeFetch;
const host=document.createElement('main');host.id='events-browser-fixture';host.className='adminContent';host.style.margin='0';host.style.padding='20px';
document.getElementById('root')!.hidden=true;document.body.append(host);
createRoot(host).render(<I18nProvider><AdminEvents/></I18nProvider>);
