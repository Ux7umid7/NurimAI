const test=require('node:test');const assert=require('node:assert/strict');
// Fake Durable Object storage and a fake network (Telegram Bot API + Gemini) for NurimAI's Telegram bot.
function fakeState(){const map=new Map();const storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{map.set(k,structuredClone(v));},delete:async k=>{map.delete(k);},transaction:async fn=>fn(storage)};return {storage,map};}
function fakeNet(answer='Javob: **12**'){
 const calls=[];
 const fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;calls.push({url:String(url),body});
  if(String(url).includes('generativelanguage'))return Response.json({candidates:[{content:{parts:[{text:typeof answer==='function'?answer(body):answer}]},finishReason:'STOP'}]});
  if(String(url).includes('/file/bot'))return new Response(new Uint8Array([79,103,103,83,1,2,3]));
  const method=String(url).split('/').pop();
  if(method==='getFile')return Response.json({ok:true,result:{file_path:'voice/file_1.oga',file_size:7}});
  return Response.json({ok:true,result:method==='getMe'?{username:'NurimAI_test_bot'}:{message_id:1}});};
 return {calls,fetch,sent:()=>calls.filter(c=>/sendMessage|sendPhoto/.test(c.url)).map(c=>c.body),gemini:()=>calls.filter(c=>c.url.includes('generativelanguage')).map(c=>c.body)};
}
const env={TELEGRAM_TOKEN:'123:TEST',RATE_SALT:'salt',GEMINI_API_KEY:'g',GEMINI_FREE_TIER:'true'};
const msg=(id,text,extra={})=>({update_id:id,message:{message_id:id,chat:{id:42,type:'private'},from:{id:7,is_bot:false},text,...extra}});

