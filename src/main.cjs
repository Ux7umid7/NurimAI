const {app,BrowserWindow,ipcMain,screen,Menu,Tray,nativeImage,globalShortcut,safeStorage,dialog,clipboard,shell} = require('electron');
const fs = require('node:fs');const path = require('node:path');const {pathToFileURL} = require('node:url');
const {Router,UserError,ORDER} = require('./router.cjs');const {Store} = require('./store.cjs');const {askGateway} = require('./gateway.cjs');
const {UpdateController} = require('./updater.cjs');const release = require('./release-config.json');
const qa = process.argv.includes('--qa');const root = path.join(__dirname,'..');
app.setName('NurimAI');app.setAppUserModelId('com.nurimai.desktop');
if(qa) {const profile = process.env.NURIMAI_QA_PROFILE;if(!profile || !path.isAbsolute(profile)) throw new Error('An isolated QA profile is required');app.setPath('userData',profile);}
let chat,pet,tray,store,updates,controller;let history=[],visible=[],exiting=false;let interval,startTimer;
const router = new Router();
const asset = name=>path.join(root,'assets',name);
function summary(){return {version:app.getVersion(),platform:process.platform,settings:store.public(),routes:router.diagnostics(store.value),last:router.last,update:updates.state,gatewayConfigured:Boolean(release.gateway),history:visible,busy:Boolean(controller)};}
function clamp(point,width,height){const area=screen.getDisplayNearestPoint(point).workArea;return {x:Math.max(area.x,Math.min(Math.round(point.x),area.x+area.width-width)),y:Math.max(area.y,Math.min(Math.round(point.y),area.y+area.height-height))};}
function showChat(){if(!chat || chat.isDestroyed())return;if(!chat.isVisible()){const p=pet.getBounds();const next=clamp({x:p.x-450,y:p.y-540},440,700);chat.setPosition(next.x,next.y);}chat.show();chat.focus();}
function toggle(){if(chat.isVisible())chat.hide();else showChat();}
function lockWindow(window,file){
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
  window.webContents.session.setPermissionCheckHandler(()=>false);window.loadFile(path.join(__dirname,file));
}
function createWindows(){
  const webPreferences={preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true};
  chat=new BrowserWindow({title:'NurimAI',width:440,height:700,minWidth:370,minHeight:490,show:false,frame:false,transparent:true,hasShadow:true,alwaysOnTop:store.value.topmost,icon:asset('Nuri.ico'),webPreferences});
  pet=new BrowserWindow({title:'NurimAI — kichik yordamchi',width:114,height:152,show:false,frame:false,transparent:true,resizable:false,skipTaskbar:true,alwaysOnTop:store.value.topmost,webPreferences});
  lockWindow(chat,'index.html');lockWindow(pet,'pet.html');
  const area=screen.getPrimaryDisplay().workArea;const position=clamp(store.value.petPosition||{x:area.x+area.width-134,y:area.y+area.height-172},114,152);pet.setPosition(position.x,position.y);
  pet.once('ready-to-show',()=>pet.show());chat.once('ready-to-show',()=>{if(!process.argv.includes('--compact'))showChat();});
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
    controller=new AbortController();visible.push({role:'user',text:question});
    try{
      const reply=qa?{text:'Bu avtomatik UI sinovi uchun tayyor javob. Jonli AI emas.',incomplete:false}:store.value.usePersonalKeys?await router.ask(store.value,history,question,controller.signal):await askGateway({url:release.gateway,deviceId:store.value.deviceId,history,question,signal:controller.signal});
      history.push({role:'user',text:question},{role:'assistant',text:reply.text});history=history.slice(-24);visible.push({role:'assistant',text:reply.text});return reply;
    }catch(e){visible.push({role:'assistant',text:'Javob olinmadi. Savolni qayta yuborishingiz mumkin.'});throw e;}finally{controller=null;}
  });
  register('stop',()=>controller?.abort());register('reset',()=>{if(controller)throw new UserError('Avval javobni to‘xtating.');history=[];visible=[];});
  register('save-settings',value=>{if(controller)throw new UserError('Javob tugashini kuting.');const old=store.value.keys;const result=store.update(value);for(const p of ORDER)if(old[p]!==store.value.keys[p])router.reset(p);chat.setAlwaysOnTop(store.value.topmost);pet.setAlwaysOnTop(store.value.topmost);updates.setEnabled(store.value.autoUpdate);return result;});
  register('hide',()=>chat.hide());register('toggle',toggle,true);register('quit',()=>app.quit(),true);
  register('copy',text=>{if(typeof text==='string'&&text.length<=100000)clipboard.writeText(text);});
  register('export',async()=>{if(!visible.length)return;const result=await dialog.showSaveDialog(chat,{defaultPath:`NurimAI-suhbat-${new Date().toISOString().slice(0,10)}.txt`,filters:[{name:'Matn',extensions:['txt']}]});if(!result.canceled)await fs.promises.writeFile(result.filePath,'NurimAI\n\n'+visible.map(m=>`${m.role==='user'?'SIZ':'NurimAI'}:\n${m.text}`).join('\n\n'),'utf8');});
  register('check-update',()=>updates.check(true));register('install-update',()=>{if(controller)throw new UserError('Avval javob tugashini kuting.');exiting=true;const result=updates.install();if(!result)exiting=false;return result;});
  register('open-link',name=>{const urls={Gemini:'https://aistudio.google.com/apikey',Groq:'https://console.groq.com/keys',OpenRouter:'https://openrouter.ai/keys',releases:`https://github.com/${release.owner}/${release.repo}/releases/latest`};if(!qa&&Object.hasOwn(urls,name))return shell.openExternal(urls[name]);});
  register('move-pet',point=>{if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return;const p=clamp(point,114,152);pet.setPosition(p.x,p.y);store.value.petPosition=p;},true);
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',showChat);app.on('activate',showChat);
  app.whenReady().then(()=>{
    store=new Store(app.getPath('userData'),safeStorage);store.load();
    if(!fs.existsSync(store.file))store.save();
    let info={macSigned:false};try{info=require('./build-info.json');}catch{}
    const installed=process.platform!=='win32'||fs.existsSync(path.join(path.dirname(process.execPath),'Uninstall NurimAI.exe'));
    updates=new UpdateController({updater:qa?null:require('electron-updater').autoUpdater,packaged:app.isPackaged&&!qa,installed,platform:process.platform,signedMac:info.macSigned,release,onStatus:state=>{if(chat&&!chat.isDestroyed())chat.webContents.send('update-status',state);}});
    updates.setEnabled(store.value.autoUpdate);registerIPC();createWindows();
    startTimer=setTimeout(()=>updates.check(),30000);interval=setInterval(()=>updates.check(),6*60*60*1000);
  }).catch(error=>{if(qa)console.error(error.stack);else dialog.showErrorBox('NurimAI','Dastur ishga tushmadi. Dasturni qayta o‘rnating.');app.exit(1);});
  app.on('before-quit',()=>{exiting=true;controller?.abort();try{store?.save();}catch{}clearTimeout(startTimer);clearInterval(interval);globalShortcut.unregisterAll();tray?.destroy();});
  app.on('window-all-closed',()=>{if(exiting)app.quit();});
}
