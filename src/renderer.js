const $=id=>document.getElementById(id);let state;let busy=false;let files=[];const shown=new Set(); // attachments already displayed on a sent message
async function call(promise){const result=await promise;if(!result.ok)throw new Error(result.error);return result.data;}
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
function scroll(){const area=$('chat-area');area.scrollTop=$('welcome').hidden?area.scrollHeight:0;} // the welcome screen stays at its top

// Safe formatting for AI answers: builds DOM nodes (never HTML) for paragraphs, lists, **bold**, `code` and ``` blocks.
function inline(parent,text){let last=0;for(const m of text.matchAll(/\*\*([^*\n]+)\*\*|`([^`\n]+)`/g)){if(m.index>last)parent.append(text.slice(last,m.index));const el=document.createElement(m[1]!==undefined?'strong':'code');el.textContent=m[1]??m[2];parent.append(el);last=m.index+m[0].length;}if(last<text.length)parent.append(text.slice(last));}
function rich(container,text){
  let list=null,para=null,code=null;
  for(const line of text.split('\n')){
    if(code){if(/^\s*```/.test(line))code=null;else code.textContent+=(code.textContent?'\n':'')+line;continue;}
    if(/^\s*```/.test(line)){list=para=null;const pre=document.createElement('pre');code=document.createElement('code');pre.append(code);container.append(pre);continue;}
    if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){list=para=null;container.append(document.createElement('hr'));continue;} // --- is a full-width divider
    const bullet=/^\s*[-*•]\s+(.*)$/.exec(line),num=/^\s*(\d+)[.)]\s+(.*)$/.exec(line),head=/^\s*#{1,4}\s+(.*)$/.exec(line);
    if(bullet||num){const tag=bullet?'UL':'OL';if(!list||list.tagName!==tag){list=document.createElement(tag);if(num)list.start=Number(num[1]);container.append(list);para=null;}const li=document.createElement('li');inline(li,bullet?bullet[1]:num[2]);list.append(li);continue;}
    if(!line.trim()){list=para=null;continue;}
    if(head){list=para=null;const h=document.createElement('p');h.className='head';inline(h,head[1].replace(/\*\*/g,''));container.append(h);continue;}
    list=null;if(para)para.append(document.createElement('br'));else{para=document.createElement('p');container.append(para);}inline(para,line);
  }
}
function chip(file,removable){
  const el=document.createElement('span');el.className=`file-chip ${file.kind}`;el.title=file.note?`${file.name}\n${file.note}`:file.name;
  if(file.thumb){const img=document.createElement('img');img.src=file.thumb;img.alt='';el.append(img);}else{const badge=document.createElement('b');badge.textContent=(file.ext||file.kind).slice(0,4).toUpperCase();el.append(badge);}
  const name=document.createElement('span');name.textContent=file.name;el.append(name);
  if(removable){const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label',`${file.name} faylini olib tashlash`);x.onclick=async()=>{try{renderFiles(await call(window.nurim.attachRemove(file.id)));}catch(e){notice(e.message);}};el.append(x);}
  return el;
}
function renderFiles(list){files=list;$('attachments').replaceChildren(...files.map(f=>chip(f,true)));$('attachments').hidden=!files.length;$('file-actions').hidden=!files.length||busy;$('question').placeholder=files.length?'Fayl haqida savol yozing yoki tayyor tugmani bosing…':'Istalgan savolingizni yozing…';}
// A Word/PowerPoint file NurimAI made (saved in Documents\NurimAI): open it or show it in its folder.
function docCard(doc){
  const card=document.createElement('div');card.className=`doc-card ${doc.kind}`;const badge=document.createElement('b');badge.textContent=doc.kind==='pptx'?'PPTX':'DOCX';
  const name=document.createElement('span');name.textContent=doc.name;name.title=doc.path;
  const open=document.createElement('button');open.type='button';open.className='primary doc-open';open.textContent='Ochish';open.onclick=()=>call(window.nurim.docOpen(doc.path)).catch(e=>notice(e.message));
  const show=document.createElement('button');show.type='button';show.className='doc-show';show.textContent='Papkada ko‘rsatish';show.onclick=()=>call(window.nurim.docShow(doc.path)).catch(e=>notice(e.message));
  card.append(badge,name,open,show);return card;
}
// Settings: memory on/off and what is remembered (each fact can be forgotten).
function renderMemory(view){
  $('memory-on').checked=view.enabled;$('memory-empty').hidden=view.facts.length>0;$('memory-clear').hidden=!view.facts.length;
  $('memory-list').replaceChildren(...view.facts.map((text,i)=>{const li=document.createElement('li'),span=document.createElement('span'),x=document.createElement('button');span.textContent=text;x.type='button';x.textContent='×';x.setAttribute('aria-label',`«${text}» ni unutish`);x.onclick=async()=>{try{renderMemory(await call(window.nurim.memoryRemove(i)));}catch(e){notice(e.message);}};li.append(span,x);return li;}));
}
// Kompyuter fayllari: the folders the AI may work in (Settings), and the 📁 switch that lets the next questions use them.
let useFolders=false,folderList=[];
function renderFolders(list){
  folderList=list;$('folders-empty').hidden=list.length>0;
  $('folder-list').replaceChildren(...list.map((f,i)=>{const li=document.createElement('li'),span=document.createElement('span'),x=document.createElement('button');span.textContent=`${f.name} — ${f.path}`;span.title=f.path;x.type='button';x.textContent='×';x.setAttribute('aria-label',`${f.name} papkasini olib tashlash`);x.onclick=async()=>{try{renderFolders(await call(window.nurim.folderRemove(i)));if(!folderList.length)setFolders(false);}catch(e){notice(e.message);}};li.append(span,x);return li;}));
}
function setFolders(on){useFolders=on&&folderList.length>0;$('files').setAttribute('aria-pressed',String(useFolders));$('files').title=useFolders?`Kompyuter fayllari yoqilgan: ${folderList.map(f=>f.name).join(', ')}`:'Kompyuter fayllari: tanlagan papkalaringiz bilan ishlash';$('question').placeholder=useFolders?'Fayllar bilan nima qilay? Masalan: «Maktab papkasidagi fayllarni ko‘rib, ro‘yxatini yoz»':'Istalgan savolingizni yozing…';}
async function addFolder(){try{renderFolders(await call(window.nurim.folderAdd()));return folderList.length>0;}catch(e){notice(e.message);$('settings-error').textContent=e.message;return false;}}
$('files').onclick=async()=>{if(useFolders)return setFolders(false);if(!folderList.length)renderFolders(await call(window.nurim.folders()));if(!folderList.length&&!await addFolder())return;setFolders(true);notice(`📁 NurimAI endi ${folderList.map(f=>f.name).join(', ')} papkasi bilan ishlay oladi. O‘zgartirishdan oldin ruxsat so‘raydi.`);};
$('folder-add').onclick=addFolder;
window.nurim.onFilesStep(text=>{$('waiting-text').textContent=text;});
$('memory-on').onchange=async()=>{try{renderMemory(await call(window.nurim.memorySet($('memory-on').checked)));}catch(e){notice(e.message);}};
$('memory-clear').onclick=async()=>{try{renderMemory(await call(window.nurim.memoryClear()));}catch(e){notice(e.message);}};
function bubble(role,text,attached=[],doc=null,remembered=[]){
  if(role!=='user')text=NurimMath.plainMath(text); // LaTeX math ($\frac{1}{2}$ -> 1/2) is shown, copied and read aloud as plain text
  $('welcome').hidden=true;const el=document.createElement('article');el.className=`bubble ${role}`;const head=document.createElement('div');head.className='bubble-head';const label=document.createElement('span');label.textContent=role==='user'?'SIZ':'NurimAI';head.append(label);
  if(role!=='user'){const tools=document.createElement('span');tools.className='bubble-tools';const copy=document.createElement('button');copy.className='copy';copy.textContent='Nusxa';copy.onclick=async()=>{await call(window.nurim.copy(text));copy.textContent='Olindi ✓';};
    if(!text.startsWith('Javob olinmadi')){const listen=document.createElement('button');listen.className='speak';listen.textContent='🔊 Tinglash';listen.title='Javobni ovoz chiqarib o‘qish';listen.onclick=()=>speakBubble(el,text);tools.append(listen);}
    tools.append(copy);head.append(tools);}
  el.append(head);
  if(attached.length){const row=document.createElement('div');row.className='bubble-files';row.append(...attached.map(f=>chip(f,false)));el.append(row);}
  if(role==='user'){const p=document.createElement('p');p.textContent=text;el.append(p);}else{const body=document.createElement('div');body.className='rich';rich(body,text);el.append(body);}
  if(doc)el.append(docCard(doc));
  if(remembered?.length){const note=document.createElement('p');note.className='memory-note';note.textContent=`🧠 Eslab qoldim: ${remembered.join('; ')}`;el.append(note);}
  $('messages').append(el);scroll();return el;
}
function setBusy(value){busy=value;$('waiting').hidden=!value;$('waiting-text').textContent='O‘ylayapman';$('stop').hidden=!value;$('send').hidden=value;$('question').readOnly=value;for(const id of ['new','history','settings','attach','capture','mic','files','side-new'])$(id).disabled=value;for(const b of document.querySelectorAll('.side-open'))b.disabled=value;$('file-actions').hidden=!files.length||value;$('status').textContent=value?'Javob tayyorlanmoqda…':state?.settings.usePersonalKeys?'Shaxsiy AI · avtomatik':'Yoningizdagi yordamchi';scroll();}
function updateView(value){$('update-status').textContent=value.text;$('install-update').hidden=value.phase!=='ready';$('check-update').disabled=['checking','downloading','ready'].includes(value.phase);}
async function init(){
  state=await call(window.nurim.init());$('shortcut').textContent=(state.platform==='darwin'?'⌘ + ⌥ + Space · tez ochish':'Ctrl + Alt + Space · tez ochish')+(state.explainKey?`   ·   ${state.explainKey} · tushuntirish`:'');
  if(state.explainKey){$('explain-tip').textContent=`✨ Istalgan dasturda matnni belgilab ${state.explainKey} ni bosing — NurimAI uni oddiy tilda tushuntirib beradi.`;$('explain-tip').hidden=false;}
  for(const m of state.history)bubble(m.role,m.text,m.files||[],m.doc);renderFiles(state.files||[]);for(const id of state.sentIds||[])shown.add(id);
  if(state.whatsNew?.length){$('whats-new-title').textContent=`NurimAI ${state.version} versiyasiga yangilandi`;$('whats-new-list').replaceChildren(...state.whatsNew.map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));$('whats-new').hidden=false;}
  if(state.settings.warning)notice(state.settings.warning);setBusy(state.busy);greet();
}
// Welcome: greeting by time of day and the gold "Kunlik mashq" card (streak, cards waiting); the sidebar's Ustoz card says the same.
async function greet(){
  const h=new Date().getHours();$('greet').textContent=h>=5&&h<11?'Xayrli tong!':h<17?'Xayrli kun!':h<22?'Xayrli kech!':'Tun ham bo‘lsa, shu yerdaman.';
  try{const p=await call(window.nurim.practice());practiceCard($('streak-chip'),p);$('side-streak').textContent=p.streak?`${p.streak} kun ketma-ket`:'Ustoz rejimi';$('side-due').textContent=p.due?`Bugun ${p.due} ta kartochka takrorlash kerak`:'Test, kartochkalar va kunlik mashq';}catch{$('streak-chip').hidden=true;}
}
function useIcon(id){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href',`#${id}`);svg.setAttribute('aria-hidden','true');svg.append(use);return svg;}
function practiceCard(card,p){
  const span=(className,...kids)=>{const s=document.createElement('span');s.className=className;s.append(...kids);return s;};const title=document.createElement('strong');title.textContent='Kunlik mashq';
  card.replaceChildren(span('practice-meta',useIcon('i-streak'),p.streak?`${p.streak} kun ketma-ket`:'Bugun boshlaymiz'),title,span('practice-sub',p.due?`${p.due} ta kartochka takrorlashni kutyapti`:'Kichik test yoki kartochkalar bilan'),span('practice-go',useIcon('i-arrow')));
  card.hidden=false;
}
async function ask(question){
  if(!question||busy)return;notice('');const fresh=files.filter(f=>!shown.has(f.id));fresh.forEach(f=>shown.add(f.id));bubble('user',question,fresh.map(({name,ext,kind})=>({name,ext,kind})));$('question').value='';setBusy(true);
  try{const reply=await call(window.nurim.send(question,{folders:useFolders}));bubble('assistant',reply.text,[],reply.doc,reply.remembered);if(reply.incomplete)notice('Javob uzunligi chegarasiga yetdi. Davomini so‘rashingiz mumkin.');}
  catch(error){notice(error.message);bubble('assistant','Javob olinmadi. Savolni qayta yuborishingiz mumkin.');$('question').value=question;}
  finally{setBusy(false);$('question').focus();renderSide();}
}
$('composer').onsubmit=event=>{event.preventDefault();ask($('question').value.trim());};
$('question').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('composer').requestSubmit();}};
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(recorder){event.preventDefault();stopRecording(false);return;}if(!document.querySelector('dialog[open]'))window.nurim.hide();});
$('hide').onclick=()=>window.nurim.hide();$('stop').onclick=()=>window.nurim.stop();$('export').onclick=()=>call(window.nurim.exportChat()).catch(e=>notice(e.message));
function clearChat(){$('messages').replaceChildren();$('welcome').hidden=false;$('question').value='';shown.clear();renderFiles([]);notice('');}
$('new').onclick=async()=>{try{await call(window.nurim.reset());clearChat();$('question').focus();renderSide();}catch(e){notice(e.message);}};
$('side-new').onclick=()=>$('new').click();$('side-settings').onclick=()=>$('settings').click();$('side-ustoz').onclick=()=>openUstoz();
for(const button of document.querySelectorAll('[data-prompt]'))button.onclick=()=>{$('question').value=button.dataset.prompt;$('question').focus();};
for(const button of document.querySelectorAll('[data-file-prompt]'))button.onclick=()=>ask(button.dataset.filePrompt);
$('whats-new-close').onclick=()=>{$('whats-new').hidden=true;};

