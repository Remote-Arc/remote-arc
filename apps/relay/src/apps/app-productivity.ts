import {z} from 'zod';
import type {AppOperation, ProviderDefinition, RequestPlan} from './app-catalog.js';

const googleScope='https://www.googleapis.com/auth/';
const microsoft=(name:string,brand:string,category:string,read:string[],write:string[],note:string):ProviderDefinition=>({
  name,brand,category,credential:'MICROSOFT',auth:'oauth',pkce:true,
  authorize:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  token:'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  scopes:{read:['offline_access','User.Read',...read],write},connectionNote:note,
});
export const PRODUCTIVITY_PROVIDERS={
  google_slides:{name:'Google Slides',brand:'googleslides',category:'docs_files',credential:'GOOGLE',auth:'oauth',pkce:true,
    authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',
    scopes:{read:['openid','email',googleScope+'presentations.readonly'],write:[googleScope+'presentations']},
    connectionNote:'Requires the Google Slides API and this connector callback on the dedicated Apps OAuth client. Existing Google connections are not silently upgraded.'} satisfies ProviderDefinition,
  onedrive:microsoft('OneDrive','onedrive','docs_files',['Files.Read'],['Files.ReadWrite'],'Access files granted to your Microsoft account. Sharing and external publication are not included.'),
  microsoft_excel:microsoft('Microsoft Excel','microsoftexcel','docs_files',['Files.ReadWrite'],[], 'Excel Graph tools need delegated Files.ReadWrite even to read worksheets. Use .xlsx workbooks in OneDrive for Business or SharePoint; personal OneDrive workbooks are not supported.'),
  microsoft_teams:microsoft('Microsoft Teams','microsoftteams','communication',['Chat.Read'],['ChatMessage.Send'],'Requires a work or school account and tenant consent. Tools access your existing chats; they do not create teams or add members.'),
  microsoft_todo:microsoft('Microsoft To Do','microsofttodo','email_calendar',['Tasks.Read'],['Tasks.ReadWrite'],'Read lists and tasks, create tasks and update their completion state using your own Microsoft account.'),
  dropbox:{name:'Dropbox',brand:'dropbox',category:'docs_files',credential:'DROPBOX',auth:'oauth',pkce:true,
    authorize:'https://www.dropbox.com/oauth2/authorize',token:'https://api.dropboxapi.com/oauth2/token',
    scopes:{read:['account_info.read','files.metadata.read'],write:['files.content.write']},
    connectionNote:'Authorize the Remote Arc Dropbox app. Its app-folder or full-Dropbox setting bounds every file operation; tools do not publish shared links.'} satisfies ProviderDefinition,
  asana:{name:'Asana',brand:'asana',category:'development',credential:'ASANA',auth:'oauth',pkce:true,
    authorize:'https://app.asana.com/-/oauth_authorize',token:'https://app.asana.com/-/oauth_token',
    scopes:{read:['users:read','workspaces:read','projects:read','tasks:read','stories:read'],write:['tasks:write','stories:write']},
    connectionNote:'Authorize your Asana workspace. The OAuth app must enable these granular scopes and permit distribution to that workspace.'} satisfies ProviderDefinition,
  airtable:{name:'Airtable',brand:'airtable',category:'docs_files',credential:'AIRTABLE',auth:'oauth',pkce:true,
    authorize:'https://airtable.com/oauth2/v1/authorize',token:'https://airtable.com/oauth2/v1/token',
    scopes:{read:['schema.bases:read','data.records:read'],write:['data.records:write']},
    connectionNote:'Choose the bases shared with the OAuth integration. Tools read and edit records only in those granted bases; they do not alter schemas.'} satisfies ProviderDefinition,
};

type Provider=keyof typeof PRODUCTIVITY_PROVIDERS;
const operations:AppOperation[]=[];
const identifier=z.string().min(1).max(512).refine(value=>!/[\r\n\x00]/.test(value)&&value!=='.'&&value!=='..');
const title=z.string().trim().min(1).max(300);
const text=z.string().min(1).max(12000);
const limit=z.number().int().min(1).max(100).default(30);
const obj=<T extends z.ZodRawShape>(shape:T)=>z.object(shape).strict();
const enc=encodeURIComponent;
const url=(base:string,query:Record<string,unknown>={})=>{const value=new URL(base);for(const [key,item] of Object.entries(query))if(item!==undefined)value.searchParams.set(key,String(item));return value.href;};
function op(provider:Provider,name:string,description:string,schema:z.ZodType,request:(args:any)=>RequestPlan,permission:'read'|'write'='read',scopes?:string[]){
  operations.push({provider,name,description,schema,request,permission,...(scopes?{requiredScopes:scopes}:{})});
}
const graph='https://graph.microsoft.com/v1.0';
const file=(id:string)=>graph+'/me/drive/items/'+enc(id);

