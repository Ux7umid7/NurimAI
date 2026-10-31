const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
// Memory in the apps: the router adds it to a question and takes new facts out of the answer; /chat and the gateway carry it;
// the desktop keeps it in an encrypted file.
const {Router}=require('../src/router.cjs');const {askGateway}=require('../src/gateway.cjs');const {Memory}=require('../src/memory-store.cjs');const {cleanFacts,memoryNote}=require('../src/shared/memory.js');const {defaults}=require('../src/store.cjs');
const settings=()=>({...defaults(),keys:{Gemini:'g',Groq:'',OpenRouter:''},free:{Gemini:true,Groq:false}});
const gemini=text=>Response.json({candidates:[{content:{parts:[{text}]},finishReason:'STOP'}]});
const fakeCrypto={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};

test('the router adds what is remembered to the question and takes the XOTIRA line out of the answer',async()=>{
 const sent=[];const router=new Router({fetcher:async(_u,o)=>{sent.push(JSON.parse(o.body));return gemini('Salom, Ali!\nXOTIRA: Ismi Ali; Futbolni yoqtiradi');}});
 const reply=await router.ask(settings(),[],'Salom',undefined,[],{memory:['8-sinfda o‘qiydi']});
 assert.match(sent[0].contents.at(-1).parts.at(-1).text,/^\[Foydalanuvchi haqida avval aytilganlar[^\]]*: 8-sinfda o‘qiydi\]\n\nSalom\n\nAgar foydalanuvchi/);
 assert.deepEqual([reply.text,reply.facts],['Salom, Ali!',['Ismi Ali','Futbolni yoqtiradi']]);
 const plain=await router.ask(settings(),[],'Salom');assert.equal(sent[1].contents.at(-1).parts.at(-1).text,'Salom');assert.deepEqual(plain.facts,[]);assert.match(plain.text,/XOTIRA/,'without memory the answer is left as it is');
 const empty=await router.ask(settings(),[],'Kasr nima?',undefined,[],{memory:[]});assert.match(sent[2].contents.at(-1).parts.at(-1).text,/^Kasr nima\?\n\nAgar foydalanuvchi/);assert.equal(empty.text,'Salom, Ali!');
 assert.equal(memoryNote(['a','b']),memoryNote([{text:'a'},{text:'b'}]));
});
test('/chat takes the app\'s memory and returns the new facts; old apps (no memory) get exactly what they got before',async()=>{
 const {AiGateway,validatePayload}=await import('../server/worker.mjs');
 const base={deviceId:'12345678-1234-1234-1234-123456789abc',question:'Salom',history:[]};
 assert.equal('memory' in validatePayload(base),false);assert.deepEqual(validatePayload({...base,memory:['Ismi Ali',5,'','x'.repeat(300)]}).memory,['Ismi Ali','x'.repeat(160)]);
 assert.deepEqual(cleanFacts('nope'),[]);assert.equal(cleanFacts(Array.from({length:30},(_,i)=>`f${i}`)).length,15);
 const real=globalThis.fetch;const sent=[];globalThis.fetch=async(_u,o)=>{sent.push(JSON.parse(o.body));return gemini('Salom!\nXOTIRA: Ismi Ali');};
 try{
  const map=new Map(),storage={get:async k=>map.get(k),put:async(k,v)=>{map.set(k,v);},transaction:async fn=>fn(storage)};
  const gw=new AiGateway({storage},{GEMINI_API_KEY:'g',GEMINI_FREE_TIER:'true',RATE_SALT:'s'});
  const call=data=>gw.fetch(new Request('https://internal/chat',{method:'POST',body:JSON.stringify({data:{files:[],...data},identities:{ip:'i',device:'d'}})}));
  const withMemory=await(await call({question:'Men Aliman',history:[],memory:['8-sinf']})).json();
  assert.deepEqual(withMemory,{text:'Salom!',incomplete:false,facts:['Ismi Ali']});assert.match(sent[0].contents.at(-1).parts.at(-1).text,/: 8-sinf\]\n\nMen Aliman\n\nAgar/);
  const old=await(await call({question:'Men Aliman',history:[]})).json();assert.deepEqual(old,{text:'Salom!\nXOTIRA: Ismi Ali',incomplete:false});assert.equal(sent[1].contents.at(-1).parts.at(-1).text,'Men Aliman');
 }finally{globalThis.fetch=real;}
});
test('the gateway client sends memory only when it is on and reads the facts back',async()=>{
 let sent;const fetcher=async(_u,o)=>{sent=JSON.parse(o.body);return Response.json({text:'ok',facts:['Ismi Ali',7]});};
 const base={url:'https://test.example',deviceId:'id',history:[],question:'q',signal:new AbortController().signal,fetcher};
 const on=await askGateway({...base,memory:['8-sinf']});assert.deepEqual(sent.memory,['8-sinf']);assert.deepEqual(on.facts,['Ismi Ali']);
 await askGateway(base);assert.equal('memory' in sent,false);
});
test('the desktop keeps memory in an encrypted file: add without repeats, forget one, forget all, switch off',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-memory-'));
 try{
  const m=new Memory(dir,fakeCrypto);m.load();assert.deepEqual(m.view(),{enabled:true,facts:[],persistent:true});
  m.add(['Ismi Ali','8-sinfda o‘qiydi']);m.add(['ismi ali','Futbolni yoqtiradi']);assert.deepEqual(m.forQuestion(),['8-sinfda o‘qiydi','ismi ali','Futbolni yoqtiradi']);
  assert.equal(fs.readFileSync(m.file,'utf8').includes('Futbol'),false,'not stored as plain text');
  const again=new Memory(dir,fakeCrypto);again.load();assert.deepEqual(again.view().facts,['8-sinfda o‘qiydi','ismi ali','Futbolni yoqtiradi']);
  again.remove(1);again.remove(9);assert.deepEqual(again.view().facts,['8-sinfda o‘qiydi','Futbolni yoqtiradi']);
  again.setEnabled(false);assert.equal(again.forQuestion(),undefined);again.add(['Yangi']);assert.equal(again.view().facts.length,2,'off: nothing new is kept');
  again.clear();const last=new Memory(dir,fakeCrypto);last.load();assert.deepEqual(last.view(),{enabled:false,facts:[],persistent:true});
  const noCrypto=new Memory(dir,{isEncryptionAvailable:()=>false});noCrypto.add(['Ismi Ali']);assert.deepEqual(noCrypto.view(),{enabled:true,facts:['Ismi Ali'],persistent:false});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
