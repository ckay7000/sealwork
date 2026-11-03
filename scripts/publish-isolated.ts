import {readFile,writeFile,readdir,mkdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {bridgeRequest,closeBridge} from './tool-bridge.mjs';
const name=process.argv[2], mode=process.argv[3];
if(!['sealwork-next','accord-near'].includes(name))throw Error('Expected a separate project name.');
const root=name==='sealwork-next'?'/root/sealwork-next':'/root/accord';
if(process.cwd()!==root)throw Error('Run inside the matching separate checkout.');
const team='team_osASFxy0lZFhvkPehOUzYAXS';await mkdir('.local/bridge',{recursive:true,mode:0o700});
let headerFile='';
try{
 if(['site','env','status'].includes(mode)){
  const token=process.env.VERCEL_TOKEN||JSON.parse(await readFile('/root/.local/share/com.vercel.cli/auth.json','utf8')).token;
  if(!token)throw Error('Saved Vercel connection unavailable.');headerFile=path.resolve('.local/bridge/vercel.headers');
  await writeFile(headerFile,`Authorization: Bearer ${token}\nContent-Type: application/json\n`,{mode:0o600});
  const api=(r:string,m='GET',b?:unknown)=>bridgeRequest(`https://api.vercel.com${r}${r.includes('?')?'&':'?'}teamId=${team}`,m,b,headerFile);
  const projects=await api('/v9/projects?limit=100');let project=projects.projects.find((p:any)=>p.name===name);
  if(!project){if(mode==='status')throw Error('Project has not been created.');project=await api('/v11/projects','POST',{name,framework:'vite',buildCommand:'npm run build',installCommand:'npm ci',outputDirectory:'dist'});}
  if(mode==='status'){
   const saved=JSON.parse(await readFile('deployments/web.json','utf8'));const d=await api(`/v13/deployments/${saved.deployment_id}`);
   console.log('Deployment:',d.readyState,d.url);
   if(d.readyState==='ERROR'){const e=await api(`/v3/deployments/${saved.deployment_id}/events`);console.log(e.filter((x:any)=>/error|failed|cannot|ENOENT/i.test(x.text||'')).map((x:any)=>x.text).join('\n').slice(0,4000));}
  }else if(mode==='env'){
   const values=Object.fromEntries((await readFile('.env.local','utf8')).split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
   const keys=name==='sealwork-next'?['SEALWORK_BUYER_ID','SEALWORK_BUYER_KEY','SEALWORK_CONTROL_SECRET','SEALWORK_RPC_URL','SEALWORK_READ_ONLY','NEAR_AI_API_KEY','NEAR_AI_MODEL']:['ACCORD_OPERATOR_ID','ACCORD_OPERATOR_KEY','ACCORD_CONTROL_SECRET','ACCORD_RPC_URL','ACCORD_READ_ONLY','NEAR_AI_API_KEY','NEAR_AI_MODEL'];
   const current=await api(`/v10/projects/${project.id}/env`);
   for(const key of keys){if(values[key]===undefined)continue;const existing=current.envs.find((e:any)=>e.key===key);await api(`/v10/projects/${project.id}/env${existing?'/'+existing.id:''}`,existing?'PATCH':'POST',{key,value:values[key],type:'encrypted',target:['production']});console.log('Configured:',key);}
  }else{
   const files:any[]=[];
   const add=async(file:string)=>{const raw=await readFile(path.join(root,file));if(raw.length>200000){const sha=createHash('sha1').update(raw).digest('hex'),h=path.resolve('.local/bridge/upload.headers');await writeFile(h,`Authorization: Bearer ${token}\nContent-Type: application/octet-stream\nx-vercel-digest: ${sha}\nx-vercel-size: ${raw.length}\n`,{mode:0o600});try{await bridgeRequest(`https://api.vercel.com/v2/files?teamId=${team}`,'POST',undefined,h,path.join(root,file));}finally{await rm(h,{force:true});}files.push({file,sha,size:raw.length});console.log('Uploaded asset:',file);}else files.push({file,data:raw.toString('base64'),encoding:'base64'});};
   const walk=async(dir:string)=>{for(const e of await readdir(path.join(root,dir),{withFileTypes:true})){if(e.name==='node_modules'||e.name.startsWith('.'))continue;const f=dir+'/'+e.name;if(e.isDirectory())await walk(f);else await add(f);}};
   for(const f of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','vercel.json','index.html'])await add(f);
   for(const d of ['src','shared','server','api','public','deployments','scripts'])await walk(d);
   const d=await api('/v13/deployments','POST',{name,project:project.id,target:'production',files,projectSettings:{framework:'vite',nodeVersion:'24.x',installCommand:'npm ci',buildCommand:'npm run build',outputDirectory:'dist'}});
   await writeFile('deployments/web.json',JSON.stringify({project:name,project_id:project.id,deployment_id:d.id,alias:`https://${name}.vercel.app`,state:d.readyState,created_at:new Date().toISOString()},null,2)+'\n');console.log('Queued separate site:',name,d.id);
  }
 }else if(mode==='repo'){
  let credential='';try{credential=execFileSync('git',['credential','fill'],{cwd:'/root/~/sealwork',input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'},stdio:['pipe','pipe','pipe']});}catch(e:any){if(typeof e.stdout==='string'&&e.stdout.includes('password='))credential=e.stdout;else throw Error('Saved GitHub connection unavailable.');}
  const creds=Object.fromEntries(credential.trim().split('\n').map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));if(!creds.password)throw Error('GitHub connection unavailable.');
  headerFile=path.resolve('.local/bridge/github.headers');await writeFile(headerFile,`Authorization: Bearer ${creds.password}\nAccept: application/vnd.github+json\nContent-Type: application/json\nUser-Agent: separate NEAR project publication\n`,{mode:0o600});
  const api=(r:string,m='GET',b?:unknown)=>bridgeRequest('https://api.github.com'+r,m,b,headerFile);
  const user=await api('/user');if(user.login.toLowerCase()!=='nsevejk0')throw Error('Unexpected repository owner.');
  const repos=await api('/user/repos?type=owner&per_page=100');let repo=repos.find((r:any)=>r.name===name);
  if(!repo)repo=await api('/user/repos','POST',{name,private:false,auto_init:true,description:name==='sealwork-next'?'Private, reviewed bank-receipt reconciliation with checked balances, source fingerprints and NEAR testnet processing-fee settlement.':'Software milestone payments: private invoices, exact GitHub delivery evidence and bounded NEAR treasury settlement.',homepage:`https://${name}.vercel.app`});
  if(repo.private)throw Error('Expected the authorized public comparison repository.');
  const base=`/repos/NSEVEjk0/${name}`,ref=await api(base+'/git/ref/heads/main'),parent=ref.object.sha;
  const paths=(await readFile('.local/publication-paths.bin')).toString().split('\0').filter(Boolean);
  const tree:any[]=[];for(const file of [...new Set(paths)]){
   if(/^\.local\/|^\.env(?!\.example)|credentials|keypair|\.pem$|\.key$/.test(file))throw Error('Unexpected private file in publication.');
   const raw=await readFile(path.join(root,file));const binary=raw.includes(0)||!Buffer.from(raw.toString('utf8')).equals(raw);
   if(binary){const b=await api(base+'/git/blobs','POST',{content:raw.toString('base64'),encoding:'base64'});tree.push({path:file,mode:'100644',type:'blob',sha:b.sha});console.log('Published binary:',file);}else tree.push({path:file,mode:'100644',type:'blob',content:raw.toString('utf8')});
  }
  const t=await api(base+'/git/trees','POST',{tree});const commit=await api(base+'/git/commits','POST',{message:'Build focused '+name+' with reproducible checks and explicit baseline disclosure',tree:t.sha,parents:[parent]});
  const current=await api(base+'/git/ref/heads/main');if(current.object.sha!==parent)throw Error('Remote changed during upload; preserved without updating.');
  await api(base+'/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});await writeFile('.local/published.json',JSON.stringify({repo:repo.html_url,sha:commit.sha,tree:t.sha},null,2));console.log('Published repository:',repo.html_url,commit.sha);
 }else throw Error('Expected site, env, status or repo.');
}finally{if(headerFile)await rm(headerFile,{force:true});closeBridge();}