// Attachments: picker, screen capture, paste and drag-and-drop all end up in the main process.
function attached(result){const before=new Set(files.map(f=>f.id));renderFiles(result.files);notice([...result.errors,...result.files.filter(f=>!before.has(f.id)&&f.note).map(f=>`${f.name}: ${f.note}`)].join('\n'));if(result.files.length)$('question').focus();}
$('attach').onclick=async()=>{try{attached(await call(window.nurim.attachPick()));}catch(e){notice(e.message);}};
$('capture').onclick=async()=>{$('capture').disabled=true;notice('');try{attached(await call(window.nurim.attachScreen()));}catch(e){notice(e.message);}finally{$('capture').disabled=busy;}};
async function addFiles(list){
  for(const file of [...list].slice(0,5)){
    const name=file.name&&file.name!=='image.png'?file.name:`Rasm ${new Date().toTimeString().slice(0,5).replace(':','-')}.png`;
    try{attached(await call(window.nurim.attachData(name,await file.arrayBuffer())));}catch(e){notice(e.message);}
  }
}
document.addEventListener('paste',event=>{const list=event.clipboardData?.files;if(list?.length&&!busy){event.preventDefault();addFiles(list);}});
let dragDepth=0;const hasFiles=event=>[...(event.dataTransfer?.types||[])].includes('Files');
document.addEventListener('dragenter',event=>{if(!hasFiles(event))return;event.preventDefault();dragDepth++;$('drop').hidden=busy;});
document.addEventListener('dragover',event=>{if(hasFiles(event))event.preventDefault();});
document.addEventListener('dragleave',event=>{if(hasFiles(event)&&--dragDepth<=0){dragDepth=0;$('drop').hidden=true;}});
document.addEventListener('drop',event=>{event.preventDefault();dragDepth=0;$('drop').hidden=true;if(!busy&&event.dataTransfer?.files?.length)addFiles(event.dataTransfer.files);});