test('answers become safe Telegram HTML: bold, code, lists, headings, dividers and plain-text math',async()=>{
 const {toTelegramHtml}=await import('../server/telegram.mjs');
 assert.equal(toTelegramHtml('## Kasrlar\n**Javob:** $\\frac{1}{2}$ <script>\n- bir\n---\n`a<b`'),'<b>Kasrlar</b>\n<b>Javob:</b> 1/2 &lt;script&gt;\n• bir\n──────────\n<code>a&lt;b</code>');
 assert.equal(toTelegramHtml('```\nif (a < b) {}\n```'),'<pre>if (a &lt; b) {}</pre>');
});
test('long answers are split under the Telegram limit and code blocks stay closed',async()=>{
 const {splitAnswer}=await import('../server/telegram.mjs');
 const text=['Kirish','```',...Array.from({length:300},(_,i)=>`line ${i} ${'x'.repeat(20)}`),'```','Oxiri'].join('\n');
 const parts=splitAnswer(text,2000);assert.ok(parts.length>2);
 for(const p of parts){assert.ok(p.length<=2010,`part ${p.length}`);assert.equal((p.match(/```/g)||[]).length%2,0);}
 assert.deepEqual(splitAnswer('Qisqa javob'),['Qisqa javob']);
});
test('updates are read by kind: text, commands, photo, voice, PDF, unsupported, bots and buttons',async()=>{
 const {parseUpdate}=await import('../server/telegram.mjs');
 assert.equal(parseUpdate(msg(1,'Salom')).kind,'text');
 assert.deepEqual([parseUpdate(msg(2,'/start@NurimAI_bot')).kind,parseUpdate(msg(2,'/start@NurimAI_bot')).command],['command','start']);
 const photo=parseUpdate(msg(3,undefined,{text:undefined,caption:'yech',photo:[{file_id:'s',width:90,height:90},{file_id:'b',width:1280,height:960,file_size:300000},{file_id:'h',width:4000,height:3000,file_size:9e6}]}));
 assert.deepEqual([photo.kind,photo.fileId,photo.caption],['photo','b','yech']);
 assert.equal(parseUpdate(msg(4,undefined,{text:undefined,voice:{file_id:'v',duration:80}})).kind,'too-long');
 assert.equal(parseUpdate(msg(5,undefined,{text:undefined,voice:{file_id:'v',duration:5,mime_type:'audio/ogg'}})).mime,'audio/ogg');
 assert.equal(parseUpdate(msg(6,undefined,{text:undefined,document:{file_id:'d',mime_type:'application/pdf',file_size:1000,file_name:'a.pdf'}})).kind,'pdf');
 assert.equal(parseUpdate(msg(7,undefined,{text:undefined,document:{file_id:'d',mime_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}})).kind,'unsupported');
 assert.equal(parseUpdate({update_id:8,message:{chat:{id:1,type:'private'},from:{id:2,is_bot:true},text:'x'}}),null);
 assert.equal(parseUpdate({update_id:9,callback_query:{id:'c',data:'new',from:{id:7},message:{chat:{id:42}}}}).kind,'callback');
});
test('the webhook needs the bot token and Telegram\'s secret header, then hands the update over at once',async()=>{
 const {default:worker}=await import('../server/worker.mjs');const {webhookSecret}=await import('../server/telegram.mjs');
 let handed=null;const budget={idFromName:()=> 'id',get:()=>({fetch:async r=>{handed=await r.json();return Response.json({ok:true});}})};
 const post=headers=>new Request('https://api.test/telegram',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(msg(1,'Salom'))});
 assert.equal((await worker.fetch(post({}),{RATE_SALT:'s',BUDGET:budget})).status,503);
 assert.equal((await worker.fetch(post({'X-Telegram-Bot-Api-Secret-Token':'wrong'}),{...env,BUDGET:budget})).status,403);assert.equal(handed,null);
 const waits=[];const ok=await worker.fetch(post({'X-Telegram-Bot-Api-Secret-Token':await webhookSecret(env.TELEGRAM_TOKEN)}),{...env,BUDGET:budget},{waitUntil:p=>waits.push(p)});
 assert.equal(ok.status,200);await Promise.all(waits);assert.equal(handed.update.message.text,'Salom');
 assert.equal((await worker.fetch(new Request('https://api.test/telegram',{method:'GET'}),{...env,BUDGET:budget})).status,404);
});
test('setup points the bot at this worker with the derived secret, commands and description',async()=>{
 const {default:worker}=await import('../server/worker.mjs');const {webhookSecret}=await import('../server/telegram.mjs');
 const net=fakeNet();const real=globalThis.fetch;globalThis.fetch=net.fetch;
 try{const res=await worker.fetch(new Request('https://api.test/telegram/setup'),{...env,BUDGET:{}});const data=await res.json();
  assert.deepEqual(data,{ok:true,bot:'@NurimAI_test_bot',webhook:'https://api.test/telegram'});
  const hook=net.calls.find(c=>c.url.endsWith('/setWebhook')).body;assert.equal(hook.url,'https://api.test/telegram');assert.equal(hook.secret_token,await webhookSecret(env.TELEGRAM_TOKEN));
  assert.ok(net.calls.some(c=>c.url.endsWith('/setMyCommands')));assert.ok(net.calls.every(c=>!JSON.stringify(c.body||{}).includes(env.TELEGRAM_TOKEN)));
 }finally{globalThis.fetch=real;}
});
test('a question gets an HTML answer with buttons, the chat is remembered, repeats are ignored and /yangi forgets',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {parseUpdate}=await import('../server/telegram.mjs');
 const net=fakeNet();const real=globalThis.fetch;globalThis.fetch=net.fetch;const {storage}=fakeState();
 try{
  const gw=new AiGateway({storage},env);const ask=async u=>{const item=parseUpdate(u);if(await gw.firstDelivery(item))await gw.telegram(item);};
  await ask(msg(10,'Kasr nima?'));
  const answer=net.sent().at(-1);assert.equal(answer.chat_id,42);assert.equal(answer.parse_mode,'HTML');assert.equal(answer.text,'Javob: <b>12</b>');assert.equal(answer.reply_markup.inline_keyboard[0][0].callback_data,'new');
  await ask(msg(10,'Kasr nima?'));assert.equal(net.gemini().length,1); // Telegram's retry of the same update is not answered twice
  await ask(msg(11,'Misol ber'));const second=net.gemini().at(-1);assert.equal(second.contents.length,3);assert.equal(second.contents[0].parts.at(-1).text,'Kasr nima?');
  await ask(msg(12,'/yangi'));assert.match(net.sent().at(-1).text,/Yangi suhbat/);
  await ask(msg(13,'Yana savol'));assert.equal(net.gemini().at(-1).contents.length,1);
  await ask(msg(14,'/start'));assert.equal(net.calls.at(-1).url.split('/').pop(),'sendPhoto');
 }finally{globalThis.fetch=real;}
});
test('a voice message is downloaded, sent to Gemini as audio, and the heard question leads the answer',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {parseUpdate}=await import('../server/telegram.mjs');
 const net=fakeNet('Savolingiz: «Fotosintez nima?»\nO‘simliklar quyosh nuridan ozuqa hosil qiladi.');const real=globalThis.fetch;globalThis.fetch=net.fetch;const {storage,map}=fakeState();
 try{
  const gw=new AiGateway({storage},env);const item=parseUpdate(msg(20,undefined,{text:undefined,voice:{file_id:'v1',duration:4,mime_type:'audio/ogg',file_size:7}}));
  await gw.firstDelivery(item);await gw.telegram(item);
  const parts=net.gemini()[0].contents[0].parts;assert.equal(parts[0].inlineData.mimeType,'audio/ogg');assert.equal(parts[0].inlineData.data,Buffer.from([79,103,103,83,1,2,3]).toString('base64'));
  assert.equal(net.sent().at(-1).text,'<i>🎤 Fotosintez nima?</i>\n\nO‘simliklar quyosh nuridan ozuqa hosil qiladi.');
  assert.equal(map.get('tg:chat:42').history[0].text,'🎤 Fotosintez nima?');
  assert.ok(net.calls.every(c=>!c.url.includes('/file/bot')||c.url.includes('voice/file_1.oga')));
 }finally{globalThis.fetch=real;}
});
test('each Telegram user has a daily limit; groups and unsupported files get a short note, not an AI call',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {parseUpdate}=await import('../server/telegram.mjs');
 const net=fakeNet();const real=globalThis.fetch;globalThis.fetch=net.fetch;const {storage}=fakeState();
 try{
  const gw=new AiGateway({storage},{...env,TG_DAILY_USER:'2'});const ask=async u=>{const item=parseUpdate(u);if(await gw.firstDelivery(item))await gw.telegram(item);};
  await ask(msg(30,'1'));await ask(msg(31,'2'));await ask(msg(32,'3'));
  assert.equal(net.gemini().length,2);assert.match(net.sent().at(-1).text,/bepul savollar tugadi/);
  await ask({update_id:33,message:{chat:{id:99,type:'group'},from:{id:8},text:'Salom'}});assert.equal(net.gemini().length,2);
  await ask(msg(34,undefined,{text:undefined,sticker:{file_id:'s'}}));assert.match(net.sent().at(-1).text,/matn, rasm, PDF va ovozli xabarni/);
  net.calls.length=0;const failing=new AiGateway({storage:fakeState().storage},env);globalThis.fetch=async(url,o)=>String(url).includes('generativelanguage')?Response.json({error:{message:'boom'}},{status:500}):net.fetch(url,o);
  const item=parseUpdate(msg(35,'Savol'));await failing.firstDelivery(item);await failing.telegram(item);assert.match(net.sent().at(-1).text,/javob bera olmadim/);
 }finally{globalThis.fetch=real;}
});
