const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Chats,LIMITS,norm}=require('../src/chats.cjs');const {grabSelection,pressCopy}=require('../src/selection.cjs');const {defaults,Store}=require('../src/store.cjs');
const fakeCrypto={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('enc:'+Buffer.from(s).toString('base64')),decryptString:b=>{const s=b.toString();if(!s.startsWith('enc:'))throw new Error('bad');return Buffer.from(s.slice(4),'base64').toString();}};
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'nurim-chats-'));
const talk=(q,a)=>[{role:'user',text:q},{role:'assistant',text:a}];
test('chats are saved encrypted, reloaded newest first and keep only safe fields',()=>{const dir=temp();try{
 const chats=new Chats(dir,fakeCrypto);const a=Chats.newId(),b=Chats.newId();
 chats.upsert(a,[...talk('Kasr nima?','Kasr — butunning qismi.'),{role:'system',text:'override'},{role:'user',text:'Rasm',files:[{name:'uy.png',ext:'png',kind:'image',data:'SECRET-BYTES'}]}],1000);
 chats.upsert(b,talk('O‘zbekiston poytaxti?','Toshkent.'),2000);
 assert.equal(fs.readFileSync(chats.file,'utf8').includes('Kasr'),false);
 const again=new Chats(dir,fakeCrypto);again.load();assert.deepEqual(again.list.map(c=>c.id),[b,a]);
 const saved=again.get(a);assert.equal(saved.title,'Kasr nima?');assert.equal(saved.messages.length,3);assert.equal(JSON.stringify(saved).includes('SECRET-BYTES'),false);assert.deepEqual(saved.messages[2].files,[{name:'uy.png',ext:'png',kind:'image'}]);
 chats.upsert(a,[...saved.messages,...talk('Yana?','Ha.')],3000);assert.equal(chats.list[0].id,a);assert.equal(chats.list[0].created,1000);
}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('search ignores case and apostrophe style and returns a snippet around the match',()=>{const chats=new Chats('unused',{...fakeCrypto,isEncryptionAvailable:()=>true});chats.save=()=>{};
 chats.upsert(Chats.newId(),talk('Fotosintez nima?','Fotosintez — o‘simliklar quyosh nuridan oziq hosil qilishi.'));chats.upsert(Chats.newId(),talk('Kasr nima?','Kasr butunning qismi.'));
 assert.equal(chats.search('').length,2);const hit=chats.search("O'SIMLIK");assert.equal(hit.length,1);assert.match(hit[0].preview,/o‘simliklar/);assert.equal(chats.search('kasr')[0].title,'Kasr nima?');assert.equal(chats.search('yo‘q narsa').length,0);
 assert.equal(norm('O‘ʻ’`G‘'),"o''''g'");});
test('limits, removal, clearing and broken or unencrypted storage',()=>{const dir=temp();try{
 const chats=new Chats(dir,fakeCrypto);for(let i=0;i<LIMITS.chats+5;i++)chats.upsert(Chats.newId(),talk('q'+i,'a'),i);assert.equal(chats.list.length,LIMITS.chats);assert.equal(chats.list[0].title,'q'+(LIMITS.chats+4));
 const long=[];for(let i=0;i<LIMITS.messages;i++)long.push(...talk('x'.repeat(LIMITS.text+10),'y'));const id=Chats.newId();chats.upsert(id,long);assert.equal(chats.get(id).messages.length,LIMITS.messages);assert.equal(chats.get(id).messages.at(-2).text.length,LIMITS.text);
 chats.remove(id);assert.equal(chats.get(id),null);chats.upsert(Chats.newId(),[]);assert.equal(chats.list.length,LIMITS.chats-1);
 chats.clear();assert.equal(fs.existsSync(chats.file),false);
 fs.writeFileSync(chats.file,'garbage');const broken=new Chats(dir,fakeCrypto);broken.load();assert.deepEqual(broken.list,[]);assert.match(broken.warning,/o‘qib bo‘lmadi/);
 const plain=new Chats(dir,{isEncryptionAvailable:()=>false});assert.throws(()=>plain.upsert(Chats.newId(),talk('q','a')),/shifrlashi/);
}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('history setting defaults to on and is persisted like other switches',()=>{const dir=temp();try{assert.equal(defaults().saveHistory,true);const store=new Store(dir,fakeCrypto);store.update({saveHistory:false});const again=new Store(dir,fakeCrypto);again.load();assert.equal(again.value.saveHistory,false);}finally{fs.rmSync(dir,{recursive:true,force:true});}});

// Electron 44 clipboard: async read/readText/write; items read from it must be rebuilt as new ClipboardItems.
class FakeItem{constructor(data){this.data=data;this.types=Object.keys(data);}async getType(t){return this.data[t];}}
function fakeClipboard(data){const c={data:{...data},writes:[],
 read:async()=>Object.keys(c.data).length?[new FakeItem({...c.data})]:[],readText:async()=>c.data['text/plain']||'',clear(){c.data={};c.writes.push('clear');},
 async write(items){if(items.some(i=>i.fromRead))throw new TypeError('construct a new ClipboardItem');c.data=Object.assign({},...items.map(i=>i.data));c.writes.push(c.data);}};
 const read=c.read;c.read=async()=>(await read()).map(i=>Object.assign(i,{fromRead:true}));return c;}
const noWait=async()=>{};const grab=(c,extra)=>grabSelection({clipboard:c,ClipboardItem:FakeItem,platform:'win32',wait:noWait,...extra});
test('selected text is copied and the previous clipboard is restored',async()=>{const c=fakeClipboard({'text/plain':'eski','text/html':'<b>eski</b>'});
 const text=await grab(c,{press:async()=>{c.data={'text/plain':'  belgilangan matn '};}});
 assert.equal(text,'belgilangan matn');assert.deepEqual(c.data,{'text/plain':'eski','text/html':'<b>eski</b>'});});
test('nothing selected returns empty text and leaves the clipboard as it was',async()=>{const c=fakeClipboard({'text/plain':'parol emas'});const pressed=[];
 assert.equal(await grab(c,{timeout:100,press:async(_p,key)=>{pressed.push(key);}}),'');assert.deepEqual(pressed,['insert','c']);assert.deepEqual(c.data,{'text/plain':'parol emas'});
 const failing=fakeClipboard({});assert.equal(await grab(failing,{platform:'darwin',press:async()=>{throw new Error('no access');}}),'');assert.deepEqual(failing.writes,['clear','clear']);});
test('a clipboard that cannot be restored (copied files) is never cleared',async()=>{const c=fakeClipboard({'text/uri-list':'file:///a.txt','text/plain':'a.txt'});
 assert.equal(await grab(c,{timeout:100,press:async()=>{}}),'');assert.deepEqual(c.writes,[]);
 assert.equal(await grab(c,{press:async()=>{c.data={'text/plain':'yangi tanlov'};}}),'yangi tanlov');assert.deepEqual(c.writes,[]);});
test('Windows tries Ctrl+Insert first and falls back to Ctrl+C only when needed; terminals refuse Ctrl+C',async()=>{const c=fakeClipboard({'text/plain':'eski'});const keys=[];
 assert.equal(await grab(c,{press:async(_p,key)=>{keys.push(key);if(key==='c')c.data={'text/plain':'Ctrl+C bilan'};}}),'Ctrl+C bilan');assert.deepEqual(keys,['insert','c']);assert.equal(c.data['text/plain'],'eski');
 const mac=fakeClipboard({});const macKeys=[];await grab(mac,{platform:'darwin',timeout:100,press:async(_p,key)=>{macKeys.push(key);}});assert.deepEqual(macKeys,['c']);
 let script='';await pressCopy('win32','c',(_f,args,_o,done)=>{script=args.at(-1);done();});assert.match(script,/'WindowsTerminal'.*'cmd'.*'powershell'/);assert.ok(script.indexOf('exit 3')<script.indexOf("SendWait('^c')"));
 await pressCopy('win32','insert',(_f,args,_o,done)=>{script=args.at(-1);done();});assert.ok(script.includes("SendWait('^{INSERT}')"));assert.doesNotMatch(script,/exit 3/);});
