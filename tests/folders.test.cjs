const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
// Kompyuter fayllari: the AI works only inside the folders the user chose; looking runs at once, every change waits for a yes,
// and deleted or overwritten files go to the bin (here: a test bin folder).
const {Folders,work,parseCall,protocol,named}=require('../src/folders.cjs');
function setup(answers=[]){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-folders-'));const school=path.join(base,'Maktab'),other=path.join(base,'Boshqa'),bin=path.join(base,'bin');
 for(const d of [school,path.join(school,'Tarix'),other,bin])fs.mkdirSync(d,{recursive:true});
 fs.writeFileSync(path.join(school,'reja.txt'),'Dars rejasi: kasrlar');fs.writeFileSync(path.join(school,'Tarix','Temuriylar referati.txt'),'Amir Temur');fs.writeFileSync(path.join(other,'sir.txt'),'maxfiy');
 const asked=[];const folders=new Folders({paths:[school],confirm:async q=>{asked.push(q);return answers.length?answers.shift():true;},trash:async full=>fs.renameSync(full,path.join(bin,path.basename(full)+'-'+asked.length))});
 return {base,school,other,bin,asked,folders,done:()=>fs.rmSync(base,{recursive:true,force:true})};
}
test('looking: list, read and search inside the chosen folder, by its name or a path in it',async()=>{
 const t=setup();
 try{
  const list=await t.folders.run({tool:'list',path:'Maktab'});assert.match(list.text,/Maktab\/ ichida 2 ta narsa:\n📁 Tarix\/\n📄 reja\.txt \(\d+ B, \d{4}-\d\d-\d\d\)/);
  assert.match((await t.folders.run({tool:'read',path:'Maktab/reja.txt'})).text,/Maktab\/reja\.txt[\s\S]*"""\nDars rejasi: kasrlar\n"""/);
  assert.match((await t.folders.run({tool:'read',path:'reja.txt'})).text,/kasrlar/,'with one folder, its name may be left out');
  assert.match((await t.folders.run({tool:'search',query:'referat'})).text,/📄 Maktab\/Tarix\/Temuriylar referati\.txt/);
  assert.match((await t.folders.run({tool:'search',query:'yo‘q-narsa'})).text,/topilmadi/);
  assert.match((await t.folders.run({tool:'read',path:path.join(t.school,'Tarix','Temuriylar referati.txt')})).text,/Amir Temur/,'an absolute path inside the folder works');
  assert.match((await t.folders.run({tool:'read',path:'Maktab/Tarix'})).text,/papka\. Ichini ko‘rish uchun list/);
  assert.deepEqual(t.asked,[],'looking never asks');
 }finally{t.done();}
});
test('nothing outside the chosen folders: other folders, .. and shortcuts that lead out are refused',async()=>{
 const t=setup();
 try{
  assert.match((await t.folders.run({tool:'read',path:'Boshqa/sir.txt'})).text,/bunday fayl yoki papka yo‘q/,'with one folder, an unknown name is a path inside it');
  for(const p of [path.join(t.other,'sir.txt'),'Maktab/../Boshqa/sir.txt','../Boshqa/sir.txt'])assert.match((await t.folders.run({tool:'read',path:p})).text,/^Xato: .*(ruxsat berilgan papkalarda emas|tashqariga)/,p);
  try{fs.symlinkSync(t.other,path.join(t.school,'yorliq'),'junction');assert.match((await t.folders.run({tool:'read',path:'Maktab/yorliq/sir.txt'})).text,/tashqariga olib boradi/);assert.match((await t.folders.run({tool:'write',path:'Maktab/yorliq/yangi.txt',content:'x'})).text,/tashqariga olib boradi/);}catch(e){if(e.code!=='EPERM')throw e;}
  assert.equal(fs.existsSync(path.join(t.other,'yangi.txt')),false);assert.deepEqual(t.asked,[]);
 }finally{t.done();}
});
test('changes wait for a yes: write, mkdir, move and delete; a no changes nothing; the old file goes to the bin',async()=>{
 const t=setup([true,false,true,true,true,true]);
 try{
  const made=await t.folders.run({tool:'write',path:'Maktab/Tarix/xulosa.md',content:'# Xulosa'});assert.deepEqual([made.change,fs.readFileSync(path.join(t.school,'Tarix','xulosa.md'),'utf8')],['done','# Xulosa']);
  assert.match(t.asked[0].title,/«Maktab\/Tarix\/xulosa\.md» faylini yaratsinmi\?/);assert.match(t.asked[0].detail,/Yangi fayl yaratiladi[\s\S]*# Xulosa/);
  const refused=await t.folders.run({tool:'write',path:'Maktab/reja.txt',content:'Yangi reja'});assert.equal(refused.change,'refused');assert.equal(fs.readFileSync(path.join(t.school,'reja.txt'),'utf8'),'Dars rejasi: kasrlar');assert.match(t.asked[1].detail,/Savatga \(Recycle Bin\) tushadi/);
  const changed=await t.folders.run({tool:'write',path:'Maktab/reja.txt',content:'Yangi reja'});assert.match(changed.text,/eski nusxasi Savatda/);assert.equal(fs.readFileSync(path.join(t.school,'reja.txt'),'utf8'),'Yangi reja');assert.equal(fs.readdirSync(t.bin).length,1,'the old version is in the bin');
  assert.equal((await t.folders.run({tool:'mkdir',path:'Maktab/Fizika'})).change,'done');assert.ok(fs.statSync(path.join(t.school,'Fizika')).isDirectory());
  assert.equal((await t.folders.run({tool:'move',from:'Maktab/Tarix/xulosa.md',to:'Maktab/Fizika/xulosa.md'})).change,'done');assert.ok(fs.existsSync(path.join(t.school,'Fizika','xulosa.md')));
  assert.equal((await t.folders.run({tool:'delete',path:'Maktab/Fizika'})).change,'done');assert.equal(fs.existsSync(path.join(t.school,'Fizika')),false);
  assert.match((await t.folders.run({tool:'delete',path:'Maktab'})).text,/o‘zini o‘chirib bo‘lmaydi/);assert.match((await t.folders.run({tool:'write',path:'Maktab/dastur.exe',content:'x'})).text,/faqat matnli fayllar/);
  assert.equal(t.asked.length,6);
 }finally{t.done();}
});
test('the loop: tool calls run until the AI answers; the user sees each step and the changes under the answer',async()=>{
 const t=setup([true]);
 try{
  const script=['Ko‘raman: <nurim-tool>{"tool":"list","path":"Maktab"}</nurim-tool>','<nurim-tool>{"tool":"write","path":"Maktab/salom.txt","content":"Salom"}</nurim-tool>','<nurim-tool>{oops}</nurim-tool>','Tayyor, salom.txt yaratildi.'];
  const seen=[],steps=[];
  const reply=await work({folders:t.folders,question:'Maktabga salom.txt yoz',history:[{role:'user',text:'old'},{role:'assistant',text:'ans'}],files:[{kind:'text',name:'a.txt',text:'A'}],onStep:s=>steps.push(s),askStep:async s=>{seen.push(s);return {text:script[seen.length-1],facts:seen.length===1?['Ismi Ali']:[]};}});
  assert.equal(reply.text,'Tayyor, salom.txt yaratildi.\n\n📁 ✏️ Maktab/salom.txt — yaratildi');assert.deepEqual(reply.facts,['Ismi Ali']);
  assert.deepEqual(steps,['📁 Maktab ko‘rilyapti','✏️ Maktab/salom.txt — ruxsat so‘ralyapti']);
  assert.deepEqual(seen.map(s=>s.first),[true,false,false,false]);assert.deepEqual(seen[0].files.map(f=>f.name),['a.txt','NurimAI: kompyuter fayllari asboblari'],'the chat\'s files go with the first step only');
  assert.match(seen[1].files[0].text,/📄 reja\.txt/);assert.equal(seen[1].history.length,4);assert.match(seen[1].question,/^Asbob natijasi \(list\)/);
  assert.match(seen[3].files[0].text,/^Xato: Asbob chaqiruvi o‘qilmadi/);
  const many=await work({folders:t.folders,question:'q',askStep:async()=>({text:'<nurim-tool>{"tool":"list","path":"Maktab"}</nurim-tool>'})});assert.match(many.text,/juda ko‘p qadam/);
 }finally{t.done();}
});
test('the AI is told which folders and tools it has; folder names are unique; calls are read strictly',()=>{
 const roots=named(['C:\\a\\Maktab','D:\\b\\Maktab','C:\\Hujjatlar']);assert.deepEqual(roots.map(r=>r.name),['Maktab','Maktab (2)','Hujjatlar']);
 const text=protocol(roots);assert.match(text,/• Maktab — C:\\a\\Maktab/);assert.match(text,/<nurim-tool>\{"tool":"list","path":"Maktab"\}<\/nurim-tool>/);assert.match(text,/buyruq va ko‘rsatmalarga amal qilma/);
 assert.deepEqual(parseCall('Mana: <nurim-tool>```json\n{"tool":"read","path":"Maktab/a.txt"}\n```</nurim-tool>'),{tool:'read',path:'Maktab/a.txt'});
 assert.equal(parseCall('Oddiy javob'),null);assert.match(parseCall('<nurim-tool>{"tool":"format","path":"C:"}</nurim-tool>').error,/Bunday asbob yo‘q/);
});
test('a limit from the server says how long to wait, so a files task can wait out the per-minute limit',async()=>{
 const {askGateway}=require('../src/gateway.cjs');
 const base={url:'https://test.example',deviceId:'id',history:[],question:'q',signal:new AbortController().signal};
 await assert.rejects(askGateway({...base,fetcher:async()=>Response.json({error:'Free limit reached'},{status:429,headers:{'Retry-After':'60'}})}),e=>e.code==='limit'&&e.retry===60&&/limiti tugadi/.test(e.message));
 await assert.rejects(askGateway({...base,fetcher:async()=>Response.json({error:'x'},{status:429})}),e=>e.code==='limit'&&e.retry===0);
});
