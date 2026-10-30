type SourceObservation={role:string;tool?:string;status?:string;result?:unknown};
/** Mail URLs come from the read workflow, never from generated citations. */
export function withArcInboxSources(answer:string,history:SourceObservation[]){
 const sources=new Map<string,string>();
 for(const message of history){
  if(message.role!=='tool'||message.tool!=='read_inbox'||message.status!=='completed')continue;
  let result=message.result;try{if(typeof result==='string')result=JSON.parse(result);}catch{continue;}
  if(!result||typeof result!=='object'||!('messages' in result)||!Array.isArray(result.messages))continue;
  for(const mail of result.messages){
   if(!mail||typeof mail.url!=='string'||typeof mail.subject!=='string')continue;
   let canonicalUrl:string;
   try{const url=new URL(mail.url);if(url.protocol!=='https:'||!['mail.google.com','outlook.live.com','outlook.office.com','outlook.office365.com'].includes(url.hostname)||url.username||url.password)continue;canonicalUrl=url.href;}catch{continue;}
   if(!answer.includes(canonicalUrl))sources.set(canonicalUrl,mail.subject.replace(/[\[\]\\<>\r\n]/g,' ').slice(0,120)||'Email');
  }
 }
 if(!sources.size)return answer;
 return answer+'\n\n'+(/[\u3400-\u9fff]/.test(answer)?'邮件来源：':'Email sources:')+'\n'+[...sources].slice(0,5).map(([url,label])=>'- ['+label+']('+url.replace(/[()]/g,char=>char==='('?'%28':'%29')+')').join('\n');
}