const slides='https://slides.googleapis.com/v1/presentations';
op('google_slides','presentations.get','Read a presentation, slide IDs, text and revision',obj({id:identifier}),a=>({url:slides+'/'+enc(a.id),method:'GET'}));
op('google_slides','pages.get','Read one slide and its page elements',obj({id:identifier,pageId:identifier}),a=>({url:slides+'/'+enc(a.id)+'/pages/'+enc(a.pageId),method:'GET'}));
op('google_slides','pages.thumbnail','Get the provider-generated thumbnail URL for one slide',obj({id:identifier,pageId:identifier,size:z.enum(['SMALL','MEDIUM','LARGE']).default('MEDIUM')}),a=>({url:url(slides+'/'+enc(a.id)+'/pages/'+enc(a.pageId)+'/thumbnail',{'thumbnailProperties.mimeType':'PNG','thumbnailProperties.thumbnailSize':a.size}),method:'GET'}));
op('google_slides','presentations.create','Create an empty Google Slides presentation',obj({title}),a=>({url:slides,method:'POST',body:{title:a.title}}),'write');
op('google_slides','slides.create','Add a blank slide to an existing presentation',obj({id:identifier,objectId:z.string().regex(/^[A-Za-z_][A-Za-z0-9_:-]{4,49}$/),index:z.number().int().nonnegative().optional(),revision:identifier.optional()}),a=>({url:slides+'/'+enc(a.id)+':batchUpdate',method:'POST',body:{requests:[{createSlide:{objectId:a.objectId,...(a.index===undefined?{}:{insertionIndex:a.index}),slideLayoutReference:{predefinedLayout:'BLANK'}}}],...(a.revision?{writeControl:{requiredRevisionId:a.revision}}:{})}}),'write');
op('google_slides','text.replaceAll','Replace matching presentation text with optional revision fencing',obj({id:identifier,find:text,replace:z.string().max(12000),matchCase:z.boolean().default(true),revision:identifier.optional()}),a=>({url:slides+'/'+enc(a.id)+':batchUpdate',method:'POST',body:{requests:[{replaceAllText:{containsText:{text:a.find,matchCase:a.matchCase},replaceText:a.replace}}],...(a.revision?{writeControl:{requiredRevisionId:a.revision}}:{})}}),'write');

op('onedrive','drive.get','Read the signed-in account drive and quota',obj({}),()=>({url:graph+'/me/drive',method:'GET'}));
op('onedrive','files.list','List one folder or the root folder',obj({folderId:identifier.optional(),limit}),a=>({url:url(a.folderId?file(a.folderId)+'/children':graph+'/me/drive/root/children',{'$top':a.limit,'$select':'id,name,size,webUrl,file,folder,lastModifiedDateTime'}),method:'GET'}));
op('onedrive','files.get','Read file metadata and its web link',obj({id:identifier}),a=>({url:file(a.id),method:'GET'}));
op('onedrive','files.search','Search files available in your drive',obj({query:z.string().trim().min(1).max(200),limit}),a=>({url:url(graph+'/me/drive/root/search(q=\''+enc(a.query.replaceAll("'","''"))+'\')',{'$top':a.limit}),method:'GET'}));
const fileName=z.string().trim().min(1).max(240).refine(value=>!/[\\/\x00-\x1f]/.test(value)&&value!=='.'&&value!=='..');
op('onedrive','folders.create','Create a named folder and fail if that name already exists',obj({parentId:identifier.optional(),name:fileName}),a=>({url:a.parentId?file(a.parentId)+'/children':graph+'/me/drive/root/children',method:'POST',body:{name:a.name,folder:{},'@microsoft.graph.conflictBehavior':'fail'}}),'write');
op('onedrive','files.rename','Rename one file or folder with an optional current ETag',obj({id:identifier,name:fileName,etag:identifier.optional()}),a=>({url:file(a.id),method:'PATCH',body:{name:a.name},...(a.etag?{headers:{'if-match':a.etag}}:{})}),'write');

