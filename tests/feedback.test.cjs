const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
// 👍/👎 under answers (apps and bot): only the rating is counted, once per bot answer, and the owner's report shows it;
// Settings shows what the document search has read.
const gemini=text=>Response.json({candidates:[{content:{parts:[{text}]},finishReason:'STOP'}]});
function fakeStorage(){const map=new Map(),storage={map,get:async k=>map.get(k),put:async(k,v)=>{map.set(k,v);},delete:async k=>{for(const x of [].concat(k))map.delete(x);},list:async({prefix})=>new Map([...map].filter(([k])=>k.startsWith(prefix))),transaction:async fn=>fn(storage)};return storage;}
test('a rating carries only the device and 👍 or 👎',async()=>{
 const {validateFeedback}=await import('../server/worker.mjs');const deviceId='12345678-1234-1234-1234-123456789abc';
 assert.deepEqual(validateFeedback({deviceId,good:true,question:'secret',answer:'x'}),{deviceId,good:true});
 for(const bad of [{deviceId,good:'yes'},{deviceId:'x',good:true},null])assert.throws(()=>validateFeedback(bad));
});
test('the apps\' ratings and the bot\'s buttons are counted (a bot answer once), and the report shows how satisfied people are',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {parseUpdate,keyboardFor}=await import('../server/telegram.mjs');const {count}=await import('../server/report.mjs');void count;
 assert.deepEqual(keyboardFor({}).inline_keyboard[0].map(b=>b.callback_data),['fb:1','fb:0'],'every bot answer can be rated');
 const real=globalThis.fetch;const answered=[];globalThis.fetch=async(url,o)=>{if(url.includes('api.telegram.org')){answered.push(JSON.parse(o.body));return Response.json({ok:true,result:{}});}return gemini('Ha');};
 try{
  const storage=fakeStorage();const gw=new AiGateway({storage},{GEMINI_API_KEY:'g',GEMINI_FREE_TIER:'true',RATE_SALT:'s',TELEGRAM_TOKEN:'1:x'});
  const rate=good=>gw.fetch(new Request('https://internal/feedback',{method:'POST',body:JSON.stringify({data:{deviceId:'d',good},identities:{ip:'i',device:'d'}})}));
  assert.equal((await rate(true)).status,200);await rate(true);await rate(false);
  const tap=(data,messageId)=>gw.telegram(parseUpdate({update_id:Math.floor(Math.random()*1e9),callback_query:{id:'c',data,from:{id:5},message:{message_id:messageId,chat:{id:5,type:'private'}}}}));
  await tap('fb:1',77);await tap('fb:1',77);await tap('fb:0',78);
  assert.match(answered.at(-2).text,/allaqachon/,'the same answer is rated once');assert.match(answered.at(-1).text,/Rahmat/);
  const day=Math.floor(Date.now()/86400000);assert.deepEqual(storage.map.get(`stats:${day}`).feedback,{good:3,bad:2});
  const report=await gw.report('NurimAI — bugungi holat',day,await gw.budgetsNow(day));assert.match(report,/👍 3 · 👎 2 — 60% mamnun/);
 }finally{globalThis.fetch=real;}
});
test('Settings can show what the document search has read: documents, PDFs, scans without text, and a fresh reading',async()=>{
 const {Library}=require('../src/rag.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-idx-'));
 fs.writeFileSync(path.join(dir,'a.txt'),'Fotosintez haqida konspekt');fs.writeFileSync(path.join(dir,'b.md'),'');fs.writeFileSync(path.join(dir,'c.png'),'x');
 let reads=0;const lib=new Library({roots:[{name:'D',path:dir}],read:f=>{reads++;return fs.promises.readFile(f);}});
 assert.deepEqual(await lib.status(),{files:2,read:1,pdf:0,empty:1,big:0,waiting:0,passages:1});assert.equal(reads,2);
 await lib.status();assert.equal(reads,2,'known files are not read again');await lib.status({fresh:true});assert.equal(reads,4,'a fresh reading reads them all');
 fs.rmSync(dir,{recursive:true,force:true});
});
