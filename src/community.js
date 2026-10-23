import fs from 'node:fs';
import path from 'node:path';
import { setting } from './runtime-settings.js';
import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';

const folder=path.resolve(process.env.BLIGHTED_BOT_DATA_DIR||'data');
fs.mkdirSync(folder,{recursive:true});
const filepath=path.join(folder,'community.json');
let records=fs.existsSync(filepath)?JSON.parse(fs.readFileSync(filepath,'utf8')):{users:{},rooms:{}};
records.users??={};records.rooms??={};
const persist=()=>{const tmp=filepath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(records,null,2));fs.renameSync(tmp,filepath);};
const profileKey=(guildId,userId)=>guildId+':'+userId;
const levelOf=(xp)=>Math.floor(Math.sqrt(xp/100));
const nextXP=(level)=>100*(level+1)**2;
const safeBio=s=>s?.replace(/[\r\n]/g,' ').slice(0,160)??'';
const cooldown=new Map();
const commands=[
 new SlashCommandBuilder().setName('xp').setDescription('View your server XP and level').addUserOption(o=>o.setName('user').setDescription('Member to inspect')),
 new SlashCommandBuilder().setName('leaderboard').setDescription('Show the top server XP earners'),
 new SlashCommandBuilder().setName('server-profile').setDescription('View a custom server profile').addUserOption(o=>o.setName('user').setDescription('Member')),
 new SlashCommandBuilder().setName('reset-profile').setDescription('Delete your XP and server profile biography'),
 new SlashCommandBuilder().setName('setbio').setDescription('Update your public server bio').addStringOption(o=>o.setName('bio').setDescription('Up to 160 characters').setRequired(true).setMaxLength(160)),
 new SlashCommandBuilder().setName('tempvoice').setDescription('Create a temporary voice room').addStringOption(o=>o.setName('name').setDescription('Channel name').setMaxLength(40)).addIntegerOption(o=>o.setName('limit').setDescription('User limit (0–20)').setMinValue(0).setMaxValue(20)),
 new SlashCommandBuilder().setName('tempvoice-close').setDescription('Close your empty temporary voice room')
].map(c=>c.toJSON());
export function registerCommunity(client){
 client.on('messageCreate',message=>{
  if(!message.guild || message.author.bot || message.webhookId || !setting('xpEnabled',process.env.XP_ENABLED!=='false'))return;
  const k=profileKey(message.guildId,message.author.id);
  const now=Date.now();
  if(now-(cooldown.get(k)||0)<setting('xpCooldownSeconds',60)*1000)return;
  cooldown.set(k,now);
  const user=records.users[k]??{xp:0,bio:''};
  user.xp+=setting('xpPerMessage',15);
  records.users[k]=user;persist();
 });
 client.on('voiceStateUpdate',async(oldState,newState)=>{
  for(const id of new Set([oldState.channelId,newState.channelId].filter(Boolean))){
   const room=records.rooms[id];if(!room)continue;
   const channel=oldState.guild.channels.cache.get(id);
   if(!channel){delete records.rooms[id];persist();continue;}
   if(channel.members.size===0){await channel.delete('UFO Bot: unused temporary voice room').catch(()=>{});delete records.rooms[id];persist();}
  }
 });
 client.on('ready',async()=>{
  for(const [id,room] of Object.entries(records.rooms)){
   const guild=client.guilds.cache.get(room.guild);
   if(!guild)continue;
   const channel=await guild.channels.fetch(id).catch(()=>null);
   if(!channel){delete records.rooms[id];continue;}
   if(channel.members.size===0){await channel.delete('UFO Bot: clean unused temporary voice room').catch(()=>{});delete records.rooms[id];}
  }
  persist();
 });
 client.on('interactionCreate',async i=>{
  if(!i.isChatInputCommand()||!i.inGuild())return;
  if(!commands.some(c=>c.name===i.commandName))return;
  try{
   const cmd=i.commandName;
   if(cmd==='tempvoice'){
    const name=i.options.getString('name')||i.user.username+"'s Room";
    const limit=i.options.getInteger('limit')??Math.min(99,Math.max(1,setting('tempvoiceLimit',5)));
    const owned=Object.entries(records.rooms).find(([,v])=>v.guild===i.guildId&&v.owner===i.user.id);
    if(owned)return i.reply({content:'You already own a temporary room: <#'+owned[0]+'>',flags:MessageFlags.Ephemeral});
    const categoryId=setting('tempvoiceCategory',process.env.TEMPVOICE_CATEGORY_ID||'')||null;
    let parent=null;
    if(categoryId){
     const category=await i.guild.channels.fetch(categoryId).catch(()=>null);
     if(!category||category.type!==ChannelType.GuildCategory) return i.reply({content:'Temporary voice category is misconfigured.',flags:MessageFlags.Ephemeral});
     parent=category.id;
    }
    const channel=await i.guild.channels.create({name,type:ChannelType.GuildVoice,parent,userLimit:limit,reason:'UFO Bot temporary voice for '+i.user.username});
    records.rooms[channel.id]={guild:i.guildId,owner:i.user.id,created:Date.now()};persist();
    return i.reply({content:'Your room is ready: <#'+channel.id+'>. It will be deleted when everyone leaves.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='tempvoice-close'){
    const owned=Object.entries(records.rooms).find(([,v])=>v.guild===i.guildId&&v.owner===i.user.id);
    if(!owned)return i.reply({content:'You have no temporary room.',flags:MessageFlags.Ephemeral});
    const ch=await i.guild.channels.fetch(owned[0]).catch(()=>null);
    if(ch?.members.size)return i.reply({content:'The room must be empty before closing.',flags:MessageFlags.Ephemeral});
    await ch?.delete('Room owner closed it');delete records.rooms[owned[0]];persist();
    return i.reply({content:'Your temporary room was closed.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='reset-profile'){
    delete records.users[profileKey(i.guildId,i.user.id)];persist();
    return i.reply({content:'Your XP and custom profile biography have been deleted. Use /unlink separately to remove your Riot ID and role selections.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='setbio'){
    const k=profileKey(i.guildId,i.user.id);
    records.users[k]??={xp:0,bio:''};
    records.users[k].bio=safeBio(i.options.getString('bio'));persist();
    return i.reply({content:'Your server bio has been updated.',flags:MessageFlags.Ephemeral});
   }
   if(cmd==='leaderboard'){
    const entries=Object.entries(records.users).filter(([k])=>k.startsWith(i.guildId+':')).sort((a,b)=>b[1].xp-a[1].xp).slice(0,10);
    const lines=entries.map(([k,v],index)=> (index+1)+'. <@'+k.split(':')[1]+'> · Level '+levelOf(v.xp)+' · '+v.xp+' XP');
    return i.reply({embeds:[new EmbedBuilder().setTitle('UFO Bot · Server XP').setDescription(lines.join('\n')||'No XP earned yet.').setColor(0x9c7cff)],allowedMentions:{parse:[]}});
   }
   const target=i.options.getUser('user')||i.user;
   const user=records.users[profileKey(i.guildId,target.id)]||{xp:0,bio:''};
   const level=levelOf(user.xp);
   const embed=new EmbedBuilder().setTitle('UFO Bot · '+target.username).setThumbnail(target.displayAvatarURL()).setColor(0x9c7cff).addFields({name:'Server level',value:String(level),inline:true},{name:'XP',value:user.xp+' / '+nextXP(level),inline:true});
   if(cmd==='server-profile')embed.addFields({name:'Bio',value:user.bio||'No bio set. Use /setbio.'});
   return i.reply({embeds:[embed]});
  }catch(err){console.error('Community command:',err);if(!i.replied&&!i.deferred)await i.reply({content:'Unable to complete that command. Check Manage Channels permissions and server setup.',flags:MessageFlags.Ephemeral}).catch(()=>{});}
 });
}
export {commands as communityCommands};
