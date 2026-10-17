import {execFileSync} from "node:child_process";
import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";
import {appendFileSync,chmodSync,constants,copyFileSync,createReadStream,createWriteStream,existsSync,mkdirSync,readFileSync,readdirSync,statSync,unlinkSync,writeFileSync} from "node:fs";
import path from "node:path";
import {Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {fileURLToPath} from "node:url";
import {parseRemote,pendingMigrations} from "./d1-promotion-preflight.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const database="remote-link-auth",aad=Buffer.from("Remote Arc verified D1 backup v1:"+database);
export function backupKey(value){
 if(typeof value!=="string"||!value.trim())throw Error("D1_BACKUP_KEY is required for a recoverable encrypted backup");
 const key=Buffer.from(value.trim(),"base64");if(key.length!==32||key.toString("base64")!==value.trim())throw Error("D1_BACKUP_KEY must encode exactly 32 random bytes");return key;
}
const hashStream=hash=>new Transform({transform(chunk,encoding,callback){hash.update(chunk);callback(null,chunk);}});
export async function encryptBackup(sqlFile,directory,key){
 if(statSync(sqlFile).size===0||statSync(sqlFile).size>256*1024*1024)throw Error("Backup size is outside the supported range");
 mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv),hash=createHash("sha256"),encrypted=path.join(directory,"production.sql.enc");
 cipher.setAAD(aad);await pipeline(createReadStream(sqlFile),hashStream(hash),cipher,createWriteStream(encrypted,{flags:"wx",mode:0o600}));
 const manifest={version:1,database,algorithm:"AES-256-GCM",iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),sha256:hash.digest("hex"),createdAt:new Date().toISOString(),encryptedFile:"production.sql.enc"};
 writeFileSync(path.join(directory,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx",mode:0o600});return manifest;
}
export async function decryptBackup(directory,key,output){
 const manifest=JSON.parse(readFileSync(path.join(directory,"manifest.json"),"utf8"));
 if(manifest.version!==1||manifest.database!==database||manifest.algorithm!=="AES-256-GCM"||manifest.encryptedFile!=="production.sql.enc"||!/^[a-f0-9]{64}$/.test(manifest.sha256))throw Error("Invalid backup manifest");
 const iv=Buffer.from(manifest.iv,"base64"),tag=Buffer.from(manifest.tag,"base64");
 if(iv.length!==12||tag.length!==16)throw Error("Invalid backup authentication metadata");
 const encrypted=path.join(directory,"production.sql.enc");
 if(statSync(encrypted).size>256*1024*1024)throw Error("Encrypted backup is too large");
 const temporary=output+"."+randomBytes(8).toString("hex")+".part",hash=createHash("sha256");
 try{
  const decipher=createDecipheriv("aes-256-gcm",key,iv);decipher.setAAD(aad);decipher.setAuthTag(tag);
  await pipeline(createReadStream(encrypted),decipher,hashStream(hash),createWriteStream(temporary,{flags:"wx",mode:0o600}));
  if(hash.digest("hex")!==manifest.sha256)throw Error("Backup checksum mismatch");
  copyFileSync(temporary,output,constants.COPYFILE_EXCL);chmodSync(output,0o600);
 }finally{if(existsSync(temporary))unlinkSync(temporary);}
 return manifest;
}
export function verifySqlBackup(sqlFile,expectedMigrations){
 try{const result=execFileSync("python3",[path.join(root,"scripts/verify-d1-backup.py"),sqlFile],{encoding:"utf8",input:JSON.stringify(expectedMigrations),stdio:["pipe","pipe","pipe"],timeout:60000,maxBuffer:100000});
  if(JSON.parse(result).verified!==true)throw Error();
 }catch{throw Error("D1 backup failed isolated SQLite restore/integrity/history verification");}
}
function wrangler(args){try{return execFileSync(path.join(root,"apps/relay/node_modules/.bin/wrangler"),args,{cwd:path.join(root,"apps/relay"),encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:120000,maxBuffer:4000000});}catch{throw Error("Production D1 read/export failed; migration was not attempted");}}
export async function prepareBackup(directory,keyValue){
 const local=readdirSync(path.join(root,"apps/relay/migrations")).filter(name=>name.endsWith(".sql")).sort();
 const remote=parseRemote(wrangler(["d1","execute",database,"--remote","--json","--command","SELECT name FROM d1_migrations ORDER BY id ASC;"]));
 const pending=pendingMigrations(local,remote);if(!pending.length)return{needed:false,verified:false,directory};
 const key=backupKey(keyValue);mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
 const sqlFile=path.join(directory,"production.sql"),restored=path.join(directory,"verified-restored.sql");
 try{
  wrangler(["d1","export",database,"--remote","--output",sqlFile]);chmodSync(sqlFile,0o600);verifySqlBackup(sqlFile,remote);
  await encryptBackup(sqlFile,directory,key);await decryptBackup(directory,key,restored);verifySqlBackup(restored,remote);
  return{needed:true,verified:true,directory,pending};
 }finally{for(const file of [sqlFile,restored])if(existsSync(file))unlinkSync(file);}
}
async function main(){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=="--out"||!path.isAbsolute(args[1]))throw Error("Usage: node scripts/d1-production-backup.mjs --out /absolute/isolated/directory");
 const result=await prepareBackup(args[1],process.env.D1_BACKUP_KEY);
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,"needs_migration="+result.needed+"\nbackup_verified="+result.verified+"\nbackup_directory="+result.directory+"\n");
 console.log(result.needed?"Production D1 export restored, encrypted, decrypted and verified. No database writes were made.":"No pending migrations; no database export required.");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(error=>{console.error(error.message);process.exitCode=1;});
