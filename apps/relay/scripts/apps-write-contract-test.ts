import assert from 'node:assert/strict';
import {appOperation,type AppProvider} from '../src/app-catalog.js';
import {excelRangeSize} from '../src/app-productivity.js';
import {quoteAppOperation,redactProviderCredentials,validateAppResult} from '../src/app-connection-policy.js';

function plan(provider:AppProvider,name:string,args:unknown,context?:any){const operation=appOperation(provider,name);return operation.request(operation.schema.parse(args),context);}
function invalid(provider:AppProvider,name:string,args:unknown){assert.throws(()=>plan(provider,name,args));}

// Optional fields must preserve omission, false and empty text independently.
const slide=plan('google_slides','slides.create',{id:'deck',objectId:'slide_1',index:0,revision:'rev'});
assert.equal(slide.body.requests[0].createSlide.insertionIndex,0);
assert.deepEqual(slide.body.writeControl,{requiredRevisionId:'rev'});
assert.equal(plan('google_slides','slides.create',{id:'deck',objectId:'slide_2'}).body.writeControl,undefined);
assert.equal(plan('google_slides','text.replaceAll',{id:'deck',find:'old',replace:'',matchCase:false,revision:'rev'}).body.requests[0].replaceAllText.containsText.matchCase,false);
assert.equal(plan('google_slides','text.replaceAll',{id:'deck',find:'old',replace:''}).body.writeControl,undefined);
assert.match(plan('onedrive','files.list',{folderId:'folder / one'}).url,/items\/folder%20%2F%20one\/children/);
assert.match(plan('onedrive','files.list',{}).url,/root\/children/);
assert.match(plan('onedrive','folders.create',{parentId:'parent',name:'Reports'}).url,/items\/parent\/children/);
assert.match(plan('onedrive','folders.create',{name:'Reports'}).url,/root\/children/);
assert.deepEqual(plan('onedrive','files.rename',{id:'file',name:'new',etag:'"rev"'}).headers,{'if-match':'"rev"'});
assert.equal(plan('onedrive','files.rename',{id:'file',name:'new'}).headers,undefined);
invalid('onedrive','files.rename',{id:'file',name:'../secret'});
invalid('onedrive','files.get',{id:'..'});
assert.equal(excelRangeSize('A1')?.columns,1);
assert.deepEqual(excelRangeSize('a1:ax200'),{rows:200,columns:50});
for(const value of ['','A0','A1:A201','A1:AY1','B2:A1','A1:A1:A1','XFE1','XFD1048577','A1048577','A99999999','A1\'','A1:B0'])assert.equal(excelRangeSize(value),null,value);
invalid('microsoft_excel','ranges.update',{id:'book',sheet:'Sheet1',address:'A1:B2',values:[[1,2]]});
invalid('microsoft_excel','ranges.update',{id:'book',sheet:'Sheet1',address:'A1:B2',values:[[1,2],[3]]});
invalid('microsoft_excel','ranges.get',{id:'book',sheet:'Sheet1',address:'A1:XFD1048576'});
invalid('microsoft_excel','tables.create',{id:'book',sheet:'Sheet1',address:'A1:A201'});
assert.deepEqual(plan('microsoft_excel','ranges.update',{id:'book',sheet:'Sheet1',address:'A1:B1',values:[[0,false]]}).body,{values:[[0,false]]});
assert.equal(plan('microsoft_todo','tasks.create',{listId:'list',title:'Task'}).body.body,undefined);
assert.deepEqual(plan('microsoft_todo','tasks.create',{listId:'list',title:'Task',notes:''}).body.body,{contentType:'text',content:''});
for(const update of [{title:'Changed'},{status:'completed'},{notes:''}])assert(Object.keys(plan('microsoft_todo','tasks.update',{listId:'list',id:'task',...update}).body).length===1);
invalid('microsoft_todo','tasks.update',{listId:'list',id:'task'});
assert.deepEqual(plan('asana','tasks.create',{project:'123',name:'Task'}).body,{data:{name:'Task',projects:['123']}});
assert.equal(plan('asana','tasks.create',{project:'123',name:'Task',notes:'',dueOn:'2026-10-21'}).body.data.due_on,'2026-10-21');
for(const update of [{name:'Changed'},{notes:''},{completed:false}])assert(Object.keys(plan('asana','tasks.update',{id:'123',...update}).body.data).length===1);
invalid('asana','tasks.update',{id:'123'});
assert.equal(new URL(plan('asana','workspaces.list',{offset:'next'}).url).searchParams.get('offset'),'next');
assert.equal(new URL(plan('asana','workspaces.list',{}).url).searchParams.has('offset'),false);
assert.equal(plan('dropbox','files.list',{}).body.path,'');
assert.equal(plan('dropbox','files.get',{path:'id:abc'}).body.path,'id:abc');
for(const path of ['/../file','/./file','/bad\nfile','relative'])invalid('dropbox','files.get',{path});
invalid('airtable','records.create',{baseId:'app00000000000001',tableId:'tbl00000000000001',records:[{fields:{}}]});

