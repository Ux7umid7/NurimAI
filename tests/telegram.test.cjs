const test=require('node:test');const assert=require('node:assert/strict');
// Fake Durable Object storage and a fake network (Telegram Bot API + Gemini) for NurimAI's Telegram bot.
function fakeState(){const map=new Map();const storage={get:async k=>Array.isArray(k)?new Map(k.filter(x=>map.has(x)).map(x=>[x,structuredClone(map.get(x))])):structuredClone(map.get(k)),put:async(k,v)=>{map.set(k,structuredClone(v));},delete:async k=>{map.delete(k);},transaction:async fn=>fn(storage)};return {storage,map};}
// News sites: Gazeta.uz has one story, the rest are down.
const GAZETA='<rss><channel><item><title>Toshkentdagi Elbek bog‘i yangilanadi</title><link>https://www.gazeta.uz/oz/park/?a=1&amp;b="2"</link><description>Bog‘ to‘liq yangilanadi</description><pubDate>Sun, 25 Oct 2026 04:41:00 GMT</pubDate></item></channel></rss>';
function fakeNet(answer='Javob: **12**'){
 const calls=[];
 const fetch=async(url,options={})=>{const body=options.body instanceof FormData?Object.fromEntries(options.body):options.body?JSON.parse(options.body):null;calls.push({url:String(url),body});
  if(String(url).includes('generativelanguage'))return Response.json({candidates:[{content:{parts:[{text:typeof answer==='function'?answer(body):answer}]},finishReason:'STOP'}]});
  if(!String(url).includes('api.telegram.org'))return String(url).includes('gazeta.uz')?new Response(GAZETA):new Response('down',{status:503});
  if(String(url).includes('/file/bot'))return new Response(new Uint8Array([79,103,103,83,1,2,3]));
  const method=String(url).split('/').pop();
  if(method==='getFile')return Response.json({ok:true,result:{file_path:String(body?.file_id).startsWith('st')?'stickers/file_2.webp':'voice/file_1.oga',file_size:7}});
  return Response.json({ok:true,result:method==='getMe'?{username:'NurimAI_test_bot'}:{message_id:1}});};
 return {calls,fetch,sites:()=>calls.filter(c=>!/api\.telegram\.org|generativelanguage/.test(c.url)).map(c=>c.url),sent:()=>calls.filter(c=>/sendMessage|sendPhoto/.test(c.url)).map(c=>c.body),gemini:()=>calls.filter(c=>c.url.includes('generativelanguage')).map(c=>c.body)};
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
  assert.deepEqual(hook.allowed_updates,['message','callback_query','my_chat_member']); // the bot learns when it is added to a group
  const scopes=net.calls.filter(c=>c.url.endsWith('/setMyCommands')).map(c=>c.body.scope?.type||'default');assert.deepEqual(scopes,['default','all_group_chats','all_chat_administrators']);
  assert.ok(net.calls.find(c=>c.body?.scope?.type==='all_chat_administrators').body.commands.some(c=>c.command==='mavzu'));
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
  await ask(msg(34,undefined,{text:undefined,video:{file_id:'v'}}));assert.match(net.sent().at(-1).text,/matn, rasm, stiker, PDF va ovozli xabarni/);
  net.calls.length=0;const failing=new AiGateway({storage:fakeState().storage},env);globalThis.fetch=async(url,o)=>String(url).includes('generativelanguage')?Response.json({error:{message:'boom'}},{status:500}):net.fetch(url,o);
  const item=parseUpdate(msg(35,'Savol'));await failing.firstDelivery(item);await failing.telegram(item);assert.match(net.sent().at(-1).text,/javob bera olmadim/);
 }finally{globalThis.fetch=real;}
});
test('a sticker is read as a picture: still ones directly, animated and video ones by their thumbnail',async()=>{
 const {parseUpdate}=await import('../server/telegram.mjs');const st=extra=>parseUpdate(msg(40,undefined,{text:undefined,sticker:{file_id:'still',emoji:'😂',...extra}}));
 assert.deepEqual((({kind,fileId,mime,emoji})=>({kind,fileId,mime,emoji}))(st()),{kind:'sticker',fileId:'still',mime:'image/webp',emoji:'😂'});
 assert.deepEqual([st({is_animated:true,thumbnail:{file_id:'th'}}).fileId,st({is_video:true,thumbnail:{file_id:'th'}}).mime],['th','image/jpeg']);
 assert.equal(st({is_animated:true}).fileId,'');
});
test('the bot looks at a sticker, answers it briefly and remembers it',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {parseUpdate}=await import('../server/telegram.mjs');
 const net=fakeNet('Hazilingiz zo‘r! 😄');const real=globalThis.fetch;globalThis.fetch=net.fetch;const {storage,map}=fakeState();
 try{
  const gw=new AiGateway({storage},env);const item=parseUpdate(msg(41,undefined,{text:undefined,sticker:{file_id:'st1',emoji:'😂'}}));await gw.firstDelivery(item);await gw.telegram(item);
  const sent=net.gemini()[0];const parts=sent.contents[0].parts;assert.equal(parts[0].inlineData.mimeType,'image/webp');assert.match(parts[1].text,/😂 emojili stiker/);assert.equal('tools' in sent,false);
  assert.equal(net.sent().at(-1).text,'Hazilingiz zo‘r! 😄');assert.equal(map.get('tg:chat:42').history[0].text,'🎭 Stiker 😂');
  const bare=parseUpdate(msg(42,undefined,{text:undefined,sticker:{file_id:'x',is_animated:true,emoji:'👍'}}));await gw.firstDelivery(bare);await gw.telegram(bare);
  assert.equal(net.gemini()[1].contents.at(-1).parts.length,1);assert.match(net.gemini()[1].contents.at(-1).parts[0].text,/faqat emoji/);
 }finally{globalThis.fetch=real;}
});
test('/yangiliklar and news questions read the news sites; the answer links its sources',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {parseUpdate,NEWS_QUESTION}=await import('../server/telegram.mjs');
 const net=fakeNet('**Yangiliklar:** bugun …');const real=globalThis.fetch;globalThis.fetch=net.fetch;const {storage,map}=fakeState();
 try{
  const gw=new AiGateway({storage},env);const ask=async u=>{const item=parseUpdate(u);if(await gw.firstDelivery(item))await gw.telegram(item);};
  await ask(msg(50,'/yangiliklar'));const prompt=net.gemini()[0].contents.at(-1).parts.at(-1).text;
  assert.match(prompt,/^Biriktirilgan fayl: Internetdan olingan ma’lumot \(.+, Toshkent vaqti\)\n"""\nYangiliklar \(Gazeta\.uz\):\n- \[Gazeta\.uz, 25\.10 09:41\] Toshkentdagi Elbek bog‘i yangilanadi/);assert.ok(prompt.endsWith(NEWS_QUESTION));
  const answer=net.sent().at(-1);assert.equal(answer.text,'<b>Yangiliklar:</b> bugun …\n\n<b>🔎 Manbalar:</b> <a href="https://www.gazeta.uz/oz/">Gazeta.uz</a>');assert.equal(answer.reply_markup.inline_keyboard.length,1);
  assert.deepEqual(map.get('tg:chat:42').history.map(m=>m.text),['📰 Bugungi yangiliklar','**Yangiliklar:** bugun …']);
  await ask(msg(51,'Elbek bog‘i haqida yangilik bormi?'));const topic=net.sent().at(-1);
  assert.ok(topic.text.endsWith('<a href="https://www.gazeta.uz/oz/park/?a=1&amp;b=&quot;2&quot;">Gazeta.uz: Toshkentdagi Elbek bog‘i yangilanadi</a>'));
  assert.equal(topic.reply_markup.inline_keyboard[0][0].url,'https://www.google.com/search?q=elbek%20bogi');assert.equal(topic.reply_markup.inline_keyboard[1][0].callback_data,'new');
  net.calls.length=0;await ask(msg(52,'Kasr nima?'));assert.deepEqual(net.sites(),[]);assert.equal(net.sent().at(-1).reply_markup.inline_keyboard.length,1);
  await ask(msg(53,undefined,{text:undefined,caption:'Bugungi yangiliklar',photo:[{file_id:'p',width:800,height:600}]}));assert.deepEqual(net.sites(),[]);
 }finally{globalThis.fetch=real;}
});
test('when Gemini and Groq are used up, Workers AI answers through the binding; its own limit ends in the usual note',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {parseUpdate}=await import('../server/telegram.mjs');
 const net=fakeNet();const real=globalThis.fetch;const runs=[];
 globalThis.fetch=async(url,o)=>/generativelanguage|groq\.com/.test(String(url))?Response.json({error:{message:'quota'}},{status:429}):net.fetch(url,o);
 const ai={run:async(model,input)=>{runs.push({model,input});if(runs.length===2)return {response:'Eski **javob** shakli'};if(runs.length===3)throw new Error('4006: you have used up your daily free allocation of 10,000 neurons');return {model,choices:[{message:{content:'Zaxira **javob**'},finish_reason:'stop'}]};}};
 try{
  const gw=new AiGateway({storage:fakeState().storage},{...env,GROQ_API_KEY:'q',GROQ_FREE_TIER:'true',AI:ai,WORKERS_AI_FREE:'true'});const ask=async u=>{const item=parseUpdate(u);if(await gw.firstDelivery(item))await gw.telegram(item);};
  await ask(msg(60,'Kasr nima?'));assert.equal(net.sent().at(-1).text,'Zaxira <b>javob</b>');
  assert.equal(runs[0].model,'@cf/google/gemma-4-26b-a4b-it');assert.equal('model' in runs[0].input||'stream' in runs[0].input,false);assert.deepEqual(runs[0].input.messages.at(-1),{role:'user',content:'Kasr nima?'});assert.equal(runs[0].input.messages[0].role,'system');
  gw.router.reset('Gemini');gw.router.reset('Groq');await ask(msg(61,'Yana'));assert.equal(net.sent().at(-1).text,'Eski <b>javob</b> shakli');
  gw.router.reset('Gemini');gw.router.reset('Groq');await ask(msg(62,'Yana bir'));assert.match(net.sent().at(-1).text,/javob bera olmadim/);
  const without=new AiGateway({storage:fakeState().storage},{...env,AI:ai});runs.length=0;const item=parseUpdate(msg(63,'Salom'));await without.firstDelivery(item);await without.telegram(item);assert.equal(runs.length,0,'not offered unless WORKERS_AI_FREE is set');
  // The apps' /chat gets the same fallback as the bot.
  runs.length=0;const apps=new AiGateway({storage:fakeState().storage},{...env,GROQ_API_KEY:'q',GROQ_FREE_TIER:'true',AI:ai,WORKERS_AI_FREE:'true',RATE_SALT:'s'});
  const chat=await apps.fetch(new Request('https://internal/chat',{method:'POST',body:JSON.stringify({data:{question:'Salom',history:[],files:[]},identities:{ip:'i',device:'d'}})}));
  assert.equal(chat.status,200);assert.equal((await chat.json()).text,'Zaxira **javob**');assert.equal(runs.length,1);
 }finally{globalThis.fetch=real;}
});
test('/referat and /taqdimot (or asking in words) send a Word or PowerPoint file made from the AI\'s plan',async()=>{
 const {AiGateway}=await import('../server/worker.mjs');const {parseUpdate}=await import('../server/telegram.mjs');
 let garbage=false;const net=fakeNet(body=>{const p=body.contents.at(-1).parts.at(-1).text;if(garbage)return 'Kechirasiz, tushunmadim.';return p.includes('slaydli taqdimot')?'{"mavzu":"Quyosh tizimi","izoh":"8-sinf","slaydlar":[{"sarlavha":"Sayyoralar","bandlar":["Yer"]},{"sarlavha":"Xulosa","bandlar":["Kosmos"]}]}':'{"mavzu":"Fotosintez","bolimlar":[{"sarlavha":"Kirish","matn":["Matn."]},{"sarlavha":"Xulosa","matn":["Yakun."]}],"adabiyotlar":[]}';});
 const real=globalThis.fetch;globalThis.fetch=net.fetch;const {storage,map}=fakeState();
 try{
  const gw=new AiGateway({storage},env);const ask=async u=>{const item=parseUpdate(u);if(await gw.firstDelivery(item))await gw.telegram(item);};
  await ask(msg(80,'/referat'));assert.match(net.sent().at(-1).text,/Mavzuni ham yozing, masalan: \/referat Fotosintez/);assert.equal(net.gemini().length,0);
  await ask(msg(81,'/taqdimot Quyosh tizimi, 6 slayd'));
  assert.match(net.gemini()[0].contents.at(-1).parts.at(-1).text,/«taqdimot tayyorla: Quyosh tizimi, 6 slayd»[\s\S]*6 slaydli taqdimot/);
  assert.ok(net.calls.some(c=>c.url.endsWith('/sendChatAction')&&c.body.action==='upload_document'));
  const doc=net.calls.find(c=>c.url.endsWith('/sendDocument')).body;
  assert.deepEqual([doc.chat_id,doc.document.name,doc.document.type,doc.parse_mode],['42','Taqdimot - Quyosh tizimi.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation','HTML']);
  assert.deepEqual([...new Uint8Array(await doc.document.arrayBuffer()).slice(0,4)],[0x50,0x4b,3,4]);assert.match(doc.caption,/^📊 <b>Taqdimot tayyor:<\/b> Quyosh tizimi\n3 ta slayd/);assert.equal(JSON.parse(doc.reply_markup).inline_keyboard[0][0].callback_data,'new');
  assert.match(map.get('tg:chat:42').history.at(-1).text,/^📊 \*\*Taqdimot tayyor/);
  await ask(msg(82,'Fotosintez haqida referat yozib ber'));assert.equal(net.calls.filter(c=>c.url.endsWith('/sendDocument')).at(-1).body.document.name,'Referat - Fotosintez.docx');
  garbage=true;await ask(msg(83,'Suv haqida referat yoz'));assert.match(net.sent().at(-1).text,/Faylni tayyorlay olmadim/);
 }finally{globalThis.fetch=real;}
});
test('in a group the bot runs the daily question game: the cron tick asks, an answer is judged, nothing else is answered',async()=>{
 const {default:worker,AiGateway}=await import('../server/worker.mjs');const {parseUpdate}=await import('../server/telegram.mjs');
 let handed=null;const cron=[];await worker.scheduled({},{...env,BUDGET:{idFromName:()=> 'id',get:()=>({fetch:async r=>{handed=new URL(r.url).pathname;return Response.json({ok:true});}})}},{waitUntil:p=>cron.push(p)});await Promise.all(cron);assert.equal(handed,'/tick');
 const net=fakeNet(body=>{const prompt=body.contents.at(-1).parts.at(-1).text;return prompt.startsWith('Telegram guruhi')?'{"savol":"HTML’da eng katta sarlavha tegi qaysi?","javob":"h1","qabul":["<h1>"],"izoh":"h1 dan h6 gacha, h1 eng kattasi."}':'{"baho":"notogri"}';});
 const real=globalThis.fetch;globalThis.fetch=net.fetch;const {storage,map}=fakeState();
 try{
  const gw=new AiGateway({storage},env);const ask=async u=>{const item=parseUpdate(u);if(item&&await gw.firstDelivery(item))await gw.telegram(item);};
  const chat={id:-1009,type:'supergroup',title:'Frontend'},admin={message_id:5,chat,from:{id:1087968824,is_bot:true},sender_chat:{id:-1009}};
  await ask({update_id:70,my_chat_member:{chat,from:{id:7},old_chat_member:{status:'left'},new_chat_member:{status:'member'}}});assert.match(net.sent().at(-1).text,/Salom! Men NurimAI/);assert.equal(net.sent().at(-1).chat_id,-1009);
  await ask({update_id:71,message:{...admin,text:'/mavzu JS/HTML'}});
  const t=new Date(Date.now()+5*3600000),now=`${String(t.getUTCHours()).padStart(2,'0')}:${String(t.getUTCMinutes()).padStart(2,'0')}`;
  await ask({update_id:72,message:{...admin,message_id:6,text:`/vaqt ${now}`}});assert.match(net.sent().at(-1).text,new RegExp(`soat <b>${now}</b>`));
  await ask({update_id:73,message:{message_id:7,chat,from:{id:8,first_name:'Ali'},text:'Bugun dars bormi?'}});assert.equal(net.gemini().length,0,'chat without an open question is left alone');
  await gw.fetch(new Request('https://internal/tick',{method:'POST'}));
  assert.equal(net.gemini().length,1);assert.match(net.gemini()[0].contents[0].parts.at(-1).text,/Mavzu: «JS\/HTML»/);assert.match(net.sent().at(-1).text,/Kunlik savol<\/b> · JS\/HTML · 🟡 o‘rtacha\n\nHTML’da eng katta sarlavha tegi qaysi\?\n\n<i>[^<]*7 daqiqadan keyin maslahat beraman, 25 daqiqada/);
  await ask({update_id:74,message:{message_id:8,chat,from:{id:8,first_name:'Ali'},text:'<h1>'}});assert.equal(net.gemini().length,1,'an exact answer is not sent to the AI');
  assert.match(net.sent().at(-1).text,/To‘g‘ri!<\/b> <a href="tg:\/\/user\?id=8">Ali<\/a> birinchi topdi/);assert.deepEqual(map.get('tg:score:-1009'),{8:{name:'Ali',points:1}});
 }finally{globalThis.fetch=real;}
});
