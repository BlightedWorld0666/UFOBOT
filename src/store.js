import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveBotDataDir } from './data-dir.js';

const keys=(g,u)=>[String(g),String(u)];
const obj=s=>s?JSON.parse(s):{};
const split=k=>{const i=k.indexOf(':');return i>0?[k.slice(0,i),k.slice(i+1)]:null;};
const valid=x=>typeof x==='string'&&/^\d{5,25}$/.test(x);
export function levelInfo(xp){
 const total=Math.max(0,Number(xp)||0),level=Math.floor(Math.sqrt(total/100));
 const base=100*level*level,next=100*(level+1)*(level+1);
 return {level,xp:total,base,next,progress:total-base,required:next-base};
}
export function openStore(filename=path.join(resolveBotDataDir(),'ufobot.sqlite')){
 if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});
 const db=new DatabaseSync(filename,{timeout:5000});
 db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 db.exec('CREATE TABLE IF NOT EXISTS profiles (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(guild_id,user_id))');
 db.exec("CREATE TABLE IF NOT EXISTS xp_profiles (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,xp INTEGER NOT NULL DEFAULT 0,bio TEXT NOT NULL DEFAULT '',last_award_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id))");
 db.exec('CREATE INDEX IF NOT EXISTS xp_leaderboard ON xp_profiles(guild_id,xp DESC)');
 db.exec('CREATE TABLE IF NOT EXISTS lfg (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT NOT NULL,PRIMARY KEY(guild_id,user_id))');
 db.exec('CREATE TABLE IF NOT EXISTS voice_rooms (channel_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,owner_id TEXT NOT NULL,created_at INTEGER NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS xp_optout (user_id TEXT PRIMARY KEY)');
 db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)');
 const one=(q,...args)=>db.prepare(q).get(...args);
 const all=(q,...args)=>db.prepare(q).all(...args);
 const run=(q,...args)=>db.prepare(q).run(...args);
 function tx(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
 const api={
  close:()=>db.close(),
  filename,
  getProfile(g,u){return obj(one('SELECT payload FROM profiles WHERE guild_id=? AND user_id=?',...keys(g,u))?.payload);},
  putProfile(g,u,patch){
   const value={...api.getProfile(g,u),...patch};
   run('INSERT INTO profiles(guild_id,user_id,payload) VALUES(?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET payload=excluded.payload',...keys(g,u),JSON.stringify(value));
   return value;
  },
  deleteProfile(g,u){run('DELETE FROM profiles WHERE guild_id=? AND user_id=?',...keys(g,u));},
  getXP(g,u){const v=one('SELECT xp,bio FROM xp_profiles WHERE guild_id=? AND user_id=?',...keys(g,u));return v?{xp:Number(v.xp),bio:v.bio}:{xp:0,bio:''};},
  isOptedOut(u){return !!one('SELECT 1 AS yes FROM xp_optout WHERE user_id=?',String(u));},
  optOut(u){run('INSERT OR IGNORE INTO xp_optout(user_id) VALUES(?)',String(u));},
  optIn(u){run('DELETE FROM xp_optout WHERE user_id=?',String(u));},
  awardXP(g,u,amount=15,cooldown=60,now=Date.now()){
   if(api.isOptedOut(u))return {awarded:false,reason:'opted_out'};
   const points=Math.min(100,Math.max(1,Math.floor(Number(amount)||15)));
   const delay=Math.min(3600,Math.max(5,Number(cooldown)||60))*1000;
   return tx(()=>{
    const before=one('SELECT xp,last_award_at FROM xp_profiles WHERE guild_id=? AND user_id=?',...keys(g,u));
    if(before&&now-Number(before.last_award_at)<delay)return {awarded:false,reason:'cooldown'};
    const xp=Math.min(Number.MAX_SAFE_INTEGER,(before?Number(before.xp):0)+points);
    run('INSERT INTO xp_profiles(guild_id,user_id,xp,last_award_at) VALUES(?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=excluded.xp,last_award_at=excluded.last_award_at',...keys(g,u),xp,now);
    return {awarded:true,...levelInfo(xp)};
   });
  },
  setBio(g,u,value){
   const bio=String(value||'').replace(/[\r\n]/g,' ').slice(0,160);
   run('INSERT INTO xp_profiles(guild_id,user_id,bio) VALUES(?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET bio=excluded.bio',...keys(g,u),bio);
  },
  leaderboard(g,limit=10){
   return all('SELECT user_id,xp FROM xp_profiles WHERE guild_id=? AND xp>0 ORDER BY xp DESC,user_id ASC LIMIT ?',String(g),Math.max(1,Math.min(limit,25))).map(v=>({userId:v.user_id,xp:Number(v.xp)}));
  },
  getLfg(g,u){return one('SELECT channel_id AS channelId,message_id AS messageId FROM lfg WHERE guild_id=? AND user_id=?',...keys(g,u))||null;},
  saveLfg(g,u,c,m){run('INSERT INTO lfg(guild_id,user_id,channel_id,message_id) VALUES(?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET channel_id=excluded.channel_id,message_id=excluded.message_id',...keys(g,u),String(c),String(m));},
  deleteLfg(g,u){run('DELETE FROM lfg WHERE guild_id=? AND user_id=?',...keys(g,u));},
  getVoice(c){return one('SELECT channel_id AS channelId,guild_id AS guildId,owner_id AS ownerId FROM voice_rooms WHERE channel_id=?',String(c))||null;},
  listVoice(){return all('SELECT channel_id AS channelId,guild_id AS guildId,owner_id AS ownerId FROM voice_rooms');},
  findVoice(g,u){return one('SELECT channel_id AS channelId,guild_id AS guildId,owner_id AS ownerId FROM voice_rooms WHERE guild_id=? AND owner_id=? LIMIT 1',...keys(g,u))||null;},
  saveVoice(c,g,u,created=Date.now()){run('INSERT INTO voice_rooms(channel_id,guild_id,owner_id,created_at) VALUES(?,?,?,?)',String(c),String(g),String(u),created);},
  deleteVoice(c){run('DELETE FROM voice_rooms WHERE channel_id=?',String(c));},
  eraseUser(u,scope='all',g=null){
   if(!['all','riot','xp','bio','agents','lfg'].includes(scope))throw Error('Invalid erasure scope');
   if(scope!=='all'&&!g)throw Error('A guild is required for selective erasure');
   const uid=String(u),gid=String(g);
   return tx(()=>{
    const found={
     profiles:scope==='all'?all('SELECT guild_id AS guildId FROM profiles WHERE user_id=?',uid):['riot','agents'].includes(scope)?[{guildId:gid}]:[],
     listings:scope==='all'?all('SELECT channel_id AS channelId,message_id AS messageId FROM lfg WHERE user_id=?',uid):scope==='lfg'?all('SELECT channel_id AS channelId,message_id AS messageId FROM lfg WHERE user_id=? AND guild_id=?',uid,gid):[],
     rooms:scope==='all'?all('SELECT channel_id AS channelId,guild_id AS guildId FROM voice_rooms WHERE owner_id=?',uid):[]
    };
    if(scope==='all'){
     for(const table of ['profiles','xp_profiles','lfg'])run('DELETE FROM '+table+' WHERE user_id=?',uid);
     run('DELETE FROM voice_rooms WHERE owner_id=?',uid);
     api.optOut(uid); // Keep only the Discord user ID needed to suppress automatic XP re-collection.
    }else if(scope==='riot'||scope==='agents'){
     const data=api.getProfile(gid,uid);
     const fields=scope==='riot'?['riotId','region','puuid','accountFound','lastAccountLookupAt','rank','verified','verifiedBy']:['agents'];
     for(const field of fields)delete data[field];
     if(Object.keys(data).length)run('UPDATE profiles SET payload=? WHERE guild_id=? AND user_id=?',JSON.stringify(data),gid,uid);
     else api.deleteProfile(gid,uid);
    }else if(scope==='xp'){
     run('UPDATE xp_profiles SET xp=0,last_award_at=0 WHERE guild_id=? AND user_id=?',gid,uid);
     api.optOut(uid);
    }else if(scope==='bio'){
     run("UPDATE xp_profiles SET bio='' WHERE guild_id=? AND user_id=?",gid,uid);
    }else if(scope==='lfg')api.deleteLfg(gid,uid);
    return found;
   });
  },
  hasActiveData(){
   return ['profiles','xp_profiles','lfg','voice_rooms','xp_optout'].some(table=>one('SELECT COUNT(*) AS n FROM '+table).n>0);
  },
  legacyPending(dir=resolveBotDataDir()){
   return !one('SELECT 1 FROM migrations WHERE name=?','legacy_json_v1')&&
    ['members.json','community.json'].some(f=>fs.existsSync(path.join(dir,f)));
  },
  importLegacy(members={},community={}){
   if(one('SELECT 1 FROM migrations WHERE name=?','legacy_json_v1'))throw Error('Legacy import already performed; never restore erased users by reimporting');
   return tx(()=>{
    const count={profiles:0,xp:0,rooms:0};
    for(const [k,v] of Object.entries(members)){
     const ids=split(k);if(!ids||!ids.every(valid)||!v||typeof v!=='object'||Array.isArray(v))continue;
     run('INSERT OR IGNORE INTO profiles(guild_id,user_id,payload) VALUES(?,?,?)',...ids,JSON.stringify(v));count.profiles++;
    }
    for(const [k,v] of Object.entries(community.users||{})){
     const ids=split(k);if(!ids||!ids.every(valid)||!v||typeof v!=='object')continue;
     run('INSERT OR IGNORE INTO xp_profiles(guild_id,user_id,xp,bio) VALUES(?,?,?,?)',...ids,Number.isSafeInteger(v.xp)&&v.xp>=0?v.xp:0,String(v.bio||'').slice(0,160));count.xp++;
    }
    for(const [c,v] of Object.entries(community.rooms||{})){
     if(![c,v?.guild,v?.owner].every(valid))continue;
     run('INSERT OR IGNORE INTO voice_rooms(channel_id,guild_id,owner_id,created_at) VALUES(?,?,?,?)',c,v.guild,v.owner,Number.isSafeInteger(v.created)?v.created:0);count.rooms++;
    }
    run('INSERT INTO migrations(name,applied_at) VALUES(?,?)','legacy_json_v1',Date.now());
    return count;
   });
  }
 };
 return api;
}
