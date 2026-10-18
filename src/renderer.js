const $=id=>document.getElementById(id);let state;let busy=false;
async function call(promise){const result=await promise;if(!result.ok)throw new Error(result.error);return result.data;}
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
function scroll(){const area=$('chat-area');area.scrollTop=area.scrollHeight;}
function bubble(role,text){$('welcome').hidden=true;const el=document.createElement('article');el.className=`bubble ${role}`;const head=document.createElement('div');head.className='bubble-head';const label=document.createElement('span');label.textContent=role==='user'?'SIZ':'NurimAI';head.append(label);if(role!=='user'){const copy=document.createElement('button');copy.textContent='Nusxa';copy.onclick=async()=>{await call(window.nurim.copy(text));copy.textContent='Olindi ✓';};head.append(copy);}const p=document.createElement('p');p.textContent=text;el.append(head,p);$('messages').append(el);scroll();}
function setBusy(value){busy=value;$('waiting').hidden=!value;$('stop').hidden=!value;$('send').hidden=value;$('question').readOnly=value;for(const id of ['new','settings'])$(id).disabled=value;$('status').textContent=value?'Javob tayyorlanmoqda…':state?.settings.usePersonalKeys?'Shaxsiy AI · avtomatik':'Yoningizdagi yordamchi';scroll();}
function updateView(value){$('update-status').textContent=value.text;$('install-update').hidden=value.phase!=='ready';$('check-update').disabled=['checking','downloading','ready'].includes(value.phase);}
async function init(){state=await call(window.nurim.init());$('shortcut').textContent=state.platform==='darwin'?'⌘ + ⌥ + Space · tez ochish':'Ctrl + Alt + Space · tez ochish';for(const m of state.history)bubble(m.role,m.text);if(state.settings.warning)notice(state.settings.warning);setBusy(state.busy);}
$('composer').onsubmit=async event=>{event.preventDefault();const question=$('question').value.trim();if(!question||busy)return;notice('');bubble('user',question);$('question').value='';setBusy(true);try{const reply=await call(window.nurim.send(question));bubble('assistant',reply.text);if(reply.incomplete)notice('Javob uzunligi chegarasiga yetdi. Davomini so‘rashingiz mumkin.');}catch(error){notice(error.message);bubble('assistant','Javob olinmadi. Savolni qayta yuborishingiz mumkin.');$('question').value=question;}finally{setBusy(false);$('question').focus();}};
$('question').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('composer').requestSubmit();}};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('settings-dialog').open)window.nurim.hide();});
$('hide').onclick=()=>window.nurim.hide();$('stop').onclick=()=>window.nurim.stop();$('export').onclick=()=>call(window.nurim.exportChat()).catch(e=>notice(e.message));
$('new').onclick=async()=>{await call(window.nurim.reset());$('messages').replaceChildren();$('welcome').hidden=false;$('question').value='';notice('');$('question').focus();};
for(const button of document.querySelectorAll('[data-prompt]'))button.onclick=()=>{$('question').value=button.dataset.prompt;$('question').focus();};
$('settings').onclick=async()=>{
 state=await call(window.nurim.settings());const s=state.settings;$('version').textContent=`NurimAI ${state.version}`;$('server-status').textContent=state.gatewayConfigured?'Umumiy AI serveri sozlangan.':'Server manzili hali sozlanmagan.';
 $('topmost').checked=s.topmost;$('auto-update').checked=s.autoUpdate;$('personal').checked=s.usePersonalKeys;$('fallback').checked=s.autoFallback;$('remember').checked=s.remember;$('settings-error').textContent='';updateView(state.update);
 $('providers').replaceChildren();for(const provider of ['Gemini','Groq','OpenRouter']){
  const section=document.createElement('section');section.className='provider';const head=document.createElement('div');head.className='provider-head';const title=document.createElement('strong');title.textContent=provider;const link=document.createElement('button');link.type='button';link.textContent='Kalit olish ↗';link.onclick=()=>window.nurim.openLink(provider);head.append(title,link);
  const key=document.createElement('input');key.type='password';key.id=`key-${provider}`;key.maxLength=512;key.autocomplete='off';key.placeholder=s.configured[provider]?'Kalit saqlangan — almashtirish uchun kiriting':'API kaliti';key.setAttribute('aria-label',`${provider} API kaliti`);section.append(head,key);
  function check(id,text,checked){const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.id=id;input.checked=checked;label.append(input,document.createTextNode(text));section.append(label);}
  if(provider!=='OpenRouter')check(`free-${provider}`,'Hisobim Free tarifda',s.free[provider]);check(`clear-${provider}`,'Saqlangan kalitni o‘chirish',false);$('providers').append(section);
 }
 $('route-status').textContent=state.routes.map(r=>`${r.provider}: ${r.status}${r.retrySeconds?' · '+r.retrySeconds+' soniya':''}`).join('\n');$('settings-dialog').showModal();
};
$('close-settings').onclick=()=>$('settings-dialog').close();$('quit').onclick=()=>window.nurim.quit();
$('settings-form').onsubmit=async event=>{event.preventDefault();const keys={},clear={},free={};for(const p of ['Gemini','Groq','OpenRouter']){keys[p]=$(`key-${p}`).value;clear[p]=$(`clear-${p}`).checked;if(p!=='OpenRouter')free[p]=$(`free-${p}`).checked;}
 try{const saved=await call(window.nurim.saveSettings({keys,clear,free,topmost:$('topmost').checked,autoUpdate:$('auto-update').checked,usePersonalKeys:$('personal').checked,autoFallback:$('fallback').checked,remember:$('remember').checked}));state.settings=saved;for(const p of Object.keys(keys))$(`key-${p}`).value='';$('settings-dialog').close();setBusy(false);notice('Sozlamalar saqlandi.');}catch(error){$('settings-error').textContent=error.message;}
};
$('check-update').onclick=async()=>{try{updateView(await call(window.nurim.checkUpdate()));}catch(e){$('settings-error').textContent=e.message;}};
$('install-update').onclick=()=>call(window.nurim.installUpdate()).catch(e=>$('settings-error').textContent=e.message);$('release-page').onclick=()=>window.nurim.openLink('releases');window.nurim.onUpdate(updateView);
init().catch(e=>notice(e.message));
