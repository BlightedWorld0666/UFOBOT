import fs from 'node:fs';
import path from 'node:path';
import { resolveBotDataDir } from './data-dir.js';

// Shared local settings written by the authenticated dashboard server.
// Reloads when the file changes, so community controls can apply without restart.
const filename=path.join(resolveBotDataDir(),'dashboard.json');
let stamp=-1;
let values={};
export function setting(name,fallback){
 try{
  const stat=fs.statSync(filename);
  if(stat.mtimeMs!==stamp){
   const parsed=JSON.parse(fs.readFileSync(filename,'utf8'));
   values=parsed && typeof parsed.settings==='object' && parsed.settings!==null?parsed.settings:{};
   stamp=stat.mtimeMs;
  }
 }catch(error){
  if(error.code==='ENOENT'){stamp=-1;values={};}
  else console.warn('UFO settings read failed:',error.message);
 }
 return Object.prototype.hasOwnProperty.call(values,name)?values[name]:fallback;
}
