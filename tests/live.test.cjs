const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
// Live conversation: the server hands out a short-lived Gemini Live token locked to NurimAI's setup, within a daily budget;
// the Telegram Mini App signs in with its initData; the bot's /gaplash opens the page.
function fakeState(){const map=new Map();const storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{map.set(k,structuredClone(v));},delete:async k=>{map.delete(k);},transaction:async fn=>fn(storage)};return {storage,map};}
// Telegram's own way of signing Mini App data, to make test initData.
function signed(fields,botToken){const check=Object.entries(fields).map(([k,v])=>`${k}=${v}`).sort().join('\n');const secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest();return new URLSearchParams({...fields,hash:crypto.createHmac('sha256',secret).update(check).digest('hex')}).toString();}

test('the token is locked to the live model, voice, instruction and transcripts, for one session within a minute, ending with the call',async()=>{
 const {tokenRequest,liveSetup,LIVE,LIVE_INSTRUCTION,LOCKED}=await import('../server/live.mjs');
 const now=Date.parse('2026-10-31T12:00:00Z');const body=tokenRequest(now);
 assert.deepEqual([body.uses,body.newSessionExpireTime,body.expireTime],[1,'2026-10-31T12:01:00.000Z','2026-10-31T12:16:00.000Z']);
 assert.deepEqual(body.bidiGenerateContentSetup,{model:'models/gemini-3.8-live',generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Sulafat'}}}},systemInstruction:{parts:[{text:LIVE_INSTRUCTION}]},inputAudioTranscription:{},outputAudioTranscription:{},sessionResumption:{}});
 assert.equal(body.fieldMask,LOCKED);assert.deepEqual(LOCKED.split(','),['model','generationConfig','systemInstruction','tools','inputAudioTranscription','outputAudioTranscription'],'the page keeps only its resumption handle');
 assert.equal('fieldMask' in tokenRequest(now,false),false);
 const setup=liveSetup();assert.deepEqual(setup.generationConfig.responseModalities,['AUDIO']);assert.equal(setup.model,'models/gemini-3.8-live');assert.match(LIVE_INSTRUCTION,/O‘zbek tilida/);
 assert.match(LIVE.socket,/^wss:\/\/generativelanguage\.googleapis\.com\/ws\/.*BidiGenerateContentConstrained$/);
});
test('createLiveToken sends the key only in a header and returns the token, socket and setup; failures carry the status',async()=>{
 const {createLiveToken}=await import('../server/live.mjs');let sent;
 const out=await createLiveToken({key:'gem-key',now:0,fetcher:async(url,o)=>{sent={url,o};return Response.json({name:'auth_tokens/abc'});}});
 assert.equal(sent.url,'https://generativelanguage.googleapis.com/v1beta/auth_tokens');assert.equal(sent.o.headers['x-goog-api-key'],'gem-key');assert.equal(sent.o.body.includes('gem-key'),false);assert.equal(sent.o.redirect,'manual');
 assert.deepEqual([out.token,out.minutes,out.expiresAt],['auth_tokens/abc',15,900000]);assert.equal(out.setup.model,'models/gemini-3.8-live');
 const bodies=[];const plain=await createLiveToken({key:'k',now:0,fetcher:async(_u,o)=>{bodies.push(JSON.parse(o.body));return bodies.length===1?Response.json({error:{status:'INVALID_ARGUMENT'}},{status:400}):Response.json({name:'auth_tokens/plain'});}});
 assert.equal(plain.token,'auth_tokens/plain');assert.deepEqual(bodies.map(b=>'fieldMask' in b),[true,false],'a mask Google refuses: the whole setup is locked instead');
 await assert.rejects(createLiveToken({key:'k',fetcher:async()=>Response.json({error:{}},{status:429})}),e=>e.status===429);
 await assert.rejects(createLiveToken({key:'k',fetcher:async()=>Response.json({})}),/live token/);
});
test('Telegram Mini App data counts only with a valid signature from this bot, and only for a day',async()=>{
 const {telegramUser}=await import('../server/live.mjs');const now=Date.parse('2026-10-31T12:00:00Z');
 const fields={query_id:'AA1',user:JSON.stringify({id:7,first_name:'Ali'}),auth_date:String(now/1000-60)};
 assert.deepEqual(await telegramUser(signed(fields,'123:TEST'),'123:TEST',now),{id:7,name:'Ali'});
 assert.equal(await telegramUser(signed(fields,'999:OTHER'),'123:TEST',now),null,'another bot');
 assert.equal(await telegramUser(signed(fields,'123:TEST').replace('Ali','Vali'),'123:TEST',now),null,'changed data');
 assert.equal(await telegramUser(signed({...fields,auth_date:String(now/1000-90000)},'123:TEST'),'123:TEST',now),null,'too old');
 assert.equal(await telegramUser('','123:TEST',now),null);assert.equal(await telegramUser(signed(fields,'123:TEST'),'',now),null);
});
test('POST /live: a device gets a token within its daily budget; the Mini App signs in; bad sign-ins and spent budgets are refused',async()=>{
 const {default:worker,AiGateway}=await import('../server/worker.mjs');
 const real=globalThis.fetch;let tokens=0;globalThis.fetch=async url=>{if(String(url).includes('auth_tokens')){tokens++;return Response.json({name:`auth_tokens/t${tokens}`});}return new Response('x',{status:404});};
 try{
  const {storage}=fakeState();const env={RATE_SALT:'s',GEMINI_API_KEY:'g',GEMINI_FREE_TIER:'true',TELEGRAM_TOKEN:'123:TEST',LIVE_DEVICE:'2'};
  const gw=new AiGateway({storage},env);const BUDGET={idFromName:()=>'id',get:()=>({fetch:r=>gw.fetch(r)})};
  const post=(body,origin='https://ux7umid7.github.io')=>worker.fetch(new Request('https://api.test/live',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'1.2.3.4',Origin:origin},body:JSON.stringify(body)}),{...env,BUDGET});
  const device='12345678-1234-1234-1234-123456789abc';
  const first=await post({deviceId:device});assert.equal(first.status,200);const data=await first.json();assert.equal(data.token,'auth_tokens/t1');assert.equal(first.headers.get('Access-Control-Allow-Origin'),'https://ux7umid7.github.io');
  assert.equal((await post({deviceId:device})).status,200);const spent=await post({deviceId:device});assert.equal(spent.status,429);assert.ok(Number(spent.headers.get('Retry-After'))>0);
  const initData=signed({user:JSON.stringify({id:7,first_name:'Ali'}),auth_date:String(Math.floor(Date.now()/1000))},'123:TEST');
  assert.equal((await post({initData})).status,200,'the Telegram user has a budget of their own');
  assert.equal((await post({initData:initData.replace('Ali','Vali')})).status,401);
  assert.equal((await post({deviceId:'nope'})).status,400);assert.equal((await post({deviceId:device},'https://evil.example')).status,403);
  assert.equal(tokens,3);
  const off=new AiGateway({storage:fakeState().storage},{RATE_SALT:'s'});assert.equal((await off.fetch(new Request('https://internal/live',{method:'POST',body:JSON.stringify({identities:{ip:'i',device:'d'}})}))).status,503,'no Gemini key: no live calls');
 }finally{globalThis.fetch=real;}
});
test('the bot\'s /gaplash answers with a Mini App button for the live page, and help and the command list mention it',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {parseUpdate,TEXTS,HELP_KEYBOARD,LIVE_PAGE}=await import('../server/telegram.mjs');
 const real=globalThis.fetch;const calls=[];globalThis.fetch=async(url,o={})=>{calls.push({url:String(url),body:o.body?JSON.parse(o.body):null});return Response.json({ok:true,result:{message_id:1}});};
 try{
  const gw=new AiGateway({storage:fakeState().storage},{TELEGRAM_TOKEN:'123:TEST',RATE_SALT:'s',GEMINI_API_KEY:'g',GEMINI_FREE_TIER:'true'});
  const item=parseUpdate({update_id:5,message:{message_id:5,chat:{id:42,type:'private'},from:{id:7,is_bot:false},text:'/gaplash'}});if(await gw.firstDelivery(item))await gw.telegram(item);
  const sent=calls.find(c=>c.url.endsWith('/sendMessage')).body;assert.match(sent.text,/Jonli suhbat/);assert.deepEqual(sent.reply_markup.inline_keyboard[0][0].web_app,{url:LIVE_PAGE});
  assert.equal(LIVE_PAGE,'https://ux7umid7.github.io/NurimAI/app/live.html');assert.ok(HELP_KEYBOARD.inline_keyboard.flat().some(b=>b.web_app?.url===LIVE_PAGE));assert.match(TEXTS.help,/\/gaplash/);assert.match(TEXTS.hello,/\/gaplash/);
 }finally{globalThis.fetch=real;}
});
