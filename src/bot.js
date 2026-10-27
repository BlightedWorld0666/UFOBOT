import 'dotenv/config';
import { openStore, levelInfo } from './store.js';
import http from 'node:http';
import { registerCommunity, communityCommands } from './community.js';
import { setting } from './runtime-settings.js';
import { lookupRiotAccount } from './riot-account.js';
import { guideFor, riotLookupExplanation, riotKeySummary } from './bot-guide.js';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, MessageFlags, ButtonBuilder, ButtonStyle } from 'discord.js';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, RIOT_API_KEY, HUB_API_KEY, RANK_LOG_CHANNEL_ID, LFG_CHANNEL_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) throw Error('Set DISCORD_TOKEN, DISCORD_CLIENT_ID and DISCORD_GUILD_ID in .env');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates] });
const store=openStore();
if(store.legacyPending())throw Error('Legacy JSON bot data found. STOP: run npm run data:plan, then back up and explicitly migrate before running this build. No records were deleted.');
const get=(guild,user)=>store.getProfile(guild,user);
const put=(guild,user,patch)=>store.putProfile(guild,user,patch);
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
const lfgModes=['Competitive','Unrated','Swiftplay','Premier','Deathmatch'];
const commands=[
 new SlashCommandBuilder().setName('erasedata').setDescription('Erase your UFO Bot profile and revoke stored data').addStringOption(o=>o.setName('scope').setDescription('All servers, or one category in this server').addChoices({name:'Everything across all servers',value:'all'},{name:'Riot ID and rank',value:'riot'},{name:'XP and passive collection',value:'xp'},{name:'Biography',value:'bio'},{name:'Agent selections',value:'agents'},{name:'Active LFG',value:'lfg'})),
 new SlashCommandBuilder().setName('ping').setDescription('Check the Discord gateway response'),
 new SlashCommandBuilder().setName('server-info').setDescription('Show this Discord server summary'),
 new SlashCommandBuilder().setName('help').setDescription('Explore UFO Bot commands and privacy boundaries').addStringOption(o=>o.setName('topic').setDescription('Help category').addChoices({name:'Overview',value:'overview'},{name:'Identity & rank',value:'identity'},{name:'LFG & voice',value:'squad'},{name:'XP & profiles',value:'progress'},{name:'Staff & safety',value:'staff'})),
 new SlashCommandBuilder().setName('bot-status').setDescription('See Discord, community settings, and Riot API readiness'),
 new SlashCommandBuilder().setName('setup-agents').setDescription('Post persistent agent selection menus').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 new SlashCommandBuilder().setName('link').setDescription('Attach a Riot ID to your Discord profile (not ownership verification)').addStringOption(o=>o.setName('riot_id').setDescription('YourName#TAG').setRequired(true)).addStringOption(o=>o.setName('region').setDescription('Account routing region').addChoices({name:'Americas',value:'americas'},{name:'Europe',value:'europe'},{name:'Asia',value:'asia'})),
 new SlashCommandBuilder().setName('unlink').setDescription('Remove your associated Riot ID and claimed rank'),
 new SlashCommandBuilder().setName('profile').setDescription('Show your Valorant profile').addUserOption(o=>o.setName('user').setDescription('Member')),
 new SlashCommandBuilder().setName('claim-rank').setDescription('Claim your competitive rank (marked unverified)').addStringOption(o=>o.setName('rank').setDescription('Claimed rank').setRequired(true).addChoices(...rankChoices)),
 new SlashCommandBuilder().setName('sync').setDescription('Recheck linked Riot ID where an authorized lookup is available'),
 new SlashCommandBuilder().setName('lfg').setDescription('Post a looking-for-group listing').addStringOption(o=>o.setName('mode').setDescription('Queue').setRequired(true).addChoices(...lfgModes.map(m=>({name:m,value:m})))).addIntegerOption(o=>o.setName('spots').setDescription('Open spots (1–4)').setRequired(true).setMinValue(1).setMaxValue(4)).addStringOption(o=>o.setName('notes').setDescription('Optional short message').setMaxLength(160)),
 new SlashCommandBuilder().setName('lfg-close').setDescription('Close your latest looking-for-group listing'),
 new SlashCommandBuilder().setName('verify-rank').setDescription('Staff: mark a member rank verified after independently checking evidence').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('rank').setDescription('Verified rank').setRequired(true).addChoices(...rankChoices))
].map(c=>c.toJSON()).concat(communityCommands);

