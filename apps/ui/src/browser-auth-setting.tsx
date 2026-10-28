import React,{useEffect,useState} from "react";
import {useI18n} from "./i18n.js";
async function requestJSON(path:string,init?:RequestInit):Promise<Auth> {
 const response=await fetch(path,{...init,credentials:"same-origin",cache:"no-store"});
 if(!response.ok)throw new Error("request_failed");
 return response.json();
}
type Auth={otp:boolean;captcha:boolean;origins:string[];mailbox:string};
const empty:Auth={otp:false,captcha:false,origins:[],mailbox:""};
export function BrowserAuthSetting({deviceId,browserExtension=false}:{deviceId:string;browserExtension?:boolean}) {
 const {tr}=useI18n();
 const [draft,setDraft]=useState<Auth>(empty),[sites,setSites]=useState(""),[ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{
  let live=true;setReady(false);setMessage("");
  void requestJSON("/api/browser-auth/"+encodeURIComponent(deviceId)).then(value=>{
   if(live){setDraft(value);setSites(value.origins.join("\n"));setReady(true);}
  }).catch(()=>{if(live)setMessage(tr("Could not load authentication permissions.","无法读取认证权限。"));});
  return()=>{live=false;};
 },[deviceId]);
 async function save(revoke=false) {
  setBusy(true);setMessage("");
  try {
   const value:Auth=revoke?empty:{...draft,origins:sites.split(/[\n,]/).map(s=>s.trim()).filter(Boolean)};
   const saved=await requestJSON("/api/browser-auth/"+encodeURIComponent(deviceId),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)});
   setDraft(saved);setSites(saved.origins.join("\n"));
   setMessage(revoke?tr("Authentication permission revoked.","已撤销认证权限。"):tr("Approved. Your AI can continue on these sites.","已批准，AI 可以在这些网站继续操作。"));
  }catch{setMessage(tr("Could not save. Use full website origins, for example https://www.seek.co.nz.","保存失败，请填写完整的网站来源，例如 https://www.seek.co.nz。"));}
  finally{setBusy(false);}
 }
 return <div className="runnerSetting browserAuthSetting">
  <strong>{tr("Browser authentication","浏览器认证授权")}</strong>
  <p>{tr("Approve OTP sign-in and registration, and CAPTCHA interaction on the websites below. Permissions apply on this device and can be revoked here.","批准 AI 在下列网站使用 OTP 验证码登录、注册及操作 CAPTCHA。授权仅在此设备生效，可随时在此撤销。")}</p>
  <label><input type="checkbox" checked={draft.otp} disabled={!ready||busy} onChange={e=>setDraft({...draft,otp:e.target.checked})}/>{tr("OTP sign-in and registration","OTP 验证码登录与注册")}</label>
  {!browserExtension&&<label><input type="checkbox" checked={draft.captcha} disabled={!ready||busy} onChange={e=>setDraft({...draft,captcha:e.target.checked})}/>{tr("CAPTCHA, including embedded verification providers","CAPTCHA 验证（含嵌入的验证服务）")}</label>}
  {browserExtension&&<small>{tr("For CAPTCHA challenges, use Browser Runner on a linked computer.","CAPTCHA 挑战请使用已连接电脑上的 Browser Runner。")}</small>}
  <label><span>{tr("Approved websites, one origin per line","批准的网站，每行一个来源")}</span><textarea value={sites} rows={3} placeholder="https://www.seek.co.nz" disabled={!ready||busy} onChange={e=>setSites(e.target.value)}/></label>
  <label><span>{tr("Code mailbox (optional)","接收验证码的邮箱（可选）")}</span><input type="email" value={draft.mailbox} disabled={!ready||busy} onChange={e=>setDraft({...draft,mailbox:e.target.value})}/></label>
  <small>{tr("Your connected mail app supplies the code under its own permissions. Codes and CAPTCHA response tokens are never saved in browser task logs. A final application or purchase still needs its own approval.","验证码由已连接的邮箱应用按其权限读取。浏览器任务日志不保存验证码或 CAPTCHA 响应令牌。最终申请或购买仍需单独授权。")}</small>
  <div><button className="primaryButton" disabled={!ready||busy} onClick={()=>void save()}>{busy?tr("Saving…","保存中…"):tr("Approve and save","批准并保存")}</button>{" "}<button className="ghostButton" disabled={!ready||busy} onClick={()=>void save(true)}>{tr("Revoke","撤销")}</button></div>
  {message&&<small role="status">{message}</small>}
 </div>;
}
