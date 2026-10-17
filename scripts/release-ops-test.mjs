import assert from "node:assert/strict";import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from "node:fs";import {tmpdir} from "node:os";import path from "node:path";import {randomBytes} from "node:crypto";
import {backupKey,encryptBackup,decryptBackup,verifySqlBackup} from "./d1-production-backup.mjs";import {ensureAppsVault} from "./ensure-apps-vault.mjs";
const directory=mkdtempSync(path.join(tmpdir(),"ra-release-ops-")),key=randomBytes(32),sql=path.join(directory,"fixture.sql"),encrypted=path.join(directory,"encrypted"),restored=path.join(directory,"restored.sql");
try{
 for(const value of ["",undefined,"not-base64",Buffer.alloc(31).toString("base64"),Buffer.alloc(33).toString("base64")])assert.throws(()=>backupKey(value));
 assert.deepEqual(backupKey(key.toString("base64")),key);
 const fixture="CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO d1_migrations VALUES(1,'0001_initial.sql'); CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT); INSERT INTO users VALUES('user-one','private@example.invalid');";
 writeFileSync(sql,fixture);verifySqlBackup(sql,["0001_initial.sql"]);assert.throws(()=>verifySqlBackup(sql,["wrong.sql"]),/verification/);
 await encryptBackup(sql,encrypted,key);assert(!readFileSync(path.join(encrypted,"production.sql.enc")).includes(Buffer.from("private@example.invalid")));
 await decryptBackup(encrypted,key,restored);assert.equal(readFileSync(restored,"utf8"),fixture);verifySqlBackup(restored,["0001_initial.sql"]);
 await assert.rejects(()=>decryptBackup(encrypted,key,restored));assert.equal(readFileSync(restored,"utf8"),fixture,"never overwrite an existing operator file");
 await assert.rejects(()=>decryptBackup(encrypted,randomBytes(32),path.join(directory,"wrong-key.sql")));
 const ciphertext=readFileSync(path.join(encrypted,"production.sql.enc"));ciphertext[0]^=1;writeFileSync(path.join(encrypted,"production.sql.enc"),ciphertext);
 await assert.rejects(()=>decryptBackup(encrypted,key,path.join(directory,"tampered.sql")));
 const manifestPath=path.join(encrypted,"manifest.json"),manifest=JSON.parse(readFileSync(manifestPath,"utf8"));
 writeFileSync(manifestPath,JSON.stringify({...manifest,encryptedFile:"../outside.sql"}));await assert.rejects(()=>decryptBackup(encrypted,key,path.join(directory,"path.sql")),/manifest/);
 writeFileSync(sql,"");await assert.rejects(()=>encryptBackup(sql,path.join(directory,"empty"),key),/size/);
 let calls=[];const configuration={accountId:"test-account",worker:"remote-link-relay",token:"private-api-token",key:key.toString("base64")};
 const existing=await ensureAppsVault({...configuration,key:undefined},async(url,init)=>{calls.push(init.method);return Response.json({success:true,result:[{name:"APP_TOKEN_KEY",type:"secret_text"}]});});
 assert.deepEqual(existing,{created:false});assert.deepEqual(calls,["GET"]);
 calls=[];const created=await ensureAppsVault(configuration,async(url,init)=>{calls.push(init.method);assert.equal(new Headers(init.headers).get("authorization"),"Bearer private-api-token");if(init.method==="PUT"){const body=JSON.parse(init.body);assert.equal(body.name,"APP_TOKEN_KEY");assert.equal(body.text,configuration.key);}return Response.json({success:true,result:init.method==="GET"?[]:{name:"APP_TOKEN_KEY"}});});
 assert.deepEqual(created,{created:true});assert.deepEqual(calls,["GET","PUT"]);
 await assert.rejects(()=>ensureAppsVault({...configuration,key:undefined},async()=>Response.json({success:true,result:[]})),/APP_TOKEN_KEY/);
 await assert.rejects(()=>ensureAppsVault(configuration,async()=>Response.json({success:false,errors:[{message:"private-api-token"}]},{status:403})),error=>!error.message.includes("private-api-token"));
 await assert.rejects(()=>ensureAppsVault(configuration,async()=>Response.json({success:true,result:{}})),/list/);
 await assert.rejects(()=>ensureAppsVault(configuration,async()=>Response.json({success:true,result:[{name:"APP_TOKEN_KEY",type:"text"}]})),/type/);
 console.log("Release operations: encrypted backup round-trip, actual SQLite restore, tamper rejection, no overwrite and non-rotating Apps vault provisioning passed.");
}finally{rmSync(directory,{recursive:true,force:true});}