// Selected-text shortcut: main copies the selection and hands it over as a "Belgilangan matn" chip, usually with a question to send.
window.nurim.onExplain(data=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();attached(data);if(data.question&&!busy)ask(data.question);});

// Chat history: search, reopen and delete conversations saved on this computer.
const MONTHS=['yan','fev','mar','apr','may','iyn','iyl','avg','sen','okt','noy','dek'];let historyTimer=null; // Chromium has no short Uzbek month names
function when(time){const d=new Date(time),now=new Date(),hm=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');const days=Math.round((new Date(now.toDateString())-new Date(d.toDateString()))/864e5);return days===0?'Bugun '+hm:days===1?'Kecha '+hm:d.getDate()+'-'+MONTHS[d.getMonth()]+(d.getFullYear()===now.getFullYear()?'':' '+d.getFullYear())+', '+hm;}
function historyItem(item,current){
  const li=document.createElement('li');if(item.id===current)li.className='current';
  const open=document.createElement('button');open.type='button';open.className='history-open';
  const title=document.createElement('strong');title.textContent=item.title;const meta=document.createElement('small');meta.textContent=`${when(item.updated)} · ${item.count} ta xabar${item.id===current?' · hozirgi':''}`;
  const preview=document.createElement('span');preview.textContent=item.preview;open.append(title,meta,preview);
  open.onclick=async()=>{try{await openChat(item.id);$('history-dialog').close();}catch(e){$('history-note').textContent=e.message;}};
  const del=document.createElement('button');del.type='button';del.className='history-delete';del.textContent='×';del.title='O‘chirish';del.setAttribute('aria-label',`“${item.title}” suhbatini o‘chirish`);
  del.onclick=async()=>{try{await call(window.nurim.historyDelete(item.id));await showHistory();renderSide();}catch(e){$('history-note').textContent=e.message;}};
  li.append(open,del);return li;
}
async function openChat(id){const data=await call(window.nurim.historyOpen(id));clearChat();for(const m of data.history)bubble(m.role,m.text,m.files||[],m.doc);$('question').focus();renderSide();}
// Sidebar (wide window): the same saved chats, newest first, with search; the narrow window keeps the Tarix dialog.
let sideTimer=null;
async function renderSide(){
  try{
    const query=$('side-search').value.trim();const data=await call(window.nurim.historyList(query));
    $('side-history').replaceChildren(...data.items.map(item=>{const li=document.createElement('li');if(item.id===data.current)li.className='current';
      const open=document.createElement('button');open.type='button';open.className='side-open';open.disabled=busy;const title=document.createElement('span');title.textContent=item.title;const meta=document.createElement('small');meta.textContent=when(item.updated);open.append(title,meta);
      open.onclick=()=>openChat(item.id).catch(e=>notice(e.message));li.append(open);return li;}));
    $('side-empty').textContent=!data.available?'Bu kompyuterda tarix saqlanmaydi.':query?'Hech narsa topilmadi.':data.enabled?'Savol bersangiz, suhbat shu yerda paydo bo‘ladi.':'Tarix saqlash Sozlamalarda o‘chirilgan.';$('side-empty').hidden=data.items.length>0;
  }catch{}
}
$('side-search').oninput=()=>{clearTimeout(sideTimer);sideTimer=setTimeout(renderSide,150);};
async function showHistory(){
  const query=$('history-search').value.trim();const data=await call(window.nurim.historyList(query));
  $('history-list').replaceChildren(...data.items.map(item=>historyItem(item,data.current)));
  $('history-count').textContent=query?`Topildi: ${data.items.length}`:data.items.length?`${data.items.length} ta suhbat`:'';
  $('history-empty').textContent=!data.available?'Bu kompyuterda tizim shifrlashi mavjud emas, shuning uchun tarix saqlanmaydi.':query?'Hech narsa topilmadi.':data.enabled?'Hali saqlangan suhbat yo‘q. Savol bersangiz, suhbat shu yerda paydo bo‘ladi.':'Tarix saqlash o‘chirilgan. Uni Sozlamalarda yoqishingiz mumkin.';
  $('history-empty').hidden=data.items.length>0;$('history-clear').hidden=!data.items.length||Boolean(query);$('history-note').textContent=data.warning||'';
}
$('live').onclick=()=>call(window.nurim.openLive()).catch(e=>notice(e.message));
$('history').onclick=async()=>{$('history-search').value='';try{await showHistory();$('history-dialog').showModal();$('history-search').focus();}catch(e){notice(e.message);}};
$('history-search').oninput=()=>{clearTimeout(historyTimer);historyTimer=setTimeout(()=>showHistory().catch(e=>$('history-note').textContent=e.message),150);};
$('close-history').onclick=()=>$('history-dialog').close();
$('history-clear').onclick=async()=>{if(!confirm('Barcha saqlangan suhbatlar o‘chirilsinmi? Buni qaytarib bo‘lmaydi.'))return;try{await call(window.nurim.historyClear());await showHistory();renderSide();}catch(e){$('history-note').textContent=e.message;}};

// Keys the settings take: the user's own paid Claude/ChatGPT first (with the model they run), then the free ones.
const PAID={Claude:'Claude Opus 5.5',ChatGPT:'GPT-6.1 Sol'},KEYED=[...Object.keys(PAID),'Gemini','Groq','OpenRouter'],FREE_TIER=['Gemini','Groq'];
$('settings').onclick=async()=>{
 state=await call(window.nurim.settings());const s=state.settings;$('version').textContent=`NurimAI ${state.version}`;$('server-status').textContent=state.gatewayConfigured?'Umumiy AI serveri sozlangan.':'Server manzili hali sozlanmagan.';
 $('topmost').checked=s.topmost;$('save-history').checked=s.saveHistory;$('auto-speak').checked=s.autoSpeak!==false;$('auto-update').checked=s.autoUpdate;$('personal').checked=s.usePersonalKeys;$('fallback').checked=s.autoFallback;$('remember').checked=s.remember;$('settings-error').textContent='';updateView(state.update);NurimTheme.bind($('theme-choice'));renderMemory(await call(window.nurim.memory()));renderFolders(await call(window.nurim.folders()));
 $('providers').replaceChildren();for(const provider of KEYED){
  const section=document.createElement('section');section.className='provider';const head=document.createElement('div');head.className='provider-head';const title=document.createElement('strong');title.textContent=provider;const link=document.createElement('button');link.type='button';link.textContent='Kalit olish ↗';link.onclick=()=>window.nurim.openLink(provider);head.append(title,link);
  const key=document.createElement('input');key.type='password';key.id=`key-${provider}`;key.maxLength=512;key.autocomplete='off';key.placeholder=s.configured[provider]?'Kalit saqlangan — almashtirish uchun kiriting':'API kaliti';key.setAttribute('aria-label',`${provider} API kaliti`);section.append(head);
  if(PAID[provider]){section.classList.add('paid');const note=document.createElement('small');note.textContent=`Pullik · ${PAID[provider]}. Kalit kiritilsa, savollarga avval shu AI javob beradi; to‘lov sizning hisobingizdan. Ishlamasa, bepul AI javob beradi.`;section.append(note);}
  section.append(key);
  function check(id,text,checked){const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.id=id;input.checked=checked;label.append(input,document.createTextNode(text));section.append(label);}
  if(FREE_TIER.includes(provider))check(`free-${provider}`,'Hisobim Free tarifda',s.free[provider]);check(`clear-${provider}`,'Saqlangan kalitni o‘chirish',false);$('providers').append(section);
 }
 $('route-status').textContent=state.routes.map(r=>`${r.provider}: ${r.status}${r.retrySeconds?' · '+r.retrySeconds+' soniya':''}`).join('\n');$('settings-dialog').showModal();
};
$('close-settings').onclick=()=>$('settings-dialog').close();$('quit').onclick=()=>window.nurim.quit();
$('settings-form').onsubmit=async event=>{event.preventDefault();const keys={},clear={},free={};for(const p of KEYED){keys[p]=$(`key-${p}`).value;clear[p]=$(`clear-${p}`).checked;if(FREE_TIER.includes(p))free[p]=$(`free-${p}`).checked;}
 try{const saved=await call(window.nurim.saveSettings({keys,clear,free,topmost:$('topmost').checked,saveHistory:$('save-history').checked,autoSpeak:$('auto-speak').checked,autoUpdate:$('auto-update').checked,usePersonalKeys:$('personal').checked,autoFallback:$('fallback').checked,remember:$('remember').checked}));state.settings=saved;for(const p of Object.keys(keys))$(`key-${p}`).value='';$('settings-dialog').close();setBusy(false);notice('Sozlamalar saqlandi.');renderSide();}catch(error){$('settings-error').textContent=error.message;}
};
$('check-update').onclick=async()=>{try{updateView(await call(window.nurim.checkUpdate()));}catch(e){$('settings-error').textContent=e.message;}};
$('install-update').onclick=()=>call(window.nurim.installUpdate()).catch(e=>$('settings-error').textContent=e.message);$('release-page').onclick=()=>window.nurim.openLink('releases');window.nurim.onUpdate(updateView);
init().then(renderSide).catch(e=>notice(e.message));