// Advertising writes never enable delivery or change money fields.
for(const [name,args] of [['campaigns.pause',{customerId:'1',campaignId:'2',loginCustomerId:'3'}],['adGroups.pause',{customerId:'1',adGroupId:'2'}],['ads.pause',{customerId:'1',adGroupId:'2',adId:'3'}]] as const){
 const request=plan('google_ads',name,args);assert.match(new URL(request.url).pathname,/^\/v26\/customers\//);assert.deepEqual(request.body.operations[0].update.status,'PAUSED');assert.equal(request.body.operations[0].updateMask,'status');assert.equal(request.body.partialFailure,false);
}
assert.equal(plan('google_ads','campaigns.pause',{customerId:'1',campaignId:'2',loginCustomerId:'3'}).headers?.['login-customer-id'],'3');
assert.equal(plan('google_ads','campaigns.pause',{customerId:'1',campaignId:'2'}).headers,undefined);
assert.throws(()=>validateAppResult('google_ads','campaigns.pause',{partialFailureError:{code:3}}),/app_provider_rejected/);
assert.throws(()=>validateAppResult('linear','comments.create',{data:{commentCreate:{success:false}}}),/app_provider_rejected/);
assert.throws(()=>validateAppResult('shopify','products.update',{data:{productUpdate:{userErrors:[{message:'Rejected'}]}}}),/app_provider_rejected/);
for(const name of ['images.generate','videos.fromImage'])assert.throws(()=>validateAppResult('runway',name,{}),/app_invalid_provider_response/);
assert.throws(()=>quoteAppOperation(appOperation('runway','images.generate'),{maxCredits:4}),/app_cost_limit/);
assert.throws(()=>quoteAppOperation(appOperation('runway','videos.fromImage'),{duration:10,maxCredits:49}),/app_cost_limit/);
assert.equal(quoteAppOperation(appOperation('runway','videos.fromImage'),{duration:5,maxCredits:25})?.estimatedUnits,25);

// Installation and tenant boundaries apply to the new writes as well as reads.
const installation={vercelConfigurationId:'icfg_1',vercelTeamId:'team_1'};
assert.equal(new URL(plan('vercel','env.create',{projectId:'project',key:'KEY',value:'private',target:['preview']},installation).url).searchParams.get('teamId'),'team_1');
assert.throws(()=>plan('vercel','env.delete',{projectId:'project',envId:'env',teamId:'team_other'},installation),/app_resource_not_authorized/);
assert.deepEqual(redactProviderCredentials({value:'secret',nested:[{decrypted:'secret',key:'KEY',access_token:'secret'}]},['value','decrypted']),{nested:[{key:'KEY'}]});
assert.throws(()=>plan('jira','issues.update',{cloudId:'11111111-1111-4111-8111-111111111111',issueId:'PROJ-1',summary:'Title',description:'Text'}),/app_resource_not_authorized/);
assert.throws(()=>plan('confluence','pages.delete',{cloudId:'11111111-1111-4111-8111-111111111111',pageId:'1'},{cloudIds:[]}),/app_resource_not_authorized/);
assert.throws(()=>plan('shopify','products.archive',{productId:'gid://shopify/Product/1'},{shopDomain:'evil.invalid'}),/app_context_invalid/);
assert.throws(()=>plan('salesforce','contacts.delete',{contactId:'000000000000001'},{instanceOrigin:'https://evil.invalid'}),/app_context_invalid/);
assert.throws(()=>plan('linkedin','images.initializeUpload',{}),/app_context_invalid/);
invalid('facebook','comments.create',{pageId:'1',postId:'2_3',message:'Hello'});
invalid('confluence','pages.update',{cloudId:'11111111-1111-4111-8111-111111111111',pageId:'1',title:'Title',text:'Text',version:1});
const escaped=plan('confluence','comments.create',{cloudId:'11111111-1111-4111-8111-111111111111',pageId:'1',text:'<script>&"'},{cloudIds:['11111111-1111-4111-8111-111111111111']});
assert.equal(escaped.body.body.value,'<p>&lt;script&gt;&amp;&quot;</p>');
for(const name of ['files.move','files.delete'])assert.equal(plan('onedrive',name,{id:'file',...(name==='files.move'?{parentId:'folder'}:{}),etag:'rev'}).headers?.['if-match'],'rev');
assert.equal(plan('dropbox','files.delete',{path:'/file',revision:'rev'}).body.parent_rev,'rev');
assert.equal(plan('dropbox','files.delete',{path:'/file'}).body.parent_rev,undefined);
console.log('Apps write contracts: omission/false/empty preservation, bounded Excel writes, revision fences, tenant boundaries, secret redaction, provider rejection and cost checks passed.');
