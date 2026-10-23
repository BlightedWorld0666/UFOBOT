import crypto from 'node:crypto';
import readline from 'node:readline/promises';
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
const user=(await rl.question('Admin username [Admin]: ')).trim()||'Admin';
const password=await rl.question('Password (input visible; use a private terminal): ');
rl.close();
if(password.length<5){console.error('Password too short.');process.exit(1);}
const salt=crypto.randomBytes(16).toString('hex');
const hash='scrypt:'+salt+':'+crypto.scryptSync(password,salt,64).toString('hex');
const master=crypto.randomBytes(32).toString('base64');
console.log('\nPut these values in a LOCAL .env file (never GitHub):');
console.log('DASHBOARD_USERNAME='+user);
console.log('DASHBOARD_PASSWORD_HASH='+hash);
console.log('DASHBOARD_MASTER_KEY='+master);
console.log('DASHBOARD_HOST=127.0.0.1');
console.log('DASHBOARD_PORT=8792');
console.log('\nSave the master key securely. Losing it makes stored secrets undecryptable.');
