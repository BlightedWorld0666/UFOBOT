'use strict';
const $=s=>document.querySelector(s);
const all=s=>[...document.querySelectorAll(s)];
const labels={overview:['Overview','System health, configuration readiness, and the controls that keep your community running.'],discord:['Discord server','Manage your community identity, channels, and role configuration.'],progression:['XP & progression','Customize how members gain experience and grow their profiles.'],voice:['Voice rooms','Configure on-demand squad channels and temporary-room defaults.'],secrets:['Credentials vault','Keep integration keys encrypted and out of the public website.'],hub:['Server Hub','Prepare UFO Bot for your central server management system.']};
let ready=false;
const api=async(path,method='GET',data)=>{
 const headers={'Accept':'application/json'};
 if(data!==undefined)headers['Content-Type']='application/json';
 const response=await fetch('/api/'+path,{method,headers,body:data!==undefined?JSON.stringify(data):undefined,credentials:'same-origin',cache:'no-store'});
 let payload;try{payload=await response.json()}catch{throw Error('Unexpected response from server')}
 if(!response.ok)throw Error(payload.error||'Request failed');
 return payload;
};
const setText=(selector,value)=>{$(selector).textContent=String(value??'—')};
function toast(selector,message,isError=false){const element=typeof selector==='string'?$(selector):selector;if(!element)return;element.textContent=message;element.classList.toggle('error',isError)}
function go(tab){
 if(!labels[tab])return;
 all('.nav button[data-tab]').forEach(button=>{const current=button.dataset.tab===tab;button.classList.toggle('active',current);if(current)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
 all('.section').forEach(section=>section.hidden=section.id!==tab);
 setText('#title',labels[tab][0]);setText('#breadcrumb',labels[tab][0]);setText('#page-description',labels[tab][1]);
 if(window.innerWidth<830)window.scrollTo({top:0,behavior:'instant'});
}
function showDashboard(){
 $('#login').classList.add('hidden');$('#app').classList.remove('hidden');ready=true;
}
function showLogin(){
 $('#app').classList.add('hidden');$('#login').classList.remove('hidden');ready=false;
}
async function loadSettings(){
 const result=await api('settings');
 all('[data-setting]').forEach(element=>{
  const value=result.settings[element.dataset.setting];
  if(element.type==='checkbox')element.checked=Boolean(value);
  else element.value=value??'';
 });
}
async function loadSecrets(){
 const result=await api('secrets');const root=$('#secretList');root.replaceChildren();
 for(const item of result.secrets){
  const row=document.createElement('div');row.className='secret-row';
  const name=document.createElement('span');name.className='secret-name';name.textContent=item.name;
  const pill=document.createElement('span');pill.className='pill'+(item.configured?' good':'');const dot=document.createElement('i');
  const text=document.createElement('span');text.textContent=item.configured?'Configured':'Not configured';pill.append(dot,text);row.append(name,pill);
  if(item.configured){
   const button=document.createElement('button');button.type='button';button.className='ghost danger';button.textContent='Remove';
   button.addEventListener('click',async()=>{
    if(!window.confirm('Remove '+item.name+' from the vault?'))return;
    button.disabled=true;
    try{await api('secrets','DELETE',{name:item.name});await loadSecrets();toast('#vaultNote','Credential removed.')}catch(e){toast('#vaultNote',e.message,true);button.disabled=false}
   });row.append(button);
  }
  root.append(row);
 }
 setText('#statSecrets',result.secrets.filter(x=>x.configured).length);
}
async function loadHealth(){
 const pill=$('#connectionPill'),dot=$('#botDot');
 try{
  const data=await api('bot-health');const active=data.status==='online',starting=data.status==='starting';
  const text=active?'Online':starting?'Starting':data.status==='not_configured'?'Not connected':'Unavailable';
  setText('#statBot',text);setText('#statBotDetail',data.message||'Live health endpoint');
  setText('#statGuilds',Number.isInteger(data.guilds)?data.guilds:'—');
  setText('#statProfiles',Number.isInteger(data.linkedProfiles)?data.linkedProfiles:'—');
  setText('#botStatusText',data.message||text);
  pill.className='pill'+(active?' good':starting?' warn':'');
  pill.replaceChildren();const point=document.createElement('i'),caption=document.createElement('span');caption.textContent='Bot '+text.toLowerCase();pill.append(point,caption);
  dot.className='status-dot'+(active?' good':starting?' warn':'');
  setText('#footerStatus','UFO BOT · BLIGHTED.WORLD · HEALTH CHECK '+new Date().toLocaleTimeString());
 }catch(e){
  setText('#statBot','Unavailable');setText('#botStatusText',e.message);
  setText('#statGuilds','—');setText('#statProfiles','—');
 }
}
async function loadOverview(){
 const result=await api('overview');
 setText('#hubStatusText',result.hub==='Configured'?'Endpoint saved · API not connected':'Integration not yet connected');
 $('#hubDot').className='status-dot'+(result.hub==='Configured'?' warn':'');
 await loadHealth();
}
async function refresh(){
 await Promise.all([loadSettings(),loadSecrets(),loadOverview()]);
}
$('#loginForm').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;toast('#loginNote','');
 try{
  await api('login','POST',Object.fromEntries(new FormData(event.target)));
  event.target.reset();showDashboard();go('overview');await refresh();
 }catch(e){toast('#loginNote',e.message,true);if(ready)showLogin()}
 finally{button.disabled=false}
});
for(const logoutButton of [$('#logout'),$('#logoutTop')])logoutButton.addEventListener('click',async()=>{
 try{await api('logout','POST')}finally{showLogin();$('#password').value='';go('overview')}
});
all('.nav button[data-tab]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.tab)));
$('#setupAction').addEventListener('click',()=>go('discord'));
$('#refreshHealth').addEventListener('click',loadHealth);
all('.save-settings').forEach(button=>button.addEventListener('click',async()=>{
 button.disabled=true;
 const panel=button.closest('.panel'),status=panel.querySelector('.notice');
 try{
  const settings={};
  all('[data-setting]').forEach(element=>{
   const value=element.type==='checkbox'?element.checked:element.type==='number'?Number(element.value):element.value.trim();
   settings[element.dataset.setting]=value;
  });
  const result=await api('settings','PUT',settings);
  toast(status,'Preferences saved locally. Runtime integration may require a restart.');await loadOverview();
 }catch(e){toast(status,e.message,true)}finally{button.disabled=false}
}));
$('#secretForm').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
 try{
  await api('secrets','PUT',{name:$('#secretName').value,value:$('#secretValue').value});
  $('#secretValue').value='';await loadSecrets();toast('#vaultNote','Encrypted and saved on the server.');
 }catch(e){toast('#vaultNote',e.message,true)}finally{button.disabled=false}
});
$('#testHub').addEventListener('click',async()=>{
 try{const result=await api('hub-check','POST');toast('#hubNote',result.message)}catch(e){toast('#hubNote',e.message,true)}
});
api('me').then(async result=>{if(result.authenticated){showDashboard();go('overview');try{await refresh()}catch(e){setText('#footerStatus','Unable to load dashboard settings: '+e.message)}}}).catch(()=>{});