const workbook=(id:string)=>file(id)+'/workbook';
const sheet=(a:{id:string;sheet:string})=>workbook(a.id)+'/worksheets/'+enc(a.sheet);
const cell=z.union([z.string().max(8000),z.number().finite(),z.boolean(),z.null()]);
const matrix=z.array(z.array(cell).min(1).max(50)).min(1).max(200).refine(rows=>rows.every(row=>row.length===rows[0]!.length),'Rows must have the same width');
export function excelRangeSize(value:string){
 const endpoints=value.toUpperCase().split(':').map(cell=>{const match=/^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(cell);if(!match)return null;return{column:[...match[1]!].reduce((sum,char)=>sum*26+char.charCodeAt(0)-64,0),row:Number(match[2])};});
 const first=endpoints[0],last=endpoints.length===1?first:endpoints[1];
 if(!first||!last||endpoints.length>2||last.column>16384||last.row>1048576)return null;
 const rows=last.row-first.row+1,columns=last.column-first.column+1;
 return rows>0&&rows<=200&&columns>0&&columns<=50?{rows,columns}:null;
}
export const excelRange=z.string().refine(value=>excelRangeSize(value)!==null,'Use an ordered A1 range of at most 200 rows and 50 columns within Excel limits');
op('microsoft_excel','worksheets.list','List worksheets in an existing .xlsx workbook',obj({id:identifier}),a=>({url:workbook(a.id)+'/worksheets',method:'GET'}));
op('microsoft_excel','worksheets.get','Read one worksheet and its visibility',obj({id:identifier,sheet:identifier}),a=>({url:sheet(a),method:'GET'}));
op('microsoft_excel','ranges.get','Read a bounded A1 range with values, formulas and formats',obj({id:identifier,sheet:identifier,address:excelRange}),a=>({url:sheet(a)+"/range(address='"+a.address+"')",method:'GET'}));
op('microsoft_excel','worksheets.create','Add a named worksheet to an existing workbook',obj({id:identifier,name:title}),a=>({url:workbook(a.id)+'/worksheets/add',method:'POST',body:{name:a.name}}),'write',['Files.ReadWrite']);
op('microsoft_excel','ranges.update','Write a bounded rectangular array of cell values matching the selected range',obj({id:identifier,sheet:identifier,address:excelRange,values:matrix}).refine(a=>{const size=excelRangeSize(a.address);return !!size&&a.values.length===size.rows&&a.values.every(row=>row.length===size.columns);},'Values must match the selected range dimensions'),a=>({url:sheet(a)+"/range(address='"+a.address+"')",method:'PATCH',body:{values:a.values}}),'write',['Files.ReadWrite']);
op('microsoft_excel','tables.list','List workbook tables with their names and IDs',obj({id:identifier}),a=>({url:workbook(a.id)+'/tables',method:'GET'}));

op('microsoft_teams','chats.list','List existing chats for the signed-in work or school account',obj({limit:z.number().int().min(1).max(50).default(25)}),a=>({url:url(graph+'/me/chats',{'$top':a.limit}),method:'GET'}),'read',['Chat.Read']);
op('microsoft_teams','chats.get','Read an existing chat and its topic',obj({chatId:identifier}),a=>({url:graph+'/chats/'+enc(a.chatId),method:'GET'}),'read',['Chat.Read']);
op('microsoft_teams','members.list','List members of a chat you can access',obj({chatId:identifier}),a=>({url:graph+'/chats/'+enc(a.chatId)+'/members',method:'GET'}),'read',['Chat.Read']);
op('microsoft_teams','messages.list','Read recent messages in one existing chat',obj({chatId:identifier,limit:z.number().int().min(1).max(50).default(25)}),a=>({url:url(graph+'/chats/'+enc(a.chatId)+'/messages',{'$top':a.limit}),method:'GET'}),'read',['Chat.Read']);
op('microsoft_teams','messages.get','Read a specific chat message and its web URL',obj({chatId:identifier,id:identifier}),a=>({url:graph+'/chats/'+enc(a.chatId)+'/messages/'+enc(a.id),method:'GET'}),'read',['Chat.Read']);
op('microsoft_teams','messages.send','Send the requested plain text to an existing chat',obj({chatId:identifier,text}),a=>({url:graph+'/chats/'+enc(a.chatId)+'/messages',method:'POST',body:{body:{contentType:'text',content:a.text}}}),'write',['ChatMessage.Send']);

