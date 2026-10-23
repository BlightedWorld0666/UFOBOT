import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, RIOT_API_KEY } = process.env;
if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) throw Error('Set DISCORD_TOKEN, DISCORD_CLIENT_ID and DISCORD_GUILD_ID in .env');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const root = path.resolve('data'); fs.mkdirSync(root, { recursive: true });
const dbFile = path.join(root, 'members.json');
let data = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, 'utf8')) : {};
const save = () => { const tmp=dbFile+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(data,null,2)); fs.renameSync(tmp,dbFile); };
const key = (guild, user) => guild+':'+user;
const get = (guild,user) => data[key(guild,user)] ?? {};
const put = (guild,user,updates) => { data[key(guild,user)]={...get(guild,user),...updates};save(); };
const tiers=['Iron','Bronze','Silver','Gold','Platinum','Diamond','Ascendant','Immortal','Radiant'];
const agents = {
 Duelist:['Jett','Reyna','Raze','Phoenix','Yoru','Neon','Iso','Waylay'],
 Initiator:['Sova','Breach','Skye','KAY/O','Fade','Gekko','Tejo'],
 Controller:['Brimstone','Viper','Omen','Astra','Harbor','Clove'],
 Sentinel:['Sage','Cypher','Killjoy','Chamber','Deadlock','Vyse']
};
const allAgents=Object.values(agents).flat();
const rankValues=tiers.flatMap(t=>t==='Radiant'?[t]:[1,2,3].map(n=>t+' '+n));
const rankChoices=rankValues.map(n=>({name:n,value:n}));
const commands=[
 new SlashCommandBuilder().setName('setup-agents').setDescription('Post persistent agent selection menus').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 new SlashCommandBuilder().setName('link').setDescription('Attach a Riot ID to your Discord profile (not ownership verification)').addStringOption(o=>o.setName('riot_id').setDescription('YourName#TAG').setRequired(true)).addStringOption(o=>o.setName('region').setDescription('Account routing region').addChoices({name:'Americas',value:'americas'},{name:'Europe',value:'europe'},{name:'Asia',value:'asia'})),
 new SlashCommandBuilder().setName('unlink').setDescription('Remove your associated Riot ID and claimed rank'),
 new SlashCommandBuilder().setName('profile').setDescription('Show your Valorant profile').addUserOption(o=>o.setName('user').setDescription('Member')),
 new SlashCommandBuilder().setName('claim-rank').setDescription('Claim your competitive rank (marked unverified)').addStringOption(o=>o.setName('rank').setDescription('Claimed rank').setRequired(true).addChoices(...rankChoices)),
 new SlashCommandBuilder().setName('sync').setDescription('Recheck linked Riot ID where an authorized lookup is available'),
 new SlashCommandBuilder().setName('verify-rank').setDescription('Staff: mark a member rank verified after independently checking evidence').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('rank').setDescription('Verified rank').setRequired(true).addChoices(...rankChoices))
].map(c=>c.toJSON());

