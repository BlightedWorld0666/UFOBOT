import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, levelInfo } from '../src/store.js';

const G1='12345678901',G2='12345678902',U='98765432101',OTHER='98765432102';
function temporary(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ufobot-sqlite-'));
 const filename=path.join(dir,'bot.sqlite'),store=openStore(filename);
 t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {store,dir,filename};
}
test('persistent profile, XP, bio and deterministic level boundaries',t=>{
 const {store,filename}=temporary(t);
 store.putProfile(G1,U,{riotId:'Player#NA1',rank:'Gold 2',agents:['Sova'],verified:false});
 store.setBio(G1,U,'Hello world');
 assert.equal(store.getProfile(G1,U).rank,'Gold 2');
 assert.equal(store.getXP(G1,U).bio,'Hello world');
 assert.equal(store.awardXP(G1,U,50,60,100000).awarded,true);
 assert.equal(store.awardXP(G1,U,50,60,101000).reason,'cooldown');
 assert.equal(store.getXP(G1,U).xp,50);
 assert.deepEqual(levelInfo(100),{level:1,xp:100,base:100,next:400,progress:0,required:300});
 const other=openStore(filename);
 assert.equal(other.getProfile(G1,U).riotId,'Player#NA1');
 assert.equal(other.getXP(G1,U).xp,50);
 other.close();
});
test('XP opt-out stops passive writes but keeps progress and allows opt-in',t=>{
 const {store}=temporary(t);
 store.awardXP(G1,U,15,10,100000);
 store.optOut(U);
 assert.equal(store.awardXP(G1,U,15,10,180000).reason,'opted_out');
 assert.equal(store.getXP(G1,U).xp,15);
 store.optIn(U);
 assert.equal(store.awardXP(G1,U,15,10,180000).awarded,true);
 assert.equal(store.getXP(G1,U).xp,30);
});
test('LFG and temporary voice ownership survive database reopen',t=>{
 const {store,filename}=temporary(t);
 store.saveLfg(G1,U,'12345000001','12345000002');
 store.saveVoice('12345000003',G1,U,123456);
 const another=openStore(filename);
 assert.deepEqual(another.getLfg(G1,U),{channelId:'12345000001',messageId:'12345000002'});
 assert.equal(another.findVoice(G1,U).channelId,'12345000003');
 another.close();
 store.deleteLfg(G1,U);store.deleteVoice('12345000003');
 assert.equal(store.getLfg(G1,U),null);
 assert.equal(store.findVoice(G1,U),null);
});
test('erasedata all deletes every guild profile, XP, listings and rooms but remembers opt-out',t=>{
 const {store}=temporary(t);
 for(const g of [G1,G2]){
  store.putProfile(g,U,{riotId:'Personal#NA1',rank:'Diamond 3',puuid:'private-puuid',agents:['Jett']});
  store.setBio(g,U,'personal');
  store.awardXP(g,U,15,60,120000);
  store.saveLfg(g,U,'12345677777','12345688888');
 }
 store.saveVoice('12345111111',G2,U,123);
 store.putProfile(G1,OTHER,{riotId:'Other#NA1'});
 store.awardXP(G1,OTHER,15,60,120000);
 const before=store.eraseUser(U,'all',G1);
 assert.equal(before.profiles.length,2);
 assert.equal(before.listings.length,2);
 assert.equal(before.rooms.length,1);
 for(const g of [G1,G2]){
  assert.deepEqual(store.getProfile(g,U),{});
  assert.deepEqual(store.getXP(g,U),{xp:0,bio:''});
  assert.equal(store.getLfg(g,U),null);
 }
 assert.equal(store.findVoice(G2,U),null);
 assert.equal(store.isOptedOut(U),true);
 assert.equal(store.awardXP(G2,U,30,5,250000).reason,'opted_out');
 assert.equal(store.getProfile(G1,OTHER).riotId,'Other#NA1');
 assert.equal(store.getXP(G1,OTHER).xp,15);
});
test('selective Riot erasure preserves agent mains, XP and bio while clearing rank/verification',t=>{
 const {store}=temporary(t);
 store.putProfile(G1,U,{riotId:'Player#NA1',region:'americas',puuid:'identifier',accountFound:true,rank:'Gold 2',verified:true,verifiedBy:OTHER,agents:['Sage']});
 store.setBio(G1,U,'keep bio');
 store.awardXP(G1,U,18,60,100000);
 store.eraseUser(U,'riot',G1);
 assert.deepEqual(store.getProfile(G1,U),{agents:['Sage']});
 assert.deepEqual(store.getXP(G1,U),{xp:18,bio:'keep bio'});
 store.eraseUser(U,'agents',G1);
 assert.deepEqual(store.getProfile(G1,U),{});
});
test('selective XP deletion opts out, bio erasure and listing erasure retain other categories',t=>{
 const {store}=temporary(t);
 store.awardXP(G1,U,24,60,100000);
 store.setBio(G1,U,'a biography');
 store.saveLfg(G1,U,'12345677777','12345688888');
 store.eraseUser(U,'xp',G1);
 assert.equal(store.getXP(G1,U).xp,0);
 assert.equal(store.getXP(G1,U).bio,'a biography');
 assert.equal(store.isOptedOut(U),true);
 store.eraseUser(U,'bio',G1);
 assert.equal(store.getXP(G1,U).bio,'');
 assert.equal(store.eraseUser(U,'lfg',G1).listings.length,1);
 assert.equal(store.getLfg(G1,U),null);
});
test('legacy JSON import copies data once without deleting original files',t=>{
 const {store,dir}=temporary(t);
 const members={};
 members[G1+':'+U]={riotId:'Legacy#NA1',rank:'Silver 1'};
 const users={};users[G1+':'+U]={xp:500,bio:'legacy bio'};
 fs.writeFileSync(path.join(dir,'members.json'),JSON.stringify(members));
 fs.writeFileSync(path.join(dir,'community.json'),JSON.stringify({users,rooms:{}}));
 assert.equal(store.legacyPending(dir),true);
 assert.equal(store.hasActiveData(),false);
 const result=store.importLegacy(members,{users,rooms:{}});
 assert.deepEqual(result,{profiles:1,xp:1,rooms:0});
 assert.equal(store.getProfile(G1,U).riotId,'Legacy#NA1');
 assert.equal(store.getXP(G1,U).xp,500);
 assert.equal(store.legacyPending(dir),false);
 assert.throws(()=>store.importLegacy(members,{users}),/already performed/);
 store.eraseUser(U,'all',G1);
 assert.equal(store.hasActiveData(),true);
 assert.throws(()=>store.importLegacy(members,{users}),/already performed/);
 assert.equal(fs.existsSync(path.join(dir,'members.json')),true);
});
