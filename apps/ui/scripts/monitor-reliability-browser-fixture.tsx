import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider,useI18n} from '../src/i18n.js';
import {MonitorReliability} from '../src/dashboard/monitor-reliability.js';
import type {MonitorState} from '../src/app-types.js';
import '../src/styles.css';
// Local browser regression entry only. It is never part of a production entry.
const nativeFetch=(window as Window&{monitorTestFetch?:typeof fetch}).monitorTestFetch;
if(nativeFetch)window.fetch=nativeFetch;
function Fixture(){
  const {tr}=useI18n(),[state,setState]=useState<MonitorState['deviceReliability']>();
  useEffect(()=>{void fetch('/api/monitor').then(r=>r.json()).then(value=>setState(value.deviceReliability));},[]);
  return <MonitorReliability state={state} tr={tr}/>;
}
document.getElementById('root')!.hidden=true;
const host=document.createElement('main');host.id='monitor-browser-fixture';
Object.assign(host.style,{padding:'16px',maxWidth:'1000px',margin:'0 auto'});document.body.append(host);
createRoot(host).render(<I18nProvider><Fixture/></I18nProvider>);
