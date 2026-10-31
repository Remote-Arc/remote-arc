import {useState} from 'react';
import {useI18n} from '../../../app/i18n.js';
import previewLogo from '../../../../public/remote-arc-192.png?inline';

// Input is the escaped HTML produced by renderFollowupEmail or its saved snapshot.
// Keep scripts, forms and same-origin access disabled. User-clicked links open a
// separate tab so the official site cannot replace (and break) the preview.
export function FollowupEmailPreview({html,title}:{html:string;title:string}){
 const {tr}=useI18n(),[revision,setRevision]=useState(0);
 const document=html.replaceAll('<a href=','<a target="_blank" rel="noopener noreferrer" href=').replace('src="https://remotearc.app/remote-arc-192.png"','src="'+previewLogo+'"');
 return <div className="adminFollowupPreview"><div className="adminFollowupPreviewToolbar"><span>{tr('Preview links open in a new tab.','预览中的链接在新标签页打开。')}</span><button type="button" className="adminOutlineBtn" onClick={()=>setRevision(value=>value+1)}>{tr('Reload preview','重新加载预览')}</button></div><iframe key={revision} className="adminFollowupEmailPreview" title={title} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={document}/></div>;
}
