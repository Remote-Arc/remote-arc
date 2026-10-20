import type {ArcMention} from './arc-skill-mentions.js';
import {TeamAvatar} from './arc-team-avatar.js';
import {ProductIcon} from './product-icon.js';
const brands:Record<string,string>={gmail:'gmail',github:'github',slack:'slack',notion:'notion',vercel:'vercel',outlook:'microsoftoutlook',microsoft_outlook:'microsoftoutlook',google_drive:'googledrive',google_docs:'googledocs',google_sheets:'googlesheets',google_calendar:'googlecalendar',googledrive:'googledrive',googledocs:'googledocs',googlesheets:'googlesheets',googlecalendar:'googlecalendar',linear:'linear',jira:'jira'};
export function ArcReferenceIcon({item}:{item:ArcMention}){
 if(item.kind==='employee')return <TeamAvatar employee={{name:item.name,avatar:item.avatar||{kind:'initials',color:'#446655'}}} size={18}/>;
 const brand=item.kind==='app'?brands[item.provider||'']:null;
 return <span className="arcReferenceIcon" aria-hidden="true">{brand?<img src={'/app-brands/'+brand+'.svg'} width={18} height={18} alt=""/>:item.kind==='skill'&&item.id.startsWith('community-')?<img src="/app-brands/github.svg" width={16} height={16} alt=""/>:item.kind==='skill'&&item.id.startsWith('arc-')?<img src="/remote-arc.svg" width={18} height={18} alt=""/>:<ProductIcon name={item.kind==='app'?'apps':'book'} size={17}/>}</span>;
}
