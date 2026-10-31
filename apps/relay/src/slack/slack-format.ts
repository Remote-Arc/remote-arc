/** Convert Arc's Markdown answer into Slack mrkdwn. Slack does not render
 * #-headings, **bold**, [text](url) links or tables, so a raw Markdown answer
 * shows its syntax. Text is HTML-escaped (Slack's only escaping) outside the
 * link tokens we generate; code spans and fences keep their content. */
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const safeUrl=(url:string)=>/^(https?:\/\/|mailto:)/i.test(url)?url.replace(/[|<>\s]/g,encodeURIComponent):null;

function inline(segment:string){
 const tokens:string[]=[];
 const keep=(value:string)=>`\u0000${tokens.push(value)-1}\u0000`;
 let text=segment
  // Code spans first, so nothing inside them is reformatted.
  .replace(/`([^`\n]+)`/g,(_m,code:string)=>keep('`'+escape(code)+'`'))
  .replace(/!?\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,(match,label:string,url:string)=>{const href=safeUrl(url);return href?keep(`<${href}|${escape(label).replace(/\|/g,'¦')}>`):match;});
 text=escape(text)
  .replace(/\*\*\*([^*\n]+)\*\*\*/g,(_m,v:string)=>keep(`*_${v}_*`))
  .replace(/\*\*([^*\n]+)\*\*/g,(_m,v:string)=>keep(`*${v}*`))
  .replace(/__([^_\n]+)__/g,(_m,v:string)=>keep(`*${v}*`))
  .replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,:;!?]|$)/g,(_m,lead:string,v:string)=>lead+keep(`_${v}_`))
  .replace(/~~([^~\n]+)~~/g,(_m,v:string)=>keep(`~${v}~`));
 return text.replace(/\u0000(\d+)\u0000/g,(_m,index:string)=>tokens[Number(index)]!);
}

const tableRow=(line:string)=>/^\s*\|.*\|\s*$/.test(line);
const tableRule=(line:string)=>/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function markdownToSlack(markdown:string){
 const out:string[]=[];let fence=false;
 for(const raw of markdown.replace(/\r\n/g,'\n').split('\n')){
  if(/^\s*```/.test(raw)){fence=!fence;out.push('```');continue;}
  if(fence){out.push(escape(raw));continue;}
  if(tableRule(raw))continue;
  if(tableRow(raw)){out.push(raw.trim().replace(/^\||\|$/g,'').split('|').map(cell=>inline(cell.trim())).join('  ·  '));continue;}
  const heading=raw.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
  if(heading){out.push('*'+inline(heading[1]!).replace(/^\*(.*)\*$/,'$1')+'*');continue;}
  if(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(raw)){out.push('──────');continue;}
  const bullet=raw.match(/^(\s*)[-*+]\s+(.*)$/);
  if(bullet){
   const task=bullet[2]!.match(/^\[([ xX])\]\s+(.*)$/);
   out.push(' '.repeat(Math.min(bullet[1]!.length,8))+(task?(task[1]===' '?'☐ ':'☑ ')+inline(task[2]!):'• '+inline(bullet[2]!)));continue;
  }
  const quote=raw.match(/^\s*>\s?(.*)$/);
  if(quote){out.push('&gt; '+inline(quote[1]!));continue;}
  out.push(inline(raw));
 }
 if(fence)out.push('```');
 return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

/** Keep a Slack message readable: cut at a line boundary, never inside a link
 * or code fence, and say that the rest is in Remote Arc. */
export function fitSlackText(text:string,max:number,more:string){
 if(text.length<=max)return text;
 let cut=text.lastIndexOf('\n',max);
 if(cut<max*0.6)cut=max;
 let head=text.slice(0,cut);
 const open=head.lastIndexOf('<');if(open>head.lastIndexOf('>'))head=head.slice(0,open);
 if((head.match(/```/g)||[]).length%2)head+='\n```';
 return head.trimEnd()+'\n…\n'+more;
}
