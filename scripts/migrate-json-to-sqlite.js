import fs from 'node:fs';
import path from 'node:path';
import { resolveBotDataDir } from '../src/data-dir.js';
import { openStore } from '../src/store.js';

const args=process.argv.slice(2);
const apply=args.includes('--apply');
const index=args.indexOf('--backup-dir');
const backupArg=index>=0?args[index+1]:null;
const dir=resolveBotDataDir();
const sourceFiles=['members.json','community.json'];
const existing=sourceFiles.filter(name=>fs.existsSync(path.join(dir,name)));
const read=name=>existing.includes(name)?JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')):{};
const members=read('members.json');
const community=read('community.json');
const overview={
 profiles:Object.keys(members).length,
 xpProfiles:Object.keys(community.users||{}).length,
 voiceRooms:Object.keys(community.rooms||{}).length,
 note:'Temporary LFG listing IDs were in memory in the legacy bot; they cannot be recovered.'
};
console.log(JSON.stringify({action:apply?'IMPORT':'DRY RUN',legacyFiles:existing,counts:overview},null,2));
if(!apply){console.log('No data changed. Stop the running old bot, verify private backups, and use --apply --backup-dir /absolute/safe/location only after approval.');process.exit(0);}
if(existing.length===0){console.error('No JSON files to migrate. No changes made.');process.exit(1);}
if(!backupArg||!path.isAbsolute(backupArg)){console.error('Provide an absolute --backup-dir outside the bot data folder.');process.exit(1);}
const backupRoot=path.resolve(backupArg);
fs.mkdirSync(backupRoot,{recursive:true,mode:0o700});
const realDir=fs.realpathSync(dir),realBackup=fs.realpathSync(backupRoot);
const inside=realBackup===realDir||realBackup.startsWith(realDir+path.sep);
if(inside){console.error('Backup directory must be outside the bot data directory.');process.exit(1);}
const store=openStore();
try{
 if(!store.legacyPending(dir))throw Error('Legacy data was already imported; refusing to import a second time.');
 if(store.hasActiveData())throw Error('SQLite already contains personal records. Stop and review before attempting a merge.');
 const backupFolder=fs.mkdtempSync(path.join(backupRoot,'ufobot-legacy-'));
 fs.chmodSync(backupFolder,0o700);
 for(const name of existing)fs.copyFileSync(path.join(dir,name),path.join(backupFolder,name),fs.constants.COPYFILE_EXCL);
 console.log('Private backup copies created outside the data directory. Do not share the files.');
 const result=store.importLegacy(members,community);
 console.log(JSON.stringify({result:'IMPORTED',counts:result,note:'Original JSON files remain unchanged and must be handled under the retention policy. Database import can only be run once.'},null,2));
}finally{store.close();}
