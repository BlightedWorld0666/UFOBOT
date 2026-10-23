import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HOST=process.env.DASHBOARD_HOST||'127.0.0.1';
const PORT=Number(process.env.DASHBOARD_PORT||8792);
const USER=process.env.DASHBOARD_USERNAME||'Admin';
const HASH=process.env.DASHBOARD_PASSWORD_HASH;
const MASTER=process.env.DASHBOARD_MASTER_KEY;
const SECURE=process.env.DASHBOARD_SECURE_COOKIE==='true';
if(!HASH||!MASTER){console.error('Set DASHBOARD_PASSWORD_HASH and DASHBOARD_MASTER_KEY before starting the admin dashboard. See README.');process.exit(1);}
const key=Buffer.from(MASTER,'base64');
if(key.length!==32)throw Error('DASHBOARD_MASTER_KEY must be 32 random bytes in base64');
const dataDir=path.resolve('data');fs.mkdirSync(dataDir,{recursive:true});
const configFile=path.join(dataDir,'dashboard.json');
const defaults={guildName:'UFO Bot',xpEnabled:true,xpPerMessage:15,xpCooldownSeconds:60,tempvoiceLimit:5,lfgEnabled:true,agentRoles:true,rankClaims:true,logChannel:'',lfgChannel:'',tempvoiceCategory:'',hubUrl:'',hubStatus:'Not configured'};
const load=()=>fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):{settings:{...defaults},secrets:{}};
let db=load();db.settings={...defaults,...db.settings};
const save=()=>{const t=configFile+'.tmp';fs.writeFileSync(t,JSON.stringify(db,null,2),{mode:0o600});fs.renameSync(t,configFile)};
const encrypt=value=>{const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',key,iv);const ciphertext=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),ciphertext]).toString('base64');};
const sessions=new Map(),failures=new Map();
const publicDir=path.resolve('dashboard');
function readCookie(s){const match=/(?:^|;\s*)ufo_session=([^;]+)/.exec(s||'');return match?match[1]:null;}
function authenticated(req){const id=readCookie(req.headers.cookie);if(!id)return false;const v=sessions.get(id);if(!v)return false;if(v.expires<Date.now()){sessions.delete(id);return false;}return true;}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
const passwordOk=(candidate)=>{const [algorithm,salt,hex]=HASH.split(':');if(algorithm!=='scrypt'||!salt||!hex)return false;const actual=crypto.scryptSync(candidate,salt,64);const expected=Buffer.from(hex,'hex');return expected.length===actual.length&&crypto.timingSafeEqual(actual,expected);};
const safeSetting=(input)=>{const out={};for(const k of Object.keys(defaults)){if(!(k in input))continue;const v=input[k];if(typeof defaults[k]==='boolean'&&typeof v==='boolean')out[k]=v;else if(typeof defaults[k]==='number'&&Number.isInteger(v)&&v>=1&&v<=3600)out[k]=v;else if(typeof defaults[k]==='string'&&typeof v==='string'&&v.length<=300)out[k]=v;}return out;};
async function body(req){let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>16000)throw Error('Request too large');parts.push(chunk);}return JSON.parse(Buffer.concat(parts).toString()||'{}');}
function originAllowed(req){const origin=req.headers.origin;if(!origin)return true;const host=req.headers.host;try{return new URL(origin).host===host;}catch{return false;}}
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),route=url.pathname;
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy','no-referrer');
  if(['POST','PUT','DELETE','PATCH'].includes(req.method)&&!originAllowed(req))return json(res,403,{error:'Invalid origin'});
  if(route==='/api/login'&&req.method==='POST'){
   const addr=req.socket.remoteAddress||'unknown',status=failures.get(addr)||{count:0,until:0};
   if(status.until>Date.now())return json(res,429,{error:'Too many attempts, retry later'});
   const b=await body(req);
   if(b.username!==USER||typeof b.password!=='string'||!passwordOk(b.password)){
    status.count++;if(status.count>=5){status.until=Date.now()+15*60*1000;status.count=0;}failures.set(addr,status);
    return json(res,401,{error:'Invalid credentials'});
   }
   failures.delete(addr);const id=crypto.randomBytes(32).toString('hex');sessions.set(id,{expires:Date.now()+8*3600000});
   res.setHeader('Set-Cookie','ufo_session='+id+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+(SECURE?'; Secure':''));
   return json(res,200,{ok:true,username:USER});
  }
  if((route==='/app.js'||route==='/styles.css') && req.method==='GET'){const name=route==='/app.js'?'app.js':'styles.css';const bytes=fs.readFileSync(path.join(publicDir,name));res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(bytes);}
  if(route==='/api/me')return json(res,200,{authenticated:authenticated(req),username:authenticated(req)?USER:null});
  if(!authenticated(req)){
   if(route.startsWith('/api/'))return json(res,401,{error:'Login required'});
   if(route==='/'||route==='/index.html'){const bytes=fs.readFileSync(path.join(publicDir,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(bytes);}
   return json(res,404,{error:'Not found'});
  }
  if(route==='/api/logout'&&req.method==='POST'){sessions.delete(readCookie(req.headers.cookie));res.setHeader('Set-Cookie','ufo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+(SECURE?'; Secure':''));return json(res,200,{ok:true});}
  if(route==='/api/settings'&&req.method==='GET')return json(res,200,{settings:db.settings});
  if(route==='/api/settings'&&req.method==='PUT'){db.settings={...db.settings,...safeSetting(await body(req))};save();return json(res,200,{settings:db.settings,note:'Saved to dashboard configuration; bot runtime application requires integration/restart'});}
  const allowedSecrets=['DISCORD_TOKEN','RIOT_API_KEY','HUB_API_KEY','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'];
  if(route==='/api/secrets'&&req.method==='GET')return json(res,200,{secrets:allowedSecrets.map(name=>({name,configured:!!db.secrets[name]}))});
  if(route==='/api/secrets'&&req.method==='PUT'){const b=await body(req);if(!allowedSecrets.includes(b.name)||typeof b.value!=='string'||b.value.length<1||b.value.length>2000)return json(res,400,{error:'Invalid secret'});db.secrets[b.name]=encrypt(b.value);save();return json(res,200,{ok:true,note:'Encrypted and stored. Bot/Hub must explicitly load secrets at startup; they are not yet passed to the running bot.'});}
  if(route==='/api/secrets'&&req.method==='DELETE'){const b=await body(req);if(!allowedSecrets.includes(b.name))return json(res,400,{error:'Invalid key'});delete db.secrets[b.name];save();return json(res,200,{ok:true});}
  if(route==='/api/bot-health'&&req.method==='GET'){
   let token=process.env.HUB_API_KEY||'';
   const encrypted=db.secrets.HUB_API_KEY;
   if(encrypted){try{const raw=Buffer.from(encrypted,'base64');const d=crypto.createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));d.setAuthTag(raw.subarray(12,28));token=Buffer.concat([d.update(raw.subarray(28)),d.final()]).toString('utf8');}catch{return json(res,200,{status:'not_configured',message:'Saved Hub key could not be decrypted. Check your dashboard master key.'});}}
   if(!token)return json(res,200,{status:'not_configured',message:'Set HUB_API_KEY on the bot and in the dashboard vault to enable authenticated local health.'});
   const port=Number(process.env.HUB_PORT||8791);
   if(!Number.isInteger(port)||port<1||port>65535)return json(res,200,{status:'unreachable',message:'Invalid local health port configuration.'});
   try{
    const response=await fetch('http://127.0.0.1:'+port+'/health',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(2500)});
    if(!response.ok)return json(res,200,{status:'unreachable',message:'Bot health endpoint returned HTTP '+response.status+'. Check matching Hub API keys.'});
    const report=await response.json();
    return json(res,200,{status:report.status==='online'?'online':'starting',message:report.status==='online'?'Discord runtime responding':'Bot runtime initializing',guilds:Number.isInteger(report.guilds)?report.guilds:null,linkedProfiles:Number.isInteger(report.linkedProfiles)?report.linkedProfiles:null,uptimeSeconds:Number.isInteger(report.uptimeSeconds)?report.uptimeSeconds:null});
   }catch{return json(res,200,{status:'unreachable',message:'No response from local bot health endpoint at 127.0.0.1:'+port});}
  }
  if(route==='/api/overview'&&req.method==='GET')return json(res,200,{service:'UFO Bot',dashboard:'online',hub:db.settings.hubUrl?'Configured':'Not configured',rankSync:'Not available via official general rank endpoint',secrets:Object.keys(db.secrets).length});
  if(route==='/api/hub-check'&&req.method==='POST')return json(res,200,{status:'unconnected',message:'Hub URL can be saved in Settings. A secure mutually authenticated Hub integration must be configured on the Hub side before remote control is enabled.'});
  return json(res,404,{error:'Not found'});
 }catch(e){console.error('Dashboard error',e.message);return json(res,e.message==='Request too large'?413:400,{error:'Unable to process request'});}
}).listen(PORT,HOST,()=>console.log('UFO Bot admin dashboard at http://'+HOST+':'+PORT));
