import {APP_CATALOG,APP_OPERATIONS} from '../apps/relay/src/apps/app-catalog.js';
import {writeFileSync} from 'node:fs';
const seen=new Set<string>(),duplicates:string[]=[];
for(const operation of APP_OPERATIONS){const key=operation.provider+':'+operation.name;if(seen.has(key))duplicates.push(key);seen.add(key);}
const apps=Object.entries(APP_CATALOG).map(([provider,definition])=>{const tools=APP_OPERATIONS.filter(operation=>operation.provider===provider);return{provider,name:definition.name,total:tools.length,reads:tools.filter(tool=>tool.permission==='read').length,writes:tools.filter(tool=>tool.permission==='write').length};});
if(process.argv.includes('--write')){
 const rows=apps.map(app=>`| ${app.name} | ${app.total} | ${app.reads} | ${app.writes} | ${APP_OPERATIONS.filter(tool=>tool.provider===app.provider&&tool.permission==='write').map(tool=>'`'+tool.name+'`').join(', ')} |`);
 writeFileSync(new URL('../docs/apps-tool-coverage.md',import.meta.url),[
 '# Apps tool coverage', '',
 `${apps.length} Apps, ${APP_OPERATIONS.length} unique native operations, eight categories. Every App has at least eight tools and at least three write tools. Run \`pnpm apps:inventory\` for JSON or append \`--write\` to regenerate this document. The dispatch suite enforces uniqueness and per-App depth.`, '',
 '| App | Tools | Reads | Writes | Available write operations |','| --- | ---: | ---: | ---: | --- |',...rows,'',
 '## Access and verification','',
 'Connect grants are checked at execution. MCP writes require `apps:write`; provider scopes, tenant ownership and installation grants still apply. Existing connections keep their original grants and must explicitly reconnect for newly required scopes. Read-only grants cannot invoke writes. Broad discovery returns compact counts; selected-App discovery returns operation descriptions, permissions and requested scopes. The UI shows write counts, per-tool access badges and read/write filters.','',
 'Tests use actual source, encrypted connections and SQLite with mocked provider HTTP. They validate all operation dispatches, provider contracts, concurrent replay, secret redaction and missing scopes. These checks do not establish real-account acceptance. Provider registration, reviews, eligible account types and credentials gate readiness. Google Slides reuses Google OAuth; the four Microsoft Apps reuse Microsoft OAuth; Dropbox, Asana and Airtable need platform applications.','',
 'Cost ownership and limits remain documented in [Apps expansion](apps-expansion.md) and [Apps cost ownership](apps-cost-ownership.md). Runway estimates are checked before generation; they are not provider-enforced spending caps. Advertising writes pause resources or create labels and do not enable campaigns or change budgets.',''
 ].join('\n'));
}else console.log(JSON.stringify({appCount:apps.length,toolCount:APP_OPERATIONS.length,duplicates,apps},null,2));
if(duplicates.length||apps.some(app=>app.total<8||app.writes<3))process.exitCode=1;