async function ensureRole(guild,name){
 const existing=guild.roles.cache.find(r=>r.name===name);
 if(existing) return existing;
 return guild.roles.create({name,reason:'UFO Bot Valorant self-service roles'});
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
async function announceRank(guild,userId,oldRank,newRank,reason){
 const channelId=setting('logChannel',RANK_LOG_CHANNEL_ID||'');
 if(!channelId || oldRank===newRank) return;
 const ch=await guild.channels.fetch(channelId).catch(()=>null);
 if(!ch?.isTextBased()) return;
 await ch.send({content:'Rank update · <@'+userId+'> · '+(oldRank||'Unknown')+' → '+newRank+' ('+reason+')',allowedMentions:{parse:[]}}).catch(()=>{});
}
const bootedAt=Date.now();
if(HUB_API_KEY){
 const port=Number(process.env.HUB_PORT||8791);
 const server=http.createServer((req,res)=>{
  const pathOnly=(req.url||'').split('?')[0];
  if(pathOnly!=='/health'){res.writeHead(404).end();return;}
  if(req.headers.authorization!=='Bearer '+HUB_API_KEY){res.writeHead(401).end();return;}
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({service:'UFO Bot',status:client.isReady()?'online':'starting',uptimeSeconds:Math.floor((Date.now()-bootedAt)/1000),guilds:client.guilds.cache.size,linkedProfiles:store.countLinkedProfiles(),rankProvider:'manual_only',autoRankSync:false}));
 });
 server.listen(port,'127.0.0.1',()=>console.log('Hub health bound to 127.0.0.1:'+port));
}
function panelRows(){
 return Object.entries(agents).map(([group,list])=>
  new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('agent:'+group).setPlaceholder(group+' — select your mains (or clear)').setMinValues(0).setMaxValues(list.length).addOptions(list.map(a=>({label:a,value:a}))))
 );
}
async function eraseInteraction(i,scope){
 const uid=i.user.id,gid=i.guildId;
 // Transaction first: Discord cleanup failures must never prevent local erasure.
 const resources=store.eraseUser(uid,scope,gid);
 let failures=0;
 for(const p of resources.profiles){
  const guild=client.guilds.cache.get(p.guildId);
  if(!guild){failures++;continue;}
  const member=await guild.members.fetch(uid).catch(()=>null);
  if(!member){failures++;continue;}
  try{
   if(scope==='all'||scope==='riot')await updateRankRole(member,{rank:null});
   if(scope==='all'||scope==='agents')await updateAgentRoles(member,[]);
  }catch{failures++;}
 }
 for(const listing of resources.listings){
  try{const channel=await client.channels.fetch(listing.channelId);const msg=await channel?.messages?.fetch(listing.messageId);if(msg)await msg.delete();}
  catch{failures++;}
 }
 for(const room of resources.rooms){
  try{
   const guild=client.guilds.cache.get(room.guildId);
   const channel=await guild?.channels.fetch(room.channelId);
   if(channel && channel.members.size===0)await channel.delete('Owner erased UFO Bot data');
   else if(channel)failures++;
  }catch{failures++;}
 }
 const all=scope==='all';
 return (all?'Your bot profile, XP, Riot ID/rank, agent selections, LFG and temporary-room ownership records were deleted across all bot servers.':'Your '+scope+' records in this server were deleted.')+
  (all||scope==='xp'?' Automatic XP tracking is OFF until you use /xp-optin; only your Discord ID is retained to honor that preference.':'')+
  (failures?' Some Discord-side roles/messages/channels could not be cleaned ('+failures+' operations); your database erasure was still completed.':'')+
  ' Existing Discord message history and independently retained backups may require operator follow-up. /privacy explains the scope.';
}
registerCommunity(client,store);
client.once('ready',()=>console.log('UFO Bot online: '+client.user.tag));
client.on('interactionCreate',async(i)=>{
 if(!i.inGuild()) return;
 try {
  if(i.isStringSelectMenu()&&i.customId.startsWith('agent:')){
   if(!setting('agentRoles',true))return i.reply({content:'Agent selections are disabled by this server.',flags:MessageFlags.Ephemeral});
   const group=i.customId.slice(6),allowed=agents[group]; if(!allowed) return;
   const entry=get(i.guildId,i.user.id),selected=(entry.agents||[]).filter(a=>!allowed.includes(a)).concat(i.values.filter(a=>allowed.includes(a)));
   await i.deferReply({flags:MessageFlags.Ephemeral});
   await updateAgentRoles(await i.guild.members.fetch(i.user.id),selected);
   put(i.guildId,i.user.id,{agents:selected});
   return i.editReply('Agent roles updated: '+(selected.join(', ')||'none'));
  }
  if(i.isButton()&&i.customId==='erase-cancel:'+i.user.id){await i.deferUpdate();return i.editReply({content:'Deletion canceled. Nothing was changed.',components:[],embeds:[]});}
  if(i.isButton()&&i.customId.startsWith('erase:')){
   const [prefix,scope,requester]=i.customId.split(':');
   if(requester!==i.user.id)return i.reply({content:'Only the requesting member can confirm this deletion.',flags:MessageFlags.Ephemeral});
   if(!['all','riot','xp','bio','agents','lfg'].includes(scope))return;
   await i.deferUpdate();
   return i.editReply({content:await eraseInteraction(i,scope),components:[],embeds:[]});
  }
  if(!i.isChatInputCommand()) return;
  const cmd=i.commandName, uid=i.user.id, entry=get(i.guildId,uid);
  if(cmd==='erasedata'){
   const scope=i.options.getString('scope')||'all';
   const description=scope==='all'?'ALL your saved UFO Bot data across every Discord server using this bot':scope+' information in this server';
   const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('erase:'+scope+':'+uid).setLabel('Confirm deletion').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('erase-cancel:'+uid).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
   );
   return i.reply({content:'**Confirm deletion of '+description+'.** This cannot be undone from the live database. After a full erase, only a minimal Discord ID is retained to prevent future automatic XP tracking. Discord messages and historical backups may require separate removal.',components:[row],flags:MessageFlags.Ephemeral});
  }
  if(cmd==='ping')return i.reply({content:'Pong! Discord gateway: '+(client.isReady()?'connected':'starting')+'.',flags:MessageFlags.Ephemeral});
  if(cmd==='server-info')return i.reply({embeds:[new EmbedBuilder().setTitle(i.guild.name).setColor(0xab9bf4).addFields(
   {name:'Members',value:String(i.guild.memberCount??'Unknown'),inline:true},
   {name:'Server ID',value:i.guildId,inline:true},
   {name:'XP',value:setting('xpEnabled',true)?'Enabled':'Disabled',inline:true},
   {name:'LFG',value:setting('lfgEnabled',true)?'Enabled':'Disabled',inline:true}
  )],flags:MessageFlags.Ephemeral});
  if(cmd==='help'){
   const guide=guideFor(i.options.getString('topic'));
   return i.reply({embeds:[new EmbedBuilder().setTitle(guide.title).setDescription(guide.description).addFields(guide.fields).setColor(0xab9bf4).setFooter({text:'UFO Bot · Community features are separate from Riot rank verification'})],flags:MessageFlags.Ephemeral});
  }
  if(cmd==='bot-status'){
   const on=name=>setting(name,true)?'Enabled':'Disabled';
   const details=new EmbedBuilder().setTitle('UFO Bot · Connection & Capabilities').setColor(0xab9bf4)
    .setDescription('Read-only overview of this running process. It does not test Riot credentials or the Windows Hub.')
    .addFields(
     {name:'Discord gateway',value:client.isReady()?'Connected':'Connecting / unavailable',inline:true},
     {name:'XP',value:on('xpEnabled'),inline:true},
     {name:'LFG',value:on('lfgEnabled'),inline:true},
     {name:'Agent selection',value:on('agentRoles'),inline:true},
     {name:'Rank claims',value:on('rankClaims'),inline:true},
     {name:'Riot API',value:riotKeySummary(Boolean(RIOT_API_KEY))},
     {name:'Rank trust model',value:'Manual member claims or independent staff checks only. No official rank auto-sync or Riot account ownership verification.'},
     {name:'Help & privacy',value:'Use /help for all commands. /unlink and /reset-profile remove different categories of user data.'}
    );
   return i.reply({embeds:[details],flags:MessageFlags.Ephemeral});
  }
  if(cmd==='setup-agents'){
   if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return i.reply({content:'Manage Server permission is required.',flags:MessageFlags.Ephemeral});
   if(!setting('agentRoles',true))return i.reply({content:'Agent selections are disabled in the dashboard.',flags:MessageFlags.Ephemeral});
   await i.channel.send({embeds:[new EmbedBuilder().setTitle('Choose your VALORANT agents').setDescription('Pick multiple agent mains in each class. Re-select to update; clear a class to remove those roles.').setColor(0xff4655)],components:panelRows()});
   return i.reply({content:'Agent selection panel posted.',flags:MessageFlags.Ephemeral});
  }
  if(cmd==='link'){
   const id=i.options.getString('riot_id').trim(), region=i.options.getString('region')||'americas';
   if(!/^[^#\n]{3,16}#[^#\n]{3,5}$/.test(id)) return i.reply({content:'Use a Riot ID such as Player#NA1 (3–16 character name and 3–5 character tag).',flags:MessageFlags.Ephemeral});
   await i.deferReply({flags:MessageFlags.Ephemeral});
   const lookup=await lookupRiotAccount({riotId:id,region,apiKey:RIOT_API_KEY});
   if(lookup.status==='not_found')return i.editReply('Riot ID not found by the account lookup. Check the spelling and region; nothing was changed.');
   if(lookup.status==='invalid_input')return i.editReply('Invalid Riot ID or region; nothing was changed.');
   const found=lookup.status==='found',linked=found?lookup.id:id;
   put(i.guildId,uid,{riotId:linked,region,puuid:found?lookup.puuid:null,accountFound:found,lastAccountLookupAt:found?Date.now():null,verified:false,rank:null});
   await updateRankRole(await i.guild.members.fetch(uid),{rank:null});
   const note=found
    ? 'Riot Account API found that ID, but **this does NOT verify account ownership or rank**.'
    : riotLookupExplanation(lookup.status)+' **This is a self-entered ID, not ownership or rank verification.**';
   return i.editReply({content:'Saved Riot ID: '+linked+'. '+note+' Use /claim-rank for an unverified claim, or /unlink to remove the association.',allowedMentions:{parse:[]}});
  }
  if(cmd==='lfg'){
   if(!setting('lfgEnabled',true))return i.reply({content:'Looking-for-group is disabled in the dashboard.',flags:MessageFlags.Ephemeral});
   const mode=i.options.getString('mode'),spots=i.options.getInteger('spots'),notes=i.options.getString('notes')||'Ready to queue';
   const targetChannel=setting('lfgChannel',LFG_CHANNEL_ID||'');
   const channel=targetChannel?await i.guild.channels.fetch(targetChannel).catch(()=>null):i.channel;
   if(!channel?.isTextBased()) return i.reply({content:'LFG channel unavailable.',flags:MessageFlags.Ephemeral});
   const previous=store.getLfg(i.guildId,uid);
   if(previous){
    const oldChannel=await i.guild.channels.fetch(previous.channelId).catch(()=>null);
    const old=await oldChannel?.messages.fetch(previous.messageId).catch(()=>null);
    if(old)await old.delete().catch(()=>{});
   }
   const p=get(i.guildId,uid),message=await channel.send({embeds:[new EmbedBuilder().setTitle('Looking for '+spots+' · '+mode).setDescription(notes).addFields({name:'Host',value:'<@'+uid+'>',inline:true},{name:'Rank',value:p.rank?(p.rank+(p.verified?' · Staff checked':' · Unverified')):'Not set',inline:true},{name:'Region',value:p.region||'Not set',inline:true},{name:'Agents',value:(p.agents||[]).join(', ')||'Not set'}).setColor(0xff4655)],allowedMentions:{parse:[]}});
   try{store.saveLfg(i.guildId,uid,channel.id,message.id);}catch(error){await message.delete().catch(()=>{});throw error;}
   return i.reply({content:'LFG posted in <#'+channel.id+'>. Use /lfg-close when finished.',flags:MessageFlags.Ephemeral});
  }
  if(cmd==='lfg-close'){
   const listing=store.getLfg(i.guildId,uid);
   if(!listing)return i.reply({content:'You have no active saved LFG listing.',flags:MessageFlags.Ephemeral});
   const channel=await i.guild.channels.fetch(listing.channelId).catch(()=>null);
   const msg=await channel?.messages.fetch(listing.messageId).catch(()=>null);
   if(msg)await msg.delete().catch(()=>{});
   store.deleteLfg(i.guildId,uid);
   return i.reply({content:'Your listing was closed.',flags:MessageFlags.Ephemeral});
  }
  if(cmd==='unlink'){
   store.deleteProfile(i.guildId,uid);
   const member=await i.guild.members.fetch(uid);await updateRankRole(member,{rank:null});await updateAgentRoles(member,[]);
   return i.reply({content:'Riot ID, rank claims and agent selections removed.',flags:MessageFlags.Ephemeral});
  }
  if(cmd==='claim-rank'){
   if(!setting('rankClaims',true))return i.reply({content:'Rank claims are disabled in the dashboard.',flags:MessageFlags.Ephemeral});
   if(!entry.riotId) return i.reply({content:'First use /link.',flags:MessageFlags.Ephemeral});
   const rank=i.options.getString('rank');put(i.guildId,uid,{rank,verified:false});
   await updateRankRole(await i.guild.members.fetch(uid),{rank,verified:false});
   return i.reply({content:'Claimed '+rank+'. You have **Unverified Rank** until a trusted verification is performed.',flags:MessageFlags.Ephemeral});
  }
  if(cmd==='verify-rank'){
   if(!i.memberPermissions?.has(PermissionFlagsBits.ManageRoles))return i.reply({content:'Manage Roles permission is required for staff checks.',flags:MessageFlags.Ephemeral});
   const user=i.options.getUser('user'),record=get(i.guildId,user.id);
   if(!record.riotId) return i.reply({content:'That member has not linked an ID.',flags:MessageFlags.Ephemeral});
   const rank=i.options.getString('rank');put(i.guildId,user.id,{rank,verified:true,verifiedBy:uid});
   await updateRankRole(await i.guild.members.fetch(user.id),{rank,verified:true});
   await announceRank(i.guild,user.id,record.rank,rank,'staff checked');
   return i.reply({content:'Staff verification recorded for '+user.username+': '+rank+'.',flags:MessageFlags.Ephemeral});
  }
  if(cmd==='sync'){
   if(!entry.riotId) return i.reply({content:'First use /link.',flags:MessageFlags.Ephemeral});
   await i.deferReply({flags:MessageFlags.Ephemeral});
   const lookup=await lookupRiotAccount({riotId:entry.riotId,region:entry.region||'americas',apiKey:RIOT_API_KEY});
   if(lookup.status==='found'){
    put(i.guildId,uid,{puuid:lookup.puuid,accountFound:true,lastAccountLookupAt:Date.now()});
    return i.editReply('Riot Account API found that ID again. **It does NOT prove ownership or competitive rank.** No rank role was changed.');
   }
   const note=lookup.status==='not_found'?'Riot Account API could not find that ID.':riotLookupExplanation(lookup.status);
   return i.editReply(note+' Your stored ID and rank roles were not changed.');
  }
  if(cmd==='profile'){
   const target=i.options.getUser('user')||i.user, p=get(i.guildId,target.id);
   const lookupStatus=p.accountFound?'Identifier found via Riot API (ownership not verified)':'Not checked / not available';
   const experience=levelInfo(store.getXP(i.guildId,target.id).xp);
   const remaining=experience.next-experience.xp;
   const embed=new EmbedBuilder().setTitle('VALORANT · '+target.username).setColor(0xab9bf4)
    .addFields(
     {name:'Riot ID (self-entered)',value:p.riotId||'Not linked',inline:true},
     {name:'Region',value:p.region||'Not set',inline:true},
     {name:'ID lookup',value:p.riotId?lookupStatus:'No linked ID'},
     {name:'Rank',value:p.rank?p.rank+' · '+(p.verified?'Staff checked (not Riot verified)':'Unverified claim'):'Not supplied'},
     {name:'Agent mains',value:(p.agents||[]).join(', ')||'None'},
     {name:'Server XP',value:experience.xp.toLocaleString()+' XP · Level '+experience.level+' · '+remaining.toLocaleString()+' XP to next level'}
    ).setFooter({text:'Riot ID lookup does not authenticate ownership. Competitive ranks are not API-verified.'});
   return i.reply({embeds:[embed],flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  }
 }catch(e){console.error(e);if(i.deferred||i.replied)await i.editReply('Command failed. Check that my role is above the roles I manage and that I have Manage Roles.').catch(()=>{});else await i.reply({content:'Command failed. Check bot role permissions.',flags:MessageFlags.Ephemeral}).catch(()=>{});}
});
await new REST({version:'10'}).setToken(DISCORD_TOKEN).put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID,DISCORD_GUILD_ID),{body:commands});
await client.login(DISCORD_TOKEN);
