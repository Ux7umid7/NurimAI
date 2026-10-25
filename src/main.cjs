const {app,BrowserWindow,ipcMain,screen,Menu,Tray,nativeImage,globalShortcut,safeStorage,dialog,clipboard,ClipboardItem,shell,desktopCapturer,systemPreferences,Notification} = require('electron');
const fs = require('node:fs');const path = require('node:path');const {pathToFileURL} = require('node:url');
const {Router,UserError,ORDER,speak,withSources} = require('./router.cjs');const {Store} = require('./store.cjs');const {askGateway,speakGateway} = require('./gateway.cjs');
const {UpdateController} = require('./updater.cjs');const release = require('./release-config.json');
const {prepare,checkFits,forRequest,forView,LIMITS,PICKER_EXTENSIONS} = require('./attachments.cjs');const whatsNew = require('./whats-new.json');
const {Chats} = require('./chats.cjs');const {grabSelection} = require('./selection.cjs');const practiceModule = require('./practice.cjs');const {Practice} = practiceModule;
const qa = process.argv.includes('--qa');const root = path.join(__dirname,'..');
app.setName('NurimAI');app.setAppUserModelId('com.nurimai.desktop');
if(qa) {const profile = process.env.NURIMAI_QA_PROFILE;if(!profile || !path.isAbsolute(profile)) throw new Error('An isolated QA profile is required');app.setPath('userData',profile);}
let chat,pet,tray,store,updates,controller;let history=[],visible=[],exiting=false;let interval,startTimer;
let files=[],fileSeq=0,previousVersion='';const sentIds=new Set(); // attachments already shown on a sent message
let chats,chatId=Chats.newId(),explainKey=false,explaining=false; // chatId: the conversation on screen, as saved in history
let practice,generating=null,remindTimer; // Ustoz rejimi: testlar, kartochkalar, eslatmalar
const router = new Router();
const asset = name=>path.join(root,'assets',name);
const PET={width:144,height:180};
// The 3D mascot loops idle / think / sleep and plays happy / wave / sad / catch once; the pet window only reacts to these moods.
function mood(state){if(pet&&!pet.isDestroyed())pet.webContents.send('mood',state);}
// After a few quiet minutes Nur falls asleep; any use of NurimAI (or hovering over Nur) wakes it with a wave.
const SLEEP_AFTER=3*60*1000;let lastActive=Date.now(),sleeping=false,sleepTimer;
function activity(){lastActive=Date.now();if(sleeping){sleeping=false;mood('wave');}}
function drowse(){if(!sleeping&&!controller&&!chat?.isFocused()&&Date.now()-lastActive>SLEEP_AFTER){sleeping=true;mood('sleep');}}
const explainLabel=()=>process.platform==='darwin'?'⌘ + ⌥ + E':'Ctrl + Alt + E';
function summary(){return {version:app.getVersion(),platform:process.platform,settings:store.public(),routes:router.diagnostics(store.value),last:router.last,update:updates.state,gatewayConfigured:Boolean(release.gateway),history:visible,busy:Boolean(controller),files:forView(files),sentIds:[...sentIds],whatsNew:previousVersion&&previousVersion!==app.getVersion()?whatsNew[app.getVersion()]||[]:[],explainKey:explainKey?explainLabel():'',historyAvailable:chats.available,historyWarning:chats.warning};}
function clamp(point,width,height){const area=screen.getDisplayNearestPoint(point).workArea;return {x:Math.max(area.x,Math.min(Math.round(point.x),area.x+area.width-width)),y:Math.max(area.y,Math.min(Math.round(point.y),area.y+area.height-height))};}
function showChat(){if(!chat || chat.isDestroyed())return;activity();if(!chat.isVisible()){const p=pet.getBounds(),[w,h]=chat.getSize();const next=clamp({x:p.x-w-10,y:p.y+p.height-h},w,h);chat.setPosition(next.x,next.y);}chat.show();chat.focus();} // opens beside Nur, whatever size the window has
function toggle(){activity();if(chat.isVisible())chat.hide();else showChat();}
// Attachments: only files the user hands over (picker, drop, paste, screen capture) are read.
async function imageTool(bytes,mime){
  const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())return {mime,data:bytes}; // WebP/HEIC go to Gemini as they are
  const {width,height}=image.getSize();const fit=size=>width>=height?{width:Math.min(width,size),quality:'best'}:{height:Math.min(height,size),quality:'best'};
  const scaled=Math.max(width,height)>2000?image.resize(fit(2000)):image;const keepPng=mime==='image/png'&&scaled===image&&bytes.length<=1.5*1024*1024;
  return {mime:keepPng?'image/png':'image/jpeg',data:keepPng?bytes:scaled.toJPEG(90),thumb:image.resize(fit(96)).toDataURL()};
}
async function attach(items){
  const errors=[];
  let added=0;activity();
  for(const item of items){try{const file=await prepare({name:item.name,bytes:await item.read(),imageTool});checkFits(files,file);file.id=String(++fileSeq);files.push(file);added++;}catch(e){errors.push(e instanceof UserError?e.message:`${item.name}: faylni qo‘shib bo‘lmadi.`);}}
  if(added)mood('catch');else if(errors.length)mood('sad'); // Nur catches what it is given
  return {files:forView(files),errors};
}
async function captureScreen(){
  const denied='Ekranni suratga olishga ruxsat yo‘q. System Settings → Privacy & Security → Screen Recording’da NurimAI’ni yoqing va dasturni qayta oching.';
  if(process.platform==='darwin'&&systemPreferences.getMediaAccessStatus('screen')==='denied')throw new UserError(denied);
  const display=screen.getDisplayMatching(chat.getBounds());const bounds=chat.getBounds();const petShown=pet.isVisible();
  chat.hide();if(petShown)pet.hide();await new Promise(resolve=>setTimeout(resolve,350)); // keep NurimAI itself out of the picture
  try{
    const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(display.size.width*display.scaleFactor),height:Math.round(display.size.height*display.scaleFactor)}});
    if(process.platform==='darwin'&&systemPreferences.getMediaAccessStatus('screen')!=='granted')throw new UserError(denied);
    // display_id can be empty on Windows; sources then follow the order of screen.getAllDisplays().
    const source=sources.find(item=>item.display_id===String(display.id))||sources[screen.getAllDisplays().findIndex(item=>item.id===display.id)]||sources[0];
    if(!source||source.thumbnail.isEmpty())throw new UserError('Ekranni suratga olib bo‘lmadi.');
    return source.thumbnail.toPNG();
  }finally{if(petShown)pet.showInactive();chat.setBounds(bounds);chat.show();chat.focus();}
}
const micAllowed=(contents,permission,types)=>permission==='media'&&contents===chat?.webContents&&types.length>0&&types.every(t=>t==='audio'); // voice questions only
function lockWindow(window,file){
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(micAllowed(contents,permission,details?.mediaTypes||[])));
  window.webContents.session.setPermissionCheckHandler((contents,permission,_origin,details)=>micAllowed(contents,permission,details?.mediaType?[details.mediaType]:[]));window.loadFile(path.join(__dirname,file));
}
function createWindows(){
  const webPreferences={preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true};
  chat=new BrowserWindow({title:'NurimAI',width:1000,height:700,minWidth:380,minHeight:520,show:false,frame:false,transparent:true,hasShadow:true,alwaysOnTop:store.value.topmost,icon:asset('Nuri.ico'),webPreferences});
  pet=new BrowserWindow({title:'NurimAI — kichik yordamchi',width:PET.width,height:PET.height,show:false,frame:false,transparent:true,resizable:false,skipTaskbar:true,alwaysOnTop:store.value.topmost,webPreferences});
  lockWindow(chat,'index.html');lockWindow(pet,'pet.html');
  const area=screen.getPrimaryDisplay().workArea;const position=clamp(store.value.petPosition||{x:area.x+area.width-PET.width-20,y:area.y+area.height-PET.height-20},PET.width,PET.height);pet.setPosition(position.x,position.y);
  pet.once('ready-to-show',()=>{pet.show();setTimeout(()=>mood('wave'),1200);}); // Nur waves hello
  chat.once('ready-to-show',()=>{if(!process.argv.includes('--compact'))showChat();});chat.on('focus',activity);
  chat.on('close',e=>{if(!exiting){e.preventDefault();chat.hide();}});
  pet.on('close',e=>{if(!exiting)e.preventDefault();});
  pet.on('moved',()=>{const [x,y]=pet.getPosition();store.value.petPosition={x,y};});
  pet.webContents.on('context-menu',()=>Menu.buildFromTemplate([{label:'Suhbatni ochish',click:showChat},{label:'Chiqish',click:()=>app.quit()}]).popup({window:pet}));
  // macOS cannot read .ico; the menu bar uses a monochrome template image (with its @2x sibling).
  tray=new Tray(process.platform==='darwin'?nativeImage.createFromPath(asset('trayTemplate.png')):nativeImage.createFromPath(asset('Nuri.ico')).resize({width:20,height:20}));tray.setToolTip('NurimAI');
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Suhbatni ochish',click:showChat},{label:'Yangilanishni tekshirish',click:()=>{showChat();updates.check(true);}},{label:'Chiqish',click:()=>app.quit()}]));tray.on('click',toggle);
  globalShortcut.register('CommandOrControl+Alt+Space',toggle);
  explainKey=globalShortcut.register('CommandOrControl+Alt+E',()=>{explainSelection().catch(()=>{});});
}
// Select text in any app and press the shortcut: NurimAI copies the selection, restores the clipboard and asks Nur to explain it.
const EXPLAIN='Belgilangan matnni oddiy tilda tushuntirib ber.';
async function explainSelection(qaText){
  if(explaining)return;explaining=true;activity();
  try{
    const mac=process.platform==='darwin';const trusted=qa||!mac||systemPreferences.isTrustedAccessibilityClient(false);
    let text=qa?String(qaText||'').trim():trusted?await grabSelection({clipboard,ClipboardItem,platform:process.platform}):'';let question=EXPLAIN;const notes=[];
    if(!text&&!trusted){systemPreferences.isTrustedAccessibilityClient(true); // macOS asks the user once
      text=(await clipboard.readText()).trim();question='';notes.push(`Belgilangan matnni avtomatik olish uchun System Settings → Privacy & Security → Accessibility’da NurimAI’ni yoqing.${text?' Hozircha nusxa olingan matn qo‘shildi — savolni o‘zingiz yuboring.':''}`);}
    showChat();
    if(!text){mood('sad');chat.webContents.send('explain',{files:forView(files),errors:notes.length?notes:[`Belgilangan matn topilmadi. Istalgan dasturda matnni belgilang va ${explainLabel()} ni bosing.`]});return;}
    if(controller){question='';notes.push('Avvalgi javob tugagach, savolni yuboring.');}
    const result=await attach([{name:'Belgilangan matn.txt',read:async()=>Buffer.from(text,'utf8')}]);
    chat.webContents.send('explain',{...result,errors:[...result.errors,...notes],question:result.errors.length?'':question});
  }finally{explaining=false;}
}
const VOICE_QUESTION='Bu ovozli xabar. Uni diqqat bilan tingla. Birinchi qatorda eshitganingni so‘zma-so‘z «Savolingiz: …» deb yoz, keyingi qatordan javob ber. Ovoz eshitilmasa yoki tushunarsiz bo‘lsa, shuni ayt.';
const HEARD=/^\s*\**\s*Savolingiz\s*:?\s*\**\s*[«"]?(.+?)[»"]?\s*\**\s*$/i;
async function ask(question,extraFiles=[],signal,voice=false){
  const sent=[...forRequest(files),...extraFiles];
  if(qa){if(question.endsWith('/qa-xato'))throw new UserError('Sinov xatosi.');return {text:`${voice?'Savolingiz: Kasr nima?\n':''}Bu avtomatik UI sinovi uchun tayyor javob. Jonli AI emas.${sent.length-extraFiles.length?` Biriktirilgan fayllar: ${sent.length-extraFiles.length}.`:''}`,incomplete:false};}
  return store.value.usePersonalKeys?router.ask(store.value,history,question,signal,sent).then(r=>({...r,text:withSources(r)})):askGateway({url:release.gateway,deviceId:store.value.deviceId,history,question,files:sent,signal,voice});
}
// display: what the chat shows; voice: the reply's first line is the transcript; teacher style adds a hidden instruction for the AI only.
async function converse(question,{display=question,voice=false,extra=[]}){
  if(controller||generating)throw new UserError('Avvalgi javobni kuting.');
  activity();controller=new AbortController();const fresh=files.filter(f=>!sentIds.has(f.id));fresh.forEach(f=>sentIds.add(f.id));
  const asked={role:'user',text:display,files:fresh.map(({name,ext,kind})=>({name,ext,kind}))};visible.push(asked);
  mood('think');
  try{
    const reply=await ask(practice.state.teacher?`${question}\n\n(${practiceModule.TEACHER})`:question,extra,controller.signal,voice);
    let text=reply.text,transcript='';
    if(voice){const lines=text.split('\n');const heard=HEARD.exec(lines[0]||'');if(heard){transcript=heard[1].trim().slice(0,600);text=lines.slice(1).join('\n').trim()||text;asked.text=`🎤 ${transcript}`;}}
    history.push({role:'user',text:transcript||display},{role:'assistant',text});history=history.slice(-24);visible.push({role:'assistant',text});mood('happy');remember();
    return {...reply,text,transcript};
  }catch(e){visible.push({role:'assistant',text:'Javob olinmadi. Savolni qayta yuborishingiz mumkin.',error:true});mood(e?.name==='AbortError'?'idle':'sad');remember();throw e;}finally{controller=null;lastActive=Date.now();}
}
// Tests and flashcards are made by the same AI as the chat; the result is checked before it is used.
async function generate(options){
  if(controller||generating)throw new UserError('Avvalgi javobni kuting.');
  const kind=options?.kind==='cards'?'cards':'quiz';const fromChat=options?.fromChat===true;
  const topic=typeof options?.topic==='string'?options.topic.trim().slice(0,300):'';
  if(!fromChat&&!topic)throw new UserError('Mavzuni yozing.');
  if(fromChat&&!history.length&&!files.length)throw new UserError('Suhbat hali bo‘sh: avval savol bering yoki fayl biriktiring, yoki mavzuni yozing.');
  const count=kind==='quiz'?[5,10,15].includes(options?.count)?options.count:5:[10,15,20].includes(options?.count)?options.count:10;
  const prompt=kind==='quiz'?practiceModule.quizPrompt({topic,count,level:options?.level,fromChat}):practiceModule.cardsPrompt({topic,count,fromChat});
  activity();generating=new AbortController();mood('think');
  try{
    const sent=fromChat?forRequest(files):[];const signal=generating.signal;
    const reply=qa?{text:practiceModule.sample(kind,kind==='quiz'?Math.min(count,3):3)}:store.value.usePersonalKeys?await router.ask(store.value,fromChat?history:[],prompt,signal,sent,{search:false}):await askGateway({url:release.gateway,deviceId:store.value.deviceId,history:fromChat?history:[],question:prompt,files:sent,signal});
    if(kind==='quiz'){const quiz=practiceModule.parseQuiz(reply.text);mood('catch');return {quiz:{...quiz,topic:topic||quiz.title}};}
    const cards=practiceModule.parseCards(reply.text);const deck=practice.addDeck(cards.title,cards.cards);mood('catch');return {deck:deck.id,view:practice.view()};
  }catch(e){mood(e?.name==='AbortError'?'idle':'sad');throw e;}finally{generating=null;lastActive=Date.now();}
}
// 0.3 s tone for QA mode (no live speech service in tests).
function qaTone(){const rate=16000,n=rate*0.3,b=Buffer.alloc(44+n*2);b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*440)*3000),44+i*2);return b;}
// Reminders fire while NurimAI runs (it lives in the tray); clicking one opens the Ustoz panel.
function remind(){
  for(const r of practice.dueReminders()){
    mood('wave');
    if(!qa&&Notification.isSupported()){const n=new Notification({title:r.kind==='practice'?'NurimAI · Kunlik mashq':'NurimAI · Eslatma',body:r.text});n.on('click',()=>{showChat();chat.webContents.send('open-panel','ustoz');});n.show();}
    if(chat&&!chat.isDestroyed())chat.webContents.send('reminder',r);
  }
}
function remember(){if(!store.value.saveHistory||!chats.available||!visible.length)return;try{chats.upsert(chatId,visible);}catch{}} // history is a convenience: never block a reply on it
function pairs(messages){const out=[];for(let i=0;i+1<messages.length;i++){const [a,b]=[messages[i],messages[i+1]];if(a.role==='user'&&b.role==='assistant'&&!b.error){out.push({role:'user',text:a.text},{role:'assistant',text:b.text});i++;}}return out.slice(-24);}
function register(channel,handler,petAllowed=false){ipcMain.handle(channel,async(event,...args)=>{
  const allowed=[chat,...(petAllowed?[pet]:[])].filter(Boolean);
  if(!allowed.some(w=>event.sender===w.webContents) || event.senderFrame !== event.sender.mainFrame) return {ok:false,error:'Ruxsat yo‘q.'};
  const file=event.sender===pet?.webContents?'pet.html':'index.html';
  if(event.senderFrame.url!==pathToFileURL(path.join(__dirname,file)).href) return {ok:false,error:'Ruxsat yo‘q.'};
  try{return {ok:true,data:await handler(...args)};}catch(e){return {ok:false,error:e instanceof UserError?e.message:e?.name==='AbortError'?'Javob to‘xtatildi.':'Amal bajarilmadi. Qayta urinib ko‘ring.'};}
});}
function registerIPC(){
  register('init',summary);register('settings',summary);
  register('send',question=>{
    if(typeof question!=='string'||!question.trim()||question.length>6000)throw new UserError('Savol 1–6000 belgi bo‘lsin.');
    return converse(question.trim(),{});
  });
  // Voice question: a WAV recording goes to Gemini once (it is not kept as a chat attachment); the answer starts with what was heard.
  register('send-voice',(data,seconds)=>{
    if(!(data instanceof ArrayBuffer||ArrayBuffer.isView(data)))throw new UserError('Ovoz yozilmadi.');
    const bytes=Buffer.from(data instanceof ArrayBuffer?data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
    if(bytes.length<1000||bytes.length>4*1024*1024||bytes.toString('latin1',0,4)!=='RIFF'||bytes.toString('latin1',8,12)!=='WAVE')throw new UserError('Ovoz yozuvi noto‘g‘ri yoki juda uzun (1 daqiqagacha).');
    const secs=Math.max(1,Math.min(60,Math.round(Number(seconds)||1)));
    return converse(VOICE_QUESTION,{display:`🎤 Ovozli savol (${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')})`,voice:true,extra:[{kind:'audio',name:'Ovozli savol.wav',mime:'audio/wav',data:bytes.toString('base64')}]});
  });
  register('speak',async text=>{
    if(typeof text!=='string'||!text.trim()||text.length>1200)throw new UserError('Ovoz uchun matn noto‘g‘ri.');activity();
    if(qa)return {mime:'audio/wav',audio:qaTone().toString('base64')};
    const signal=AbortSignal.timeout(70000);
    if(store.value.usePersonalKeys&&store.value.keys.Gemini){const a=await speak({key:store.value.keys.Gemini,text,signal});return {mime:a.mime,audio:a.data};}
    return speakGateway({url:release.gateway,deviceId:store.value.deviceId,text,signal});
  });
  register('pet-mood',state=>{if(['talk','listen','idle'].includes(state))mood(state);});
  register('mic-access',async()=>process.platform==='darwin'&&!qa?systemPreferences.askForMediaAccess('microphone'):true);
  // Ustoz rejimi.
  register('practice',()=>practice.view());
  register('practice-generate',options=>generate(options));
  register('practice-due',deckId=>practice.due(new Date(),typeof deckId==='string'?deckId:''));
  register('practice-review',(deckId,cardId,grade)=>{practice.review(deckId,cardId,grade);return practice.view();});
  register('practice-quiz-done',result=>{practice.finishQuiz(result||{});mood(result?.score>=Math.ceil((result?.total||1)*0.7)?'happy':'wave');return practice.view();});
  register('practice-deck-delete',id=>{practice.removeDeck(id);return practice.view();});
  register('practice-options',value=>{practice.setOptions(value||{});return practice.view();});
  register('reminder-add',value=>{practice.addReminder(value||{});return practice.view();});
  register('reminder-delete',id=>{practice.removeReminder(id);return practice.view();});
  register('practice-mood',state=>{if(['happy','sad'].includes(state))mood(state);});
  register('stop',()=>{controller?.abort();generating?.abort();});register('reset',()=>{if(controller)throw new UserError('Avval javobni to‘xtating.');history=[];visible=[];files=[];sentIds.clear();chatId=Chats.newId();mood('wave');});
  // Saved conversations: list/search, reopen (AI context is rebuilt from complete question-answer pairs), delete.
  register('history-list',query=>({items:chats.search(query),current:chatId,enabled:store.value.saveHistory,available:chats.available,warning:chats.warning}));
  register('history-open',id=>{if(controller)throw new UserError('Avval javob tugashini kuting.');const saved=chats.get(id);if(!saved)throw new UserError('Suhbat topilmadi.');activity();chatId=saved.id;visible=saved.messages.map(m=>({...m}));history=pairs(saved.messages);files=[];sentIds.clear();return {history:visible,files:[]};});
  register('history-delete',id=>{chats.remove(id);return chats.search();});register('history-clear',()=>{chats.clear();return [];});
  register('save-settings',value=>{if(controller)throw new UserError('Javob tugashini kuting.');const old=store.value.keys;const result=store.update(value);for(const p of ORDER)if(old[p]!==store.value.keys[p])router.reset(p);chat.setAlwaysOnTop(store.value.topmost);pet.setAlwaysOnTop(store.value.topmost);updates.setEnabled(store.value.autoUpdate);return result;});
  register('hide',()=>chat.hide());register('toggle',toggle,true);register('quit',()=>app.quit(),true);
  register('copy',text=>{if(typeof text==='string'&&text.length<=100000)clipboard.writeText(text);});
  register('export',async()=>{if(!visible.length)return;const result=await dialog.showSaveDialog(chat,{defaultPath:`NurimAI-suhbat-${new Date().toISOString().slice(0,10)}.txt`,filters:[{name:'Matn',extensions:['txt']}]});if(!result.canceled)await fs.promises.writeFile(result.filePath,'NurimAI\n\n'+visible.map(m=>`${m.role==='user'?'SIZ':'NurimAI'}:\n${m.files?.length?`[Fayllar: ${m.files.map(x=>x.name).join(', ')}]\n`:''}${m.text}`).join('\n\n'),'utf8');});
  register('check-update',()=>updates.check(true));register('install-update',()=>{if(controller)throw new UserError('Avval javob tugashini kuting.');exiting=true;const result=updates.install();if(!result)exiting=false;return result;});
  register('open-link',name=>{const urls={Gemini:'https://aistudio.google.com/apikey',Groq:'https://console.groq.com/keys',OpenRouter:'https://openrouter.ai/keys',releases:`https://github.com/${release.owner}/${release.repo}/releases/latest`};if(!qa&&Object.hasOwn(urls,name))return shell.openExternal(urls[name]);});
  register('attach-pick',async()=>{
    const result=await dialog.showOpenDialog(chat,{title:'Fayl biriktirish',properties:['openFile','multiSelections'],filters:[{name:'Rasm, PDF, Word, Excel, PowerPoint, matn',extensions:PICKER_EXTENSIONS},{name:'Barcha fayllar',extensions:['*']}]});
    if(result.canceled)return {files:forView(files),errors:[]};
    return attach(result.filePaths.slice(0,LIMITS.files).map(file=>({name:path.basename(file),read:async()=>{if((await fs.promises.stat(file)).size>LIMITS.inputBytes)throw new UserError(`${path.basename(file)}: fayl juda katta (15 MB gacha).`);return fs.promises.readFile(file);}})));
  });
  register('attach-data',(name,data)=>{if(typeof name!=='string'||!(data instanceof ArrayBuffer||ArrayBuffer.isView(data)))throw new UserError('Fayl o‘qilmadi.');return attach([{name,read:async()=>{const bytes=Buffer.from(data instanceof ArrayBuffer?data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));if(bytes.length>LIMITS.inputBytes)throw new UserError(`${name}: fayl juda katta (15 MB gacha).`);return bytes;}}]);});
  register('attach-screen',async()=>{if(qa)throw new UserError('Sinov rejimida ekran olinmaydi.');const png=await captureScreen();const t=new Date();return attach([{name:`Skrinshot ${String(t.getHours()).padStart(2,'0')}-${String(t.getMinutes()).padStart(2,'0')}.png`,read:async()=>png}]);});
  register('attach-remove',id=>{files=files.filter(file=>file.id!==id);return forView(files);});
  register('pet-active',activity,true);
  register('move-pet',point=>{activity();if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return;const p=clamp(point,PET.width,PET.height);pet.setPosition(p.x,p.y);store.value.petPosition=p;},true);
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',showChat);app.on('activate',showChat);
  app.whenReady().then(()=>{
    store=new Store(app.getPath('userData'),safeStorage);const existed=fs.existsSync(store.file);store.load();chats=new Chats(app.getPath('userData'),safeStorage);chats.load();practice=new Practice(app.getPath('userData'));practice.load();
    previousVersion=store.value.lastVersion||(existed?'0.3.0':''); // 0.3.0 did not record its version
    store.value.lastVersion=app.getVersion();try{store.save();}catch{}
    let info={macSigned:false};try{info=require('./build-info.json');}catch{}
    const installed=process.platform!=='win32'||fs.existsSync(path.join(path.dirname(process.execPath),'Uninstall NurimAI.exe'));
    updates=new UpdateController({updater:qa?null:require('electron-updater').autoUpdater,packaged:app.isPackaged&&!qa,installed,platform:process.platform,signedMac:info.macSigned,release,onStatus:state=>{if(chat&&!chat.isDestroyed())chat.webContents.send('update-status',state);}});
    updates.setEnabled(store.value.autoUpdate);registerIPC();createWindows();
    startTimer=setTimeout(()=>updates.check(),30000);interval=setInterval(()=>updates.check(),6*60*60*1000);sleepTimer=setInterval(drowse,15000);remindTimer=setInterval(remind,30000);setTimeout(remind,5000);
    if(qa)globalThis.nurimQA={explain:explainSelection,sleep:()=>{sleeping=true;mood('sleep');},remind:()=>{practice.state.reminders.push({id:'qa',text:'Sinov eslatmasi',time:'00:00',repeat:'daily',date:'',last:''});practice.state.reminders.at(-1).time=new Date(Date.now()-60000).toTimeString().slice(0,5);remind();}}; // UI tests drive the shortcut and the sleep timer
  }).catch(error=>{if(qa)console.error(error.stack);else dialog.showErrorBox('NurimAI','Dastur ishga tushmadi. Dasturni qayta o‘rnating.');app.exit(1);});
  app.on('before-quit',()=>{exiting=true;controller?.abort();try{store?.save();}catch{}clearTimeout(startTimer);clearInterval(interval);clearInterval(sleepTimer);clearInterval(remindTimer);globalShortcut.unregisterAll();tray?.destroy();});
  app.on('window-all-closed',()=>{if(exiting)app.quit();});
}
