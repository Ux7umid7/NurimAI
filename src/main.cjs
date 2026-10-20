const {app,BrowserWindow,ipcMain,screen,Menu,Tray,nativeImage,globalShortcut,safeStorage,dialog,clipboard,shell,desktopCapturer,systemPreferences} = require('electron');
const fs = require('node:fs');const path = require('node:path');const {pathToFileURL} = require('node:url');
const {Router,UserError,ORDER} = require('./router.cjs');const {Store} = require('./store.cjs');const {askGateway} = require('./gateway.cjs');
const {UpdateController} = require('./updater.cjs');const release = require('./release-config.json');
const {prepare,checkFits,forRequest,forView,LIMITS,PICKER_EXTENSIONS} = require('./attachments.cjs');const whatsNew = require('./whats-new.json');
const qa = process.argv.includes('--qa');const root = path.join(__dirname,'..');
app.setName('NurimAI');app.setAppUserModelId('com.nurimai.desktop');
if(qa) {const profile = process.env.NURIMAI_QA_PROFILE;if(!profile || !path.isAbsolute(profile)) throw new Error('An isolated QA profile is required');app.setPath('userData',profile);}
let chat,pet,tray,store,updates,controller;let history=[],visible=[],exiting=false;let interval,startTimer;
let files=[],fileSeq=0,previousVersion='';const sentIds=new Set(); // attachments already shown on a sent message
const router = new Router();
const asset = name=>path.join(root,'assets',name);
const PET={width:144,height:180};
// The 3D mascot plays idle / think / happy animations; the pet window only reacts to these moods.
function mood(state){if(pet&&!pet.isDestroyed())pet.webContents.send('mood',state);}
function summary(){return {version:app.getVersion(),platform:process.platform,settings:store.public(),routes:router.diagnostics(store.value),last:router.last,update:updates.state,gatewayConfigured:Boolean(release.gateway),history:visible,busy:Boolean(controller),files:forView(files),sentIds:[...sentIds],whatsNew:previousVersion&&previousVersion!==app.getVersion()?whatsNew[app.getVersion()]||[]:[]};}
function clamp(point,width,height){const area=screen.getDisplayNearestPoint(point).workArea;return {x:Math.max(area.x,Math.min(Math.round(point.x),area.x+area.width-width)),y:Math.max(area.y,Math.min(Math.round(point.y),area.y+area.height-height))};}
function showChat(){if(!chat || chat.isDestroyed())return;if(!chat.isVisible()){const p=pet.getBounds();const next=clamp({x:p.x-450,y:p.y-540},440,700);chat.setPosition(next.x,next.y);}chat.show();chat.focus();}
function toggle(){if(chat.isVisible())chat.hide();else showChat();}
// Attachments: only files the user hands over (picker, drop, paste, screen capture) are read.
async function imageTool(bytes,mime){
  const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())return {mime,data:bytes}; // WebP/HEIC go to Gemini as they are
  const {width,height}=image.getSize();const fit=size=>width>=height?{width:Math.min(width,size),quality:'best'}:{height:Math.min(height,size),quality:'best'};
  const scaled=Math.max(width,height)>2000?image.resize(fit(2000)):image;const keepPng=mime==='image/png'&&scaled===image&&bytes.length<=1.5*1024*1024;
  return {mime:keepPng?'image/png':'image/jpeg',data:keepPng?bytes:scaled.toJPEG(90),thumb:image.resize(fit(96)).toDataURL()};
}
async function attach(items){
  const errors=[];
  for(const item of items){try{const file=await prepare({name:item.name,bytes:await item.read(),imageTool});checkFits(files,file);file.id=String(++fileSeq);files.push(file);}catch(e){errors.push(e instanceof UserError?e.message:`${item.name}: faylni qo‘shib bo‘lmadi.`);}}
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
function lockWindow(window,file){
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
  window.webContents.session.setPermissionCheckHandler(()=>false);window.loadFile(path.join(__dirname,file));
}
function createWindows(){
  const webPreferences={preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true};
  chat=new BrowserWindow({title:'NurimAI',width:440,height:700,minWidth:370,minHeight:490,show:false,frame:false,transparent:true,hasShadow:true,alwaysOnTop:store.value.topmost,icon:asset('Nuri.ico'),webPreferences});
  pet=new BrowserWindow({title:'NurimAI — kichik yordamchi',width:PET.width,height:PET.height,show:false,frame:false,transparent:true,resizable:false,skipTaskbar:true,alwaysOnTop:store.value.topmost,webPreferences});
  lockWindow(chat,'index.html');lockWindow(pet,'pet.html');
  const area=screen.getPrimaryDisplay().workArea;const position=clamp(store.value.petPosition||{x:area.x+area.width-PET.width-20,y:area.y+area.height-PET.height-20},PET.width,PET.height);pet.setPosition(position.x,position.y);
  pet.once('ready-to-show',()=>{pet.show();setTimeout(()=>mood('happy'),1200);}); // small hop to say hellochat.once('ready-to-show',()=>{if(!process.argv.includes('--compact'))showChat();});
  chat.on('close',e=>{if(!exiting){e.preventDefault();chat.hide();}});
  pet.on('close',e=>{if(!exiting)e.preventDefault();});
  pet.on('moved',()=>{const [x,y]=pet.getPosition();store.value.petPosition={x,y};});
  pet.webContents.on('context-menu',()=>Menu.buildFromTemplate([{label:'Suhbatni ochish',click:showChat},{label:'Chiqish',click:()=>app.quit()}]).popup({window:pet}));
  // macOS cannot read .ico; the menu bar uses a monochrome template image (with its @2x sibling).
  tray=new Tray(process.platform==='darwin'?nativeImage.createFromPath(asset('trayTemplate.png')):nativeImage.createFromPath(asset('Nuri.ico')).resize({width:20,height:20}));tray.setToolTip('NurimAI');
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Suhbatni ochish',click:showChat},{label:'Yangilanishni tekshirish',click:()=>{showChat();updates.check(true);}},{label:'Chiqish',click:()=>app.quit()}]));tray.on('click',toggle);
  globalShortcut.register('CommandOrControl+Alt+Space',toggle);
}
function register(channel,handler,petAllowed=false){ipcMain.handle(channel,async(event,...args)=>{
  const allowed=[chat,...(petAllowed?[pet]:[])].filter(Boolean);
  if(!allowed.some(w=>event.sender===w.webContents) || event.senderFrame !== event.sender.mainFrame) return {ok:false,error:'Ruxsat yo‘q.'};
  const file=event.sender===pet?.webContents?'pet.html':'index.html';
  if(event.senderFrame.url!==pathToFileURL(path.join(__dirname,file)).href) return {ok:false,error:'Ruxsat yo‘q.'};
  try{return {ok:true,data:await handler(...args)};}catch(e){return {ok:false,error:e instanceof UserError?e.message:e?.name==='AbortError'?'Javob to‘xtatildi.':'Amal bajarilmadi. Qayta urinib ko‘ring.'};}
});}
function registerIPC(){
  register('init',summary);register('settings',summary);
  register('send',async(question)=>{
    if(controller)throw new UserError('Avvalgi javobni kuting.');
    if(typeof question!=='string'||!question.trim()||question.length>6000)throw new UserError('Savol 1–6000 belgi bo‘lsin.');question=question.trim();
    controller=new AbortController();const sent=forRequest(files);const fresh=files.filter(f=>!sentIds.has(f.id));fresh.forEach(f=>sentIds.add(f.id));visible.push({role:'user',text:question,files:fresh.map(({name,ext,kind})=>({name,ext,kind}))});
    mood('think');
    try{
      const reply=qa?{text:`Bu avtomatik UI sinovi uchun tayyor javob. Jonli AI emas.${sent.length?` Biriktirilgan fayllar: ${sent.length}.`:''}`,incomplete:false}:store.value.usePersonalKeys?await router.ask(store.value,history,question,controller.signal,sent):await askGateway({url:release.gateway,deviceId:store.value.deviceId,history,question,files:sent,signal:controller.signal});
      history.push({role:'user',text:question},{role:'assistant',text:reply.text});history=history.slice(-24);visible.push({role:'assistant',text:reply.text});mood('happy');return reply;
    }catch(e){visible.push({role:'assistant',text:'Javob olinmadi. Savolni qayta yuborishingiz mumkin.'});mood('idle');throw e;}finally{controller=null;}
  });
  register('stop',()=>controller?.abort());register('reset',()=>{if(controller)throw new UserError('Avval javobni to‘xtating.');history=[];visible=[];files=[];sentIds.clear();});
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
  register('move-pet',point=>{if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return;const p=clamp(point,PET.width,PET.height);pet.setPosition(p.x,p.y);store.value.petPosition=p;},true);
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',showChat);app.on('activate',showChat);
  app.whenReady().then(()=>{
    store=new Store(app.getPath('userData'),safeStorage);const existed=fs.existsSync(store.file);store.load();
    previousVersion=store.value.lastVersion||(existed?'0.3.0':''); // 0.3.0 did not record its version
    store.value.lastVersion=app.getVersion();try{store.save();}catch{}
    let info={macSigned:false};try{info=require('./build-info.json');}catch{}
    const installed=process.platform!=='win32'||fs.existsSync(path.join(path.dirname(process.execPath),'Uninstall NurimAI.exe'));
    updates=new UpdateController({updater:qa?null:require('electron-updater').autoUpdater,packaged:app.isPackaged&&!qa,installed,platform:process.platform,signedMac:info.macSigned,release,onStatus:state=>{if(chat&&!chat.isDestroyed())chat.webContents.send('update-status',state);}});
    updates.setEnabled(store.value.autoUpdate);registerIPC();createWindows();
    startTimer=setTimeout(()=>updates.check(),30000);interval=setInterval(()=>updates.check(),6*60*60*1000);
  }).catch(error=>{if(qa)console.error(error.stack);else dialog.showErrorBox('NurimAI','Dastur ishga tushmadi. Dasturni qayta o‘rnating.');app.exit(1);});
  app.on('before-quit',()=>{exiting=true;controller?.abort();try{store?.save();}catch{}clearTimeout(startTimer);clearInterval(interval);globalShortcut.unregisterAll();tray?.destroy();});
  app.on('window-all-closed',()=>{if(exiting)app.quit();});
}