const apiAccount=async(id,region)=>{
 if(!RIOT_API_KEY) return {status:'unavailable'};
 const [gameName,tagLine]=id.split('#');
 const url='https://'+region+'.api.riotgames.com/riot/account/v1/accounts/by-riot-id/'+encodeURIComponent(gameName)+'/'+encodeURIComponent(tagLine);
 const resp=await fetch(url,{headers:{'X-Riot-Token':RIOT_API_KEY},signal:AbortSignal.timeout(8000)});
 if(resp.status===404) return {status:'not_found'};
 if(!resp.ok) return {status:'error',code:resp.status};
 const obj=await resp.json();
 return {status:'found',id:obj.gameName+'#'+obj.tagLine,puuid:obj.puuid};
};
async function ensureRole(guild,name){
 const existing=guild.roles.cache.find(r=>r.name===name);
 if(existing) return existing;
 return guild.roles.create({name,reason:'MossadBot Valorant self-service roles'});
}
async function updateRankRole(member,record){
 const names=member.roles.cache.filter(r=>r.name==='Unverified Rank'||r.name==='Verified Rank'||tiers.some(t=>r.name===t||r.name.startsWith(t+' ')));
 for(const role of names.values()) await member.roles.remove(role).catch(()=>{});
 if(!record.rank) return;
 const rankRole=await ensureRole(member.guild,record.rank);
 const label=await ensureRole(member.guild,record.verified?'Verified Rank':'Unverified Rank');
 await member.roles.add([rankRole,label]);
}
async function updateAgentRoles(member,names){
 const previous=member.roles.cache.filter(r=>allAgents.includes(r.name));
 for(const role of previous.values()) if(!names.includes(role.name)) await member.roles.remove(role).catch(()=>{});
 for(const name of names) if(!member.roles.cache.some(r=>r.name===name)) await member.roles.add(await ensureRole(member.guild,name));
}
function panelRows(){
 return Object.entries(agents).map(([group,list])=>
  new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('agent:'+group).setPlaceholder(group+' — select your mains (or clear)').setMinValues(0).setMaxValues(list.length).addOptions(list.map(a=>({label:a,value:a}))))
 );
}
client.once('ready',()=>console.log('MossadBot online: '+client.user.tag));
client.on('interactionCreate',async(i)=>{
 if(!i.inGuild()) return;
 try {
  if(i.isStringSelectMenu()&&i.customId.startsWith('agent:')){
   const group=i.customId.slice(6),allowed=agents[group]; if(!allowed) return;
   const entry=get(i.guildId,i.user.id),selected=(entry.agents||[]).filter(a=>!allowed.includes(a)).concat(i.values.filter(a=>allowed.includes(a)));
   await i.deferReply({flags:MessageFlags.Ephemeral});
   await updateAgentRoles(await i.guild.members.fetch(i.user.id),selected);
   put(i.guildId,i.user.id,{agents:selected});
   return i.editReply('Agent roles updated: '+(selected.join(', ')||'none'));
  }
  if(!i.isChatInputCommand()) return;
  const cmd=i.commandName, uid=i.user.id, entry=get(i.guildId,uid);
  if(cmd==='setup-agents'){
   await i.channel.send({embeds:[new EmbedBuilder().setTitle('Choose your VALORANT agents').setDescription('Pick multiple agent mains in each class. Re-select to update; clear a class to remove those roles.').setColor(0xff4655)],components:panelRows()});
   return i.reply({content:'Agent selection panel posted.',flags:MessageFlags.Ephemeral});
  }
  if(cmd==='link'){
   const id=i.options.getString('riot_id').trim(), region=i.options.getString('region')||'americas';
   if(!/^[^#\n]{3,16}#[^#\n]{3,5}$/.test(id)) return i.reply({content:'Use a Riot ID such as Player#NA1 (3–16 character name and 3–5 character tag).',flags:MessageFlags.Ephemeral});
   await i.deferReply({flags:MessageFlags.Ephemeral});
   let lookup;try{lookup=await apiAccount(id,region);}catch{lookup={status:'error'};}
   if(lookup.status==='not_found') return i.editReply('Riot ID not found. Check spelling and region.');
   if(lookup.status==='error') return i.editReply('Riot account lookup unavailable right now. Try again later; nothing was changed.');
   const linked=lookup.status==='found'?lookup.id:id;
   put(i.guildId,uid,{riotId:linked,region,puuid:lookup.puuid||null,accountFound:lookup.status==='found',verified:false,rank:null});
   await updateRankRole(await i.guild.members.fetch(uid),{rank:null});
   return i.editReply('Linked '+linked+'. '+(lookup.status==='found'?'Riot ID was found, but **account ownership is NOT verified**.':'ID saved without lookup; **ownership is NOT verified**.')+' Use /claim-rank to set an unverified rank. /unlink removes your association.');
  }
  if(cmd==='unlink'){
   delete data[key(i.guildId,uid)];save();
   const member=await i.guild.members.fetch(uid);await updateRankRole(member,{rank:null});await updateAgentRoles(member,[]);
   return i.reply({content:'Riot ID, rank claims and agent selections removed.',flags:MessageFlags.Ephemeral});
  }
  if(cmd==='claim-rank'){
   if(!entry.riotId) return i.reply({content:'First use /link.',flags:MessageFlags.Ephemeral});
   const rank=i.options.getString('rank');put(i.guildId,uid,{rank,verified:false});
   await updateRankRole(await i.guild.members.fetch(uid),{rank,verified:false});
   return i.reply({content:'Claimed '+rank+'. You have **Unverified Rank** until a trusted verification is performed.',flags:MessageFlags.Ephemeral});
  }
  if(cmd==='verify-rank'){
   const user=i.options.getUser('user'),record=get(i.guildId,user.id);
   if(!record.riotId) return i.reply({content:'That member has not linked an ID.',flags:MessageFlags.Ephemeral});
   const rank=i.options.getString('rank');put(i.guildId,user.id,{rank,verified:true,verifiedBy:uid});
   await updateRankRole(await i.guild.members.fetch(user.id),{rank,verified:true});
   return i.reply({content:'Staff verification recorded for '+user.username+': '+rank+'.',flags:MessageFlags.Ephemeral});
  }
  if(cmd==='sync'){
   if(!entry.riotId) return i.reply({content:'First use /link.',flags:MessageFlags.Ephemeral});
   await i.deferReply({flags:MessageFlags.Ephemeral});
   let r;try{r=await apiAccount(entry.riotId,entry.region||'americas');}catch{r={status:'error'};}
   if(r.status==='found'){put(i.guildId,uid,{puuid:r.puuid,accountFound:true});return i.editReply('Riot ID found again. **Ownership and competitive rank are not verified.** Official rank auto-sync requires a supported, authorized provider.');}
   return i.editReply('Account lookup '+(r.status==='unavailable'?'is not configured.':r.status==='not_found'?'did not find this ID.':'failed.')+' Your role was not changed.');
  }
  if(cmd==='profile'){
   const target=i.options.getUser('user')||i.user, p=get(i.guildId,target.id);
   return i.reply({embeds:[new EmbedBuilder().setTitle('Valorant · '+target.username).addFields({name:'Riot ID',value:p.riotId||'Not linked',inline:true},{name:'Rank',value:p.rank? p.rank+' ('+(p.verified?'Staff verified':'Unverified claim')+')':'Not supplied',inline:true},{name:'Agents',value:(p.agents||[]).join(', ')||'None'}).setColor(0xff4655)],flags:MessageFlags.Ephemeral});
  }
 }catch(e){console.error(e);if(i.deferred||i.replied)await i.editReply('Command failed. Check that my role is above the roles I manage and that I have Manage Roles.').catch(()=>{});else await i.reply({content:'Command failed. Check bot role permissions.',flags:MessageFlags.Ephemeral}).catch(()=>{});}
});
await new REST({version:'10'}).setToken(DISCORD_TOKEN).put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID,DISCORD_GUILD_ID),{body:commands});
await client.login(DISCORD_TOKEN);
