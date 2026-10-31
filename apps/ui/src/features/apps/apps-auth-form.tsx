import { useState, type FormEvent } from "react";
import { useI18n } from "../../app/i18n.js";
export type AppCredentialInput={credential:string;permissions:("read"|"write")[];settings:Record<string,string>;dailyCallLimit:number;usageConsent:true};
export function AppCredentialForm({provider,write,busy,onConnect,onCancel}:{provider:string;write:boolean;busy:boolean;onConnect:(input:AppCredentialInput)=>Promise<boolean>;onCancel:()=>void}){
 const{tr}=useI18n(),[credential,setCredential]=useState(""),[businessAccountId,setBusinessAccountId]=useState(""),[phoneNumberId,setPhoneNumberId]=useState(""),[dailyCallLimit,setDailyCallLimit]=useState(25),[consent,setConsent]=useState(false);
 async function submit(event:FormEvent){event.preventDefault();if(!consent||busy||!credential.trim())return;try{const ok=await onConnect({credential:credential.trim(),permissions:write?["read","write"]:["read"],settings:provider==="whatsapp"?{businessAccountId,phoneNumberId}:{},dailyCallLimit,usageConsent:true});if(ok)onCancel();}finally{setCredential("");setConsent(false);}}
 return <form className="appsCredentialForm" onSubmit={event=>void submit(event)}>
 <fieldset disabled={busy}><legend>{tr("Connect your API account","连接你的 API 账号")}</legend>
 <label>{provider==="x"?tr("OAuth 2.0 user access token","OAuth 2.0 用户访问令牌"):tr("API key or access token","API 密钥或访问令牌")}<input type="password" name="api-credential" value={credential} onChange={e=>setCredential(e.target.value)} required minLength={10} maxLength={4096} autoComplete="off" spellCheck={false}/></label>
 {provider==="whatsapp"&&<><label>{tr("WhatsApp Business account ID","WhatsApp Business 账号 ID")}<input value={businessAccountId} onChange={e=>setBusinessAccountId(e.target.value)} required inputMode="numeric" pattern="[0-9]{1,30}"/></label><label>{tr("Phone number ID","电话号码 ID")}<input value={phoneNumberId} onChange={e=>setPhoneNumberId(e.target.value)} required inputMode="numeric" pattern="[0-9]{1,30}"/></label></>}
 <label>{tr("Daily operation limit","每日操作上限")}<input type="number" value={dailyCallLimit} onChange={e=>setDailyCallLimit(Number(e.target.value))} min={1} max={1000} required/></label>
  <label className="appsCredentialConsent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>{tr("I authorize account validation and API usage within this daily limit, including actions that make changes. Provider charges apply to my account.","我授权进行账号验证，并在此每日上限内使用 API，包括更改操作。服务费用按我的账号计费。")}</span></label>
 </fieldset><p>{tr("Your credential is encrypted on the server and never included in AI tool arguments.","凭据在服务端加密保存，不会作为 AI 工具参数。")}</p>
 <div><button className="appsManagerPrimary" type="submit" disabled={busy||!consent||!credential.trim()}>{tr("Validate & connect","验证并连接")}</button><button type="button" disabled={busy} onClick={()=>{setCredential("");onCancel();}}>{tr("Cancel","取消")}</button></div>
 </form>;
}