const todo=graph+'/me/todo/lists';
op('microsoft_todo','lists.list','List your Microsoft To Do task lists',obj({limit}),a=>({url:url(todo,{'$top':a.limit}),method:'GET'}));
op('microsoft_todo','lists.get','Read one task list',obj({listId:identifier}),a=>({url:todo+'/'+enc(a.listId),method:'GET'}));
op('microsoft_todo','tasks.list','List tasks within one task list',obj({listId:identifier,limit}),a=>({url:url(todo+'/'+enc(a.listId)+'/tasks',{'$top':a.limit}),method:'GET'}));
op('microsoft_todo','tasks.get','Read a task including notes and completion state',obj({listId:identifier,id:identifier}),a=>({url:todo+'/'+enc(a.listId)+'/tasks/'+enc(a.id),method:'GET'}));
op('microsoft_todo','lists.create','Create a task list',obj({name:title}),a=>({url:todo,method:'POST',body:{displayName:a.name}}),'write');
op('microsoft_todo','tasks.create','Create a task in an existing list',obj({listId:identifier,title,notes:z.string().max(12000).optional(),importance:z.enum(['low','normal','high']).default('normal')}),a=>({url:todo+'/'+enc(a.listId)+'/tasks',method:'POST',body:{title:a.title,importance:a.importance,...(a.notes===undefined?{}:{body:{contentType:'text',content:a.notes}})}}),'write');
op('microsoft_todo','tasks.update','Update task text or completion state',obj({listId:identifier,id:identifier,title:title.optional(),status:z.enum(['notStarted','inProgress','completed','waitingOnOthers','deferred']).optional(),notes:z.string().max(12000).optional()}).refine(a=>a.title!==undefined||a.status!==undefined||a.notes!==undefined),a=>({url:todo+'/'+enc(a.listId)+'/tasks/'+enc(a.id),method:'PATCH',body:{...(a.title===undefined?{}:{title:a.title}),...(a.status===undefined?{}:{status:a.status}),...(a.notes===undefined?{}:{body:{contentType:'text',content:a.notes}})}}),'write');

const dropbox='https://api.dropboxapi.com/2';
const dbxPath=z.string().max(1000).refine(value=>value===''||value.startsWith('/')||/^id:[^\r\n]+$/.test(value)).refine(value=>!/[\x00-\x1f]/.test(value)&&!value.split('/').some(part=>part==='..'||part==='.'));
op('dropbox','files.list','List folder entries with an opaque continuation cursor',obj({path:dbxPath.default(''),limit,recursive:z.boolean().default(false)}),a=>({url:dropbox+'/files/list_folder',method:'POST',body:{path:a.path,limit:a.limit,recursive:a.recursive}}));
op('dropbox','files.continue','Continue a previous folder listing with its exact returned cursor',obj({cursor:identifier}),a=>({url:dropbox+'/files/list_folder/continue',method:'POST',body:{cursor:a.cursor}}));
op('dropbox','files.get','Read file or folder metadata without downloading content',obj({path:dbxPath}),a=>({url:dropbox+'/files/get_metadata',method:'POST',body:{path:a.path}}));
op('dropbox','files.search','Search names of files in the authorized Dropbox scope',obj({query:z.string().trim().min(1).max(500),limit}),a=>({url:dropbox+'/files/search_v2',method:'POST',body:{query:a.query,options:{max_results:a.limit,filename_only:true}}}));
op('dropbox','folders.create','Create a folder without automatically renaming conflicts',obj({path:dbxPath.refine(value=>value.startsWith('/')&&value.length>1)}),a=>({url:dropbox+'/files/create_folder_v2',method:'POST',body:{path:a.path,autorename:false}}),'write');
op('dropbox','files.move','Move or rename an existing Dropbox item without overwriting conflicts',obj({fromPath:dbxPath.refine(value=>value.length>0),toPath:dbxPath.refine(value=>value.startsWith('/')&&value.length>1)}),a=>({url:dropbox+'/files/move_v2',method:'POST',body:{from_path:a.fromPath,to_path:a.toPath,autorename:false,allow_ownership_transfer:false}}),'write');

