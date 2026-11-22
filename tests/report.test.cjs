const test=require('node:test');const assert=require('node:assert/strict');
// Kunlik hisobot (server/report.mjs): what is left on each API key (Gemini counted by the server, Groq from its headers),
// NurimAI's own daily limits, answers, cache and protection — sent to the bot's owner only.
const load=()=>import('../server/report.mjs');
const gemini=text=>Response.json({candidates:[{content:{parts:[{text}]},finishReason:'STOP'}]});
function fakeStorage(){const map=new Map(),storage={map,get:async k=>map.get(k),put:async(k,v)=>{map.set(k,v);},delete:async k=>{for(const x of [].concat(k))map.delete(x);},list:async({prefix})=>new Map([...map].filter(([k])=>k.startsWith(prefix))),transaction:async fn=>fn(storage)};return storage;}

test('the daily limits are the ones the server always had, and env can change them within bounds',async()=>{
 const {limitsFor}=await load();const l=limitsFor({});
 assert.deepEqual([l.budget.total,l.budget.ip,l.budget.device,l.budget.minute],[200,60,30,10]);assert.deepEqual([l.telegram.total,l.telegram.ip],[300,20]);
 assert.deepEqual([l['tg-group'].total,l['tg-group'].ip,l['tg-voice'].total,l.speech.total,l.live.total,l.live.device],[1000,80,300,400,100,6]);
 assert.equal(limitsFor({DAILY_TOTAL:'500'}).budget.total,500);assert.equal(limitsFor({DAILY_TOTAL:'99999'}).budget.total,1000);
});
test('answers are counted from their traces: routes, limits hit, cache, protection, question levels and time',async()=>{
 const {count,emptyStats}=await load();let s=emptyStats(1);
 s=count(s,'app',{steps:[{step:'level',level:'normal'},{step:'route',route:'Gemini',status:'Bepul limit cheklovi'},{step:'route',route:'GPT',ok:true}],ms:900});
 s=count(s,'telegram',{steps:[{step:'cache',hit:true}],ms:0});
 s=count(s,'app',{steps:[{step:'guard',masked:['telefon']},{step:'guard',blocked:'injection'}],ms:0});
 s=count(s,'app',{steps:[{step:'route',route:'Gemini',status:'Tarmoq xatosi'},{step:'route',route:'GPT',skipped:'x'}],ms:40000,error:true},true);
 assert.deepEqual(s.routes,{Gemini:{ok:0,limit:1,fail:1},GPT:{ok:1,limit:0,fail:0}});assert.deepEqual(s.answers,{app:2,telegram:1});assert.deepEqual(s.failed,{app:1});
 assert.equal(s.cache.hit,1);assert.equal(s.guard.masked,1);assert.equal(s.guard.blocked,1);assert.equal(s.levels.normal,1);assert.deepEqual(s.ms,{sum:900,count:1},'cache hits, blocked attacks and failures do not count as answer time');
});
test('a budget shows used, limit, percent, people and who reached their own limit; yesterday\'s data counts as nothing today',async()=>{
 const {usage,limitsFor}=await load();const limits=limitsFor({}).budget;
 const data={day:5,total:150,ips:{a:{count:60},b:{count:3}},devices:{x:30,y:2,z:1}};
 assert.deepEqual(usage(data,limits,5),{used:150,limit:200,pct:75,people:3,capped:2});
 assert.deepEqual(usage(data,limits,6),{used:0,limit:200,pct:0,people:0,capped:0});
});
test('the keys section: Gemini\'s left from the server\'s own count, Groq from its headers, and the reset time in Tashkent',async()=>{
 const {keysText,dailyQuota,resetHour,ptDate}=await load();const now=Date.UTC(2026,10,15,6);
 const text=keysText({gemini:{models:{'gemini-3.5-flash-lite':{n:340,limited:0},'gemini-3.8-flash-lite-tts':{n:12,limited:0},live:{n:2,limited:0}}},learned:{'gemini-3.8-flash-lite-tts':100},groq:{'openai/gpt-oss-120b':{limit:1000,left:980,at:now}},stats:{routes:{Cloudflare:{ok:2,limit:0,fail:0}}},env:{GEMINI_DAILY_LIMIT:'1000'},now,chatModel:'gemini-3.5-flash-lite'});
 assert.match(text,/gemini-3\.5-flash-lite: qoldi <b>660<\/b> \/ 1 000 \(34% ishlatildi\)/);assert.match(text,/flash-lite-tts: qoldi <b>88<\/b> \/ 100/);assert.match(text,/jonli suhbat \(sessiya\): 2 so‘rov ishlatildi — limit hali noma’lum/);
 assert.match(text,/GPT-OSS qoldi <b>980<\/b> \/ 1 000/);assert.match(text,/Toshkent vaqti 13:00/);assert.match(text,/Workers AI<\/b>: 2 so‘rov/);
 assert.match(keysText({now,chatModel:'gemini-3.5-flash-lite'}),/gemini-3\.5-flash-lite: 0 so‘rov ishlatildi — limit hali noma’lum/);
 assert.equal(resetHour(Date.UTC(2026,6,1)),12,'Pacific summer time');assert.equal(ptDate(Date.UTC(2026,10,15,7,59)),'2026-11-14','Gemini\'s day turns at 08:00 UTC in winter');
 assert.equal(dailyQuota({details:[{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier',quotaValue:'1000'}]}]}),1000);
 assert.equal(dailyQuota({details:[{violations:[{quotaId:'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',quotaValue:'15'}]}]}),0,'a per-minute limit is not the day\'s');
});
test('the report reads well and warns when a limit is nearly used up',async()=>{
 const {reportText,emptyStats,usage,limitsFor}=await load();const l=limitsFor({});const s=emptyStats(20407);s.answers={app:10,telegram:5};s.cache.hit=3;s.routes.Gemini={ok:12,limit:1,fail:0};
 const text=reportText({title:'NurimAI — kunlik hisobot',day:20407,budgets:{budget:usage({day:20407,total:170,ips:{},devices:{}},l.budget,20407),telegram:usage(null,l.telegram,20407)},stats:s,keys:'<b>🔑 API kalitlar</b>'});
 assert.match(text,/^📊 <b>NurimAI — kunlik hisobot<\/b>\n15-noyabr\n\n<b>🔑 API kalitlar<\/b>/);assert.match(text,/▓{9}░ 85% · Ilovalar \(kompyuter, telefon\): 170 \/ 200/);
 assert.match(text,/⚠️ Ilovalar \(kompyuter, telefon\): limitning 85%/);assert.match(text,/⚠️ Gemini limitga yetdi/);assert.match(text,/Keshdan: 3 javob \(20%\)/);
 assert.match(reportText({title:'x',day:1,budgets:null,stats:null}),/limit ma’lumoti saqlanmagan/);
});
test('the server counts each Gemini request, learns the day\'s limit from Google\'s 429, keeps Groq\'s headers and tells only the owner',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {ptDate}=await load();const real=globalThis.fetch;const told=[];let geminiDown=false;
 globalThis.fetch=async(url,o)=>{
  if(url.includes('api.telegram.org')){told.push(JSON.parse(o.body));return Response.json({ok:true,result:{}});}
  if(url.includes('googleapis'))return geminiDown?Response.json({error:{code:429,status:'RESOURCE_EXHAUSTED',details:[{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier',quotaValue:'3'}]}]}},{status:429}):gemini('Ha');
  return new Response(JSON.stringify({choices:[{message:{content:'Groq'},finish_reason:'stop'}]}),{headers:{'content-type':'application/json','x-ratelimit-limit-requests':'1000','x-ratelimit-remaining-requests':'997'}});
 };
 try{
  const storage=fakeStorage();const env={GEMINI_API_KEY:'g',GEMINI_FREE_TIER:'true',GROQ_API_KEY:'q',GROQ_FREE_TIER:'true',RATE_SALT:'s',TELEGRAM_TOKEN:'1:x',OWNER_TELEGRAM_ID:'42'};
  const gw=new AiGateway({storage},env);
  const call=question=>gw.fetch(new Request('https://internal/chat',{method:'POST',body:JSON.stringify({data:{files:[],history:[],question},identities:{ip:'i',device:'d'}})})).then(r=>r.json());
  await call('Kasr nima?');await call('Kasr nima?');geminiDown=true;const third=await call('Kasr nima?');
  assert.equal(third.text,'Groq','the free route answered when Gemini ran out');
  const day=storage.map.get(`gem:${ptDate(Date.now())}`);assert.deepEqual(day.models['gemini-3.5-flash-lite'],{n:3,limited:1});
  assert.deepEqual(storage.map.get('lim:gemini'),{'gemini-3.5-flash-lite':3});assert.equal(storage.map.get('quota:groq')['openai/gpt-oss-120b'].left,997);
  assert.equal(told.length,1);assert.equal(told[0].chat_id,'42');assert.match(told[0].text,/kunlik bepul limiti tugadi: 3 so‘rov/);
  await call('Kasr nima?');assert.equal(told.length,1,'once a day');
  const report=await gw.report('NurimAI — bugungi holat',Math.floor(Date.now()/86400000),await gw.budgetsNow(Math.floor(Date.now()/86400000)));
  assert.match(report,/gemini-3\.5-flash-lite: qoldi <b>0<\/b> \/ 3 \(133% ishlatildi\) · 1 marta limit|gemini-3\.5-flash-lite: qoldi <b>0<\/b> \/ 3/);assert.match(report,/GPT-OSS qoldi <b>997<\/b> \/ 1 000/);assert.match(report,/Ilovalar \(kompyuter, telefon\): 4 \/ 200/);
 }finally{globalThis.fetch=real;}
});
test('/hisobot answers the owner only, /id tells anyone their id, and the morning report goes out once',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {parseUpdate}=await import('../server/telegram.mjs');const real=globalThis.fetch;const sent=[];
 globalThis.fetch=async(url,o)=>{if(url.includes('api.telegram.org')){sent.push(JSON.parse(o.body));return Response.json({ok:true,result:{}});}return gemini('Ha');};
 try{
  const storage=fakeStorage();const gw=new AiGateway({storage},{GEMINI_API_KEY:'g',GEMINI_FREE_TIER:'true',RATE_SALT:'s',TELEGRAM_TOKEN:'1:x',OWNER_TELEGRAM_ID:'42'});
  const say=(from,text)=>gw.telegram(parseUpdate({update_id:Math.floor(Math.random()*1e9),message:{message_id:1,date:1,chat:{id:from,type:'private'},from:{id:from,first_name:'A'},text}}));
  await say(42,'/hisobot');assert.match(sent.at(-1).text,/API kalitlar — qancha qoldi/);assert.equal(sent.at(-1).chat_id,42);
  await say(7,'/hisobot');assert.equal(sent.at(-1).text,'Bu buyruq faqat bot egasi uchun.');
  await say(7,'/id');assert.match(sent.at(-1).text,/<code>7<\/code>/);
  const day=20407,at=(d,h,m=0)=>d*86400000+(h*60+m)*60000;sent.length=0;
  storage.map.set('budget',{day,total:50,ips:{a:{count:50}},devices:{d:50}});
  assert.equal(await gw.dailyReport(at(day,23,56)),false);assert.ok(storage.map.get(`report:snap:${day}`),'kept before the reset');
  assert.equal(await gw.dailyReport(at(day+1,3,59)),false,'not before 09:00 in Tashkent');
  assert.equal(await gw.dailyReport(at(day+1,4,1)),true);assert.equal(sent.length,1);assert.match(sent[0].text,/kunlik hisobot[\s\S]*Ilovalar \(kompyuter, telefon\): 50 \/ 200/);
  assert.equal(await gw.dailyReport(at(day+1,4,2)),false,'once');assert.equal(sent.length,1);
 }finally{globalThis.fetch=real;}
});
