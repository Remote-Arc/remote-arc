import React from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '../src/i18n.js';
import {NativeInstall} from '../src/native-install.js';
import '../src/styles.css';
// Browser-only test fixture; not an entry in the production build.
const ready = new URL(location.href).searchParams.get('ready') === '1';
history.replaceState({}, '', localStorage.getItem('remotearc-locale-v2') === 'zh' ? '/zh/downloads' : '/downloads');
window.fetch = async () => Response.json(ready
  ? {available:true,version:'0.6.6',minimumMacOS:'13.0'} : {available:false});
createRoot(document.getElementById('root')!).render(<I18nProvider><NativeInstall/></I18nProvider>);