const asana='https://app.asana.com/api/1.0';
const gid=z.string().regex(/^\d{1,30}$/);
op('asana','workspaces.list','List Asana workspaces available to your account',obj({limit,offset:identifier.optional()}),a=>({url:url(asana+'/workspaces',{limit:a.limit,offset:a.offset}),method:'GET'}),'read',['workspaces:read']);
op('asana','projects.list','List projects in an authorized workspace',obj({workspace:gid,limit,offset:identifier.optional()}),a=>({url:url(asana+'/workspaces/'+a.workspace+'/projects',{limit:a.limit,offset:a.offset,archived:false}),method:'GET'}),'read',['projects:read']);
op('asana','tasks.list','List tasks in an existing Asana project',obj({project:gid,limit,offset:identifier.optional()}),a=>({url:url(asana+'/projects/'+a.project+'/tasks',{limit:a.limit,offset:a.offset,opt_fields:'name,completed,due_on,assignee.name,permalink_url'}),method:'GET'}),'read',['tasks:read']);
op('asana','tasks.get','Read one task with notes, status and permalink',obj({id:gid}),a=>({url:url(asana+'/tasks/'+a.id,{opt_fields:'name,notes,completed,due_on,assignee.name,projects.name,permalink_url'}),method:'GET'}),'read',['tasks:read']);
op('asana','tasks.create','Create a task in an authorized project',obj({project:gid,name:title,notes:z.string().max(12000).optional(),dueOn:z.iso.date().optional()}),a=>({url:asana+'/tasks',method:'POST',body:{data:{name:a.name,projects:[a.project],...(a.notes===undefined?{}:{notes:a.notes}),...(a.dueOn?{due_on:a.dueOn}:{})}}}),'write',['tasks:write']);
op('asana','tasks.update','Update an existing task name, notes or completion state',obj({id:gid,name:title.optional(),notes:z.string().max(12000).optional(),completed:z.boolean().optional()}).refine(a=>a.name!==undefined||a.notes!==undefined||a.completed!==undefined),a=>({url:asana+'/tasks/'+a.id,method:'PUT',body:{data:{...(a.name===undefined?{}:{name:a.name}),...(a.notes===undefined?{}:{notes:a.notes}),...(a.completed===undefined?{}:{completed:a.completed})}}}),'write',['tasks:write']);
op('asana','stories.list','Read comments and activity for one task',obj({id:gid,limit,offset:identifier.optional()}),a=>({url:url(asana+'/tasks/'+a.id+'/stories',{limit:a.limit,offset:a.offset}),method:'GET'}),'read',['stories:read']);
op('asana','comments.create','Add the requested comment to an existing Asana task',obj({id:gid,text}),a=>({url:asana+'/tasks/'+a.id+'/stories',method:'POST',body:{data:{text:a.text}}}),'write',['stories:write']);

const airtable='https://api.airtable.com/v0';
const baseId=z.string().regex(/^app[A-Za-z0-9]{14}$/),tableId=z.string().regex(/^tbl[A-Za-z0-9]{14}$/),recordId=z.string().regex(/^rec[A-Za-z0-9]{14}$/);
const fields=z.record(z.string().min(1).max(200),z.union([z.string().max(12000),z.number().finite(),z.boolean(),z.null(),z.array(z.string().max(1000)).max(50)])).refine(value=>Object.keys(value).length>0&&Object.keys(value).length<=50);
op('airtable','bases.list','List only bases granted to this OAuth integration',obj({offset:identifier.optional()}),a=>({url:url(airtable+'/meta/bases',{offset:a.offset}),method:'GET'}),'read',['schema.bases:read']);
op('airtable','tables.list','Read table and field schemas for an authorized base',obj({baseId}),a=>({url:airtable+'/meta/bases/'+a.baseId+'/tables',method:'GET'}),'read',['schema.bases:read']);
op('airtable','records.list','Read a page of table records, optionally filtered by an Airtable formula',obj({baseId,tableId,limit,offset:identifier.optional(),filterFormula:z.string().max(2000).optional()}),a=>({url:url(airtable+'/'+a.baseId+'/'+a.tableId,{pageSize:a.limit,offset:a.offset,filterByFormula:a.filterFormula}),method:'GET'}),'read',['data.records:read']);
op('airtable','records.get','Read one record and its field values',obj({baseId,tableId,id:recordId}),a=>({url:airtable+'/'+a.baseId+'/'+a.tableId+'/'+a.id,method:'GET'}),'read',['data.records:read']);
op('airtable','records.create','Create up to ten records without enabling field type coercion',obj({baseId,tableId,records:z.array(obj({fields})).min(1).max(10)}),a=>({url:airtable+'/'+a.baseId+'/'+a.tableId,method:'POST',body:{records:a.records,typecast:false}}),'write',['data.records:write']);
op('airtable','records.update','Update up to ten identified records without replacing other fields',obj({baseId,tableId,records:z.array(obj({id:recordId,fields})).min(1).max(10)}),a=>({url:airtable+'/'+a.baseId+'/'+a.tableId,method:'PATCH',body:{records:a.records,typecast:false}}),'write',['data.records:write']);

export const PRODUCTIVITY_OPERATIONS=operations;
