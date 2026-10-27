import { setting } from './runtime-settings.js';
import { levelInfo } from './store.js';
import { SlashCommandBuilder, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';

const commands=[
 new SlashCommandBuilder().setName('xp').setDescription('View XP, level and progress to the next level').addUserOption(o=>o.setName('user').setDescription('Member to inspect')),
 new SlashCommandBuilder().setName('leaderboard').setDescription('Show the server top 10 XP earners'),
 new SlashCommandBuilder().setName('server-profile').setDescription('View a member bio and server progression').addUserOption(o=>o.setName('user').setDescription('Member')),
 new SlashCommandBuilder().setName('reset-profile').setDescription('Delete your XP and public biography; disables future passive XP'),
 new SlashCommandBuilder().setName('setbio').setDescription('Set your public server bio').addStringOption(o=>o.setName('bio').setDescription('Up to 160 characters').setRequired(true).setMaxLength(160)),
 new SlashCommandBuilder().setName('xp-optout').setDescription('Stop automatic XP collection and keep your current XP'),
 new SlashCommandBuilder().setName('xp-optin').setDescription('Allow automatic XP collection again'),
 new SlashCommandBuilder().setName('privacy').setDescription('View stored data, opt-out and erasure controls'),
 new SlashCommandBuilder().setName('tempvoice').setDescription('Create one temporary voice room').addStringOption(o=>o.setName('name').setDescription('Room name').setMaxLength(40)).addIntegerOption(o=>o.setName('limit').setDescription('Maximum users (0–20)').setMinValue(0).setMaxValue(20)),
 new SlashCommandBuilder().setName('tempvoice-close').setDescription('Close your empty temporary voice room')
].map(c=>c.toJSON());

export function registerCommunity(client,store){
 client.on('messageCreate',message=>{
  if(!message.guild||message.author.bot||message.webhookId||!setting('xpEnabled',process.env.XP_ENABLED!=='false'))return;
  try{store.awardXP(message.guildId,message.author.id,setting('xpPerMessage',15),setting('xpCooldownSeconds',60));}
  catch(error){console.error('XP database write failed:',error.message);}
 });
 client.on('voiceStateUpdate',async(oldState,newState)=>{
  for(const id of new Set([oldState.channelId,newState.channelId].filter(Boolean))){
   const room=store.getVoice(id);if(!room)continue;
   const ch=oldState.guild.channels.cache.get(id);
   if(!ch){store.deleteVoice(id);continue;}
   if(ch.members.size===0){
    try{await ch.delete('UFO Bot: unused temporary voice room');store.deleteVoice(id);}
    catch(error){console.error('Voice cleanup failed:',error.message);}
   }
  }
 });
 client.on('ready',async()=>{
  for(const room of store.listVoice()){
   const guild=client.guilds.cache.get(room.guildId);if(!guild)continue;
   const ch=await guild.channels.fetch(room.channelId).catch(()=>null);
   if(!ch){store.deleteVoice(room.channelId);continue;}
   if(ch.members.size===0){
    try{await ch.delete('UFO Bot: clean unused room on restart');store.deleteVoice(room.channelId);}
    catch(error){console.error('Voice recovery cleanup failed:',error.message);}
   }
  }
 });
 client.on('interactionCreate',async i=>{
  if(!i.isChatInputCommand()||!i.inGuild()||!commands.some(c=>c.name===i.commandName))return;
  try{
   const cmd=i.commandName,uid=i.user.id,gid=i.guildId;
   if(cmd==='privacy'){
    return i.reply({content:'UFO Bot stores your voluntarily entered Riot ID, rank claims/agent selections, server XP/bio, active LFG and temporary-room ownership in a private local SQLite database. No Riot password or Riot OAuth tokens are stored. /erasedata lets you erase everything across the bot’s servers, or select one category in this server. /xp-optout stops passive XP. The bot retains only your Discord ID for that opt-out until /xp-optin. Existing Discord messages and operator backups are not erased automatically; contact the operator for backup retention requests.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='xp-optout'){
    store.optOut(uid);return i.reply({content:'Automatic XP tracking disabled for your Discord ID across all servers using this bot. Your current XP remains; use /erasedata for removal.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='xp-optin'){
    store.optIn(uid);return i.reply({content:'Automatic XP tracking re-enabled. New activity may accumulate XP when a server enables progression.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='tempvoice'){
    const owned=store.findVoice(gid,uid);
    if(owned)return i.reply({content:'You already own a temporary room: <#'+owned.channelId+'>',flags:MessageFlags.Ephemeral});
    const categoryId=setting('tempvoiceCategory',process.env.TEMPVOICE_CATEGORY_ID||'')||null;
    let parent=null;
    if(categoryId){
     const category=await i.guild.channels.fetch(categoryId).catch(()=>null);
     if(!category||category.type!==ChannelType.GuildCategory)return i.reply({content:'Temporary voice category is not configured correctly.',flags:MessageFlags.Ephemeral});
     parent=category.id;
    }
    const name=(i.options.getString('name')||i.user.username+"'s Room").slice(0,40);
    const limit=i.options.getInteger('limit')??Math.min(20,Math.max(0,Number(setting('tempvoiceLimit',5))||5));
    const ch=await i.guild.channels.create({name,type:ChannelType.GuildVoice,parent,userLimit:limit,reason:'UFO Bot temporary voice'});
    try{store.saveVoice(ch.id,gid,uid);}catch(error){await ch.delete('Failed to save room ownership').catch(()=>{});throw error;}
    return i.reply({content:'Created <#'+ch.id+'>. It will close after the room is empty.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='tempvoice-close'){
    const owned=store.findVoice(gid,uid);if(!owned)return i.reply({content:'You have no owned temporary room.',flags:MessageFlags.Ephemeral});
    const ch=await i.guild.channels.fetch(owned.channelId).catch(()=>null);
    if(ch?.members.size)return i.reply({content:'Your room must be empty before closing.',flags:MessageFlags.Ephemeral});
    if(ch)await ch.delete('Owner closed empty voice room');
    store.deleteVoice(owned.channelId);
    return i.reply({content:'Your temporary room was closed.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='reset-profile'){
    store.eraseUser(uid,'xp',gid);store.eraseUser(uid,'bio',gid);
    return i.reply({content:'Your XP and server biography were removed. Automatic XP stays off until /xp-optin. Use /erasedata for other stored information.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='setbio'){
    store.setBio(gid,uid,i.options.getString('bio'));
    return i.reply({content:'Your public server biography has been saved.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='leaderboard'){
    const entries=store.leaderboard(gid);
    const lines=entries.map((v,n)=>(n+1)+'. <@'+v.userId+'> · Level '+levelInfo(v.xp).level+' · '+v.xp.toLocaleString()+' XP');
    return i.reply({embeds:[new EmbedBuilder().setTitle('UFO Bot · Server XP Leaders').setDescription(lines.join('\n')||'No progression records yet.').setColor(0xab9bf4)],allowedMentions:{parse:[]}});
   }
   const target=i.options.getUser('user')||i.user;
   const data=store.getXP(gid,target.id),info=levelInfo(data.xp);
   const bar='▰'.repeat(Math.floor(info.progress/info.required*10))+'▱'.repeat(10-Math.floor(info.progress/info.required*10));
   const embed=new EmbedBuilder().setTitle('UFO Bot · '+target.username).setThumbnail(target.displayAvatarURL())
    .setColor(0xab9bf4).addFields(
      {name:'Level',value:String(info.level),inline:true},
      {name:'Total XP',value:info.xp.toLocaleString(),inline:true},
      {name:'Next level',value:bar+'\n'+info.progress.toLocaleString()+' / '+info.required.toLocaleString()+' XP',inline:false}
    );
   if(cmd==='server-profile')embed.addFields({name:'Biography',value:data.bio||'No biography saved.'});
   if(target.id===uid&&store.isOptedOut(uid))embed.setFooter({text:'Your automatic XP tracking is disabled.'});
   return i.reply({embeds:[embed],flags:MessageFlags.Ephemeral});
  }catch(error){
   console.error('Community command failed:',error.message);
   if(!i.replied&&!i.deferred)await i.reply({content:'Unable to complete that command. Check bot permissions and storage availability.',flags:MessageFlags.Ephemeral}).catch(()=>{});
  }
 });
}
export {commands as communityCommands};
