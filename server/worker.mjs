import routerModule from '../src/router.cjs';
import { TelegramBot, webhookSecret, parseUpdate, questionFor, splitHeard, toTelegramHtml, splitAnswer, escape, sourcesHtml, keyboardFor, TEXTS, SITE } from './telegram.mjs';
const { Router, UserError, speak, SPEECH, withSources, URLS } = routerModule;
const json = (data,status=200,extra={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const MEDIA = { image: new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']), pdf: new Set(['application/pdf']), audio: new Set(['audio/wav']) };
// Optional attachments (absent in 0.3.0 clients): extracted document text, or base64 images/PDFs/voice recordings (0.6.1+) for Gemini.
function validateFiles(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 5) throw new Error('files');
  let data = 0, text = 0;
  const files = list.map(f => {
    if (!f || typeof f.name !== 'string' || !f.name || f.name.length > 200) throw new Error('files');
    if (f.kind === 'text') { if (typeof f.text !== 'string' || !f.text.trim() || f.text.length > 60000) throw new Error('files'); text += f.text.length; return { kind: 'text', name: f.name, text: f.text }; }
    if (!Object.hasOwn(MEDIA, f.kind) || !MEDIA[f.kind].has(f.mime) || typeof f.data !== 'string' || !f.data || f.data.length > (f.kind === 'audio' ? 6 : 10) * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(f.data)) throw new Error('files');
    data += f.data.length; return { kind: f.kind, name: f.name, mime: f.mime, data: f.data };
  });
  if (data > 12.5 * 1024 * 1024 || text > 120000) throw new Error('files');
  return files;
}
export function validatePayload(data) {
  if(!data || typeof data.question!=='string'||!data.question.trim()||data.question.length>6000)throw new Error('question');
  if(typeof data.deviceId!=='string'||!/^[a-f0-9-]{36}$/i.test(data.deviceId))throw new Error('device');
  if(!Array.isArray(data.history)||data.history.length>12||data.history.length%2)throw new Error('history');
  let count=0;for(let i=0;i<data.history.length;i++){const m=data.history[i];if(!m||m.role!==(i%2?'assistant':'user')||typeof m.text!=='string')throw new Error('history');count+=m.text.length;}
  if(count>12000)throw new Error('history');
  return {question:data.question.trim(),deviceId:data.deviceId,history:data.history.map(m=>({role:m.role,text:m.text})),files:validateFiles(data.files)};
}
export function validateSpeech(data) {
  if(!data||typeof data.text!=='string'||!data.text.trim()||data.text.length>SPEECH.maxChars)throw new Error('text');
  if(typeof data.deviceId!=='string'||!/^[a-f0-9-]{36}$/i.test(data.deviceId))throw new Error('device');
  return {text:data.text.trim(),deviceId:data.deviceId};
}
export function budget(previous, now, ip, device, limits) {
  const day=Math.floor(now/86400000);const minute=Math.floor(now/60000);
  const data=previous?.day===day?structuredClone(previous):{day,total:0,ips:{},devices:{}};
  const row=data.ips[ip]||{count:0,minute,hits:0};if(row.minute!==minute){row.minute=minute;row.hits=0;}
  if(data.total>=limits.total||row.count>=limits.ip||(data.devices[device]||0)>=limits.device)return {allowed:false,retry:Math.ceil(((day+1)*86400000-now)/1000)};
  if(row.hits>=(limits.minute||4))return {allowed:false,retry:60};
  row.count++;row.hits++;data.ips[ip]=row;data.devices[device]=(data.devices[device]||0)+1;data.total++;return {allowed:true,data};
}
// Logs only upstream status and the provider's own error text (never the question, history or keys); visible via `wrangler tail`.
async function upstream(url,options){
  const host=new URL(url).hostname;
  try{
    const response=await fetch(url,options);
    if(!response.ok){let detail='';try{const e=(await response.clone().json())?.error;detail=`${e?.status||e?.code||e?.type||''} ${String(e?.message||'').slice(0,200)}`;}catch{}console.log(`upstream ${host} ${response.status} ${detail}`.trim());}
    return response;
  }catch(error){console.log(`upstream ${host} failed: ${error?.name||'Error'} ${String(error?.message||'').slice(0,200)}`);throw error;}
}
// Cloudflare Workers AI through the AI binding: no key, and Workers Free gives 10,000 neurons a day (a few hundred answers).
// The answer is wrapped as an API response, so the router treats it like any other route (429 when the day's allowance is used).
async function workersAi(env,options){
  const {model,stream,...input}=JSON.parse(options.body);
  try{
    options.signal?.throwIfAborted();
    const out=await Promise.race([env.AI.run(model,input),new Promise((_,reject)=>options.signal?.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))]);
    return json(out?.choices?out:{model,choices:[{message:{content:String(out?.response??'')},finish_reason:'stop'}]});
  }catch(error){
    if(options.signal?.aborted)throw error;
    const message=String(error?.message||error).slice(0,200);console.log(`upstream workers-ai failed: ${message}`);
    return json({error:{message}},/neuron|allocation|limit|quota|4006|429/i.test(message)?429:503);
  }
}
async function hash(text){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');}
class TooLarge extends Error {}
async function readBounded(request,limit){const reader=request.body?.getReader();if(!reader)throw new Error();const parts=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new TooLarge();}parts.push(value);}const bytes=new Uint8Array(size);let pos=0;for(const p of parts){bytes.set(p,pos);pos+=p.length;}return JSON.parse(new TextDecoder().decode(bytes));}
// Browsers may call the API only from NurimAI's own phone app: the web app on GitHub Pages and the Android app (Capacitor serves it from https://localhost).
const WEB_ORIGINS=['https://ux7umid7.github.io','https://localhost','capacitor://localhost'];
export function allowedOrigin(origin,env={}){const extra=String(env.WEB_ORIGINS||'').split(',').map(o=>o.trim()).filter(Boolean);return Boolean(origin)&&[...WEB_ORIGINS,...extra].includes(origin);}
function cors(origin){return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Expose-Headers':'Retry-After','Access-Control-Max-Age':'86400','Vary':'Origin'};}
export default {async fetch(request,env,ctx){
  const origin=request.headers.get('Origin');
  if(origin&&!allowedOrigin(origin,env))return json({error:'Desktop API only'},403);
  if(request.method==='OPTIONS')return origin?new Response(null,{status:204,headers:cors(origin)}):json({error:'Not found'},404);
  const response=await handle(request,env,ctx);
  if(!origin)return response;
  const headers=new Headers(response.headers);for(const [k,v] of Object.entries(cors(origin)))headers.set(k,v);
  return new Response(response.body,{status:response.status,headers});
}};
async function handle(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health'){const fallback=Boolean(env.AI&&env.WORKERS_AI_FREE==='true');return json({service:'NurimAI',ready:Boolean(env.RATE_SALT&&((env.GEMINI_API_KEY&&env.GEMINI_FREE_TIER==='true')||(env.GROQ_API_KEY&&env.GROQ_FREE_TIER==='true')||fallback)),telegram:Boolean(env.TELEGRAM_TOKEN),fallback});}
  if(url.pathname==='/telegram'||url.pathname==='/telegram/setup')return telegramRoute(request,env,ctx,url);
  if(request.method!=='POST'||!['/chat','/speak'].includes(url.pathname))return json({error:'Not found'},404);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  if(!env.RATE_SALT||!env.BUDGET)return json({error:'Service not configured'},503);
  const speech=url.pathname==='/speak';
  let data;try{const body=await readBounded(request,speech?16*1024:14*1024*1024);data=speech?validateSpeech(body):validatePayload(body);}catch(error){return error instanceof TooLarge?json({error:'Request too large'},413):json({error:'Invalid request'},400);}
  const ip=request.headers.get('CF-Connecting-IP');if(!ip)return json({error:'Client unavailable'},403);
  const day=Math.floor(Date.now()/86400000);
  const identities={ip:await hash(`${env.RATE_SALT}:${day}:${ip}`),device:await hash(`${env.RATE_SALT}:${day}:${data.deviceId}`)};
  try{return await env.BUDGET.get(env.BUDGET.idFromName('global')).fetch(new Request(speech?'https://internal/speak':'https://internal/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,identities})}));}catch{return json({error:'Service unavailable'},503);}
}
// Telegram bot: GET /telegram/setup points the bot (TELEGRAM_TOKEN secret) at this worker; POST /telegram receives its updates.
// The webhook answers Telegram at once; the Durable Object replies in the chat when the answer is ready.
async function telegramRoute(request,env,ctx,url){
  if(!env.TELEGRAM_TOKEN||!env.BUDGET||!env.RATE_SALT)return json({error:'Bot not configured'},503);
  const secret=await webhookSecret(env.TELEGRAM_TOKEN);
  if(url.pathname==='/telegram/setup')return request.method==='GET'?setupBot(env,url,secret):json({error:'Not found'},404);
  if(request.method!=='POST')return json({error:'Not found'},404);
  if(request.headers.get('X-Telegram-Bot-Api-Secret-Token')!==secret)return json({error:'Forbidden'},403);
  let update;try{update=await readBounded(request,256*1024);}catch{return json({ok:true});} // a malformed update is dropped, not retried
  const work=env.BUDGET.get(env.BUDGET.idFromName('global')).fetch(new Request('https://internal/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({update})})).catch(error=>console.log(`telegram hand-off failed: ${error?.name||'Error'}`));
  if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
  return json({ok:true});
}
async function setupBot(env,url,secret){
  const bot=new TelegramBot(env.TELEGRAM_TOKEN,upstream);
  try{
    const me=await bot.call('getMe');const hook=`${url.origin}/telegram`;
    await bot.call('setWebhook',{url:hook,secret_token:secret,allowed_updates:['message','callback_query'],max_connections:10});
    await bot.call('setMyCommands',{commands:[{command:'start',description:'Boshlash'},{command:'yangiliklar',description:'Bugungi yangiliklar'},{command:'yangi',description:'Yangi suhbat'},{command:'yordam',description:'Nima qila olaman'}]});
    await bot.call('setMyDescription',{description:TEXTS.description});await bot.call('setMyShortDescription',{short_description:TEXTS.short});
    return json({ok:true,bot:`@${me.username}`,webhook:hook});
  }catch(error){console.log(`telegram setup failed: ${error?.message||'Error'}`);return json({ok:false,error:'Telegram rejected the setup: check the TELEGRAM_TOKEN secret.'},502);}
}
export class AiGateway {
  constructor(state,env){this.state=state;this.env=env;this.router=new Router({fetcher:(url,options)=>url===URLS.Cloudflare?workersAi(env,options):upstream(url,options)});this.active=0;}
  async fetch(request){
    if(new URL(request.url).pathname==='/telegram'){
      const {update}=await request.json();const item=parseUpdate(update);
      if(item&&this.env.TELEGRAM_TOKEN&&await this.firstDelivery(item)){const work=this.telegram(item);this.state.waitUntil?.(work);} // the reply goes on after this returns
      return json({ok:true});
    }
    if(this.active>=4)return json({error:'Busy'},429,{'Retry-After':'20'});
    const {data,identities}=await request.json();
    if(new URL(request.url).pathname==='/speak')return this.speech(data,identities);
    const limits={total:Math.min(1000,Math.max(1,Number(this.env.DAILY_TOTAL)||200)),ip:Math.min(100,Math.max(1,Number(this.env.DAILY_IP)||60)),device:Math.min(100,Math.max(1,Number(this.env.DAILY_DEVICE)||30))};
    const result=await this.state.storage.transaction(async tx=>{const next=budget(await tx.get('budget'),Date.now(),identities.ip,identities.device,limits);if(next.allowed)await tx.put('budget',next.data);return next;});
    if(!result.allowed)return json({error:'Free limit reached'},429,{'Retry-After':String(result.retry)});
    const settings={keys:{Gemini:this.env.GEMINI_API_KEY||'',Groq:this.env.GROQ_API_KEY||'',OpenRouter:''},free:{Gemini:this.env.GEMINI_FREE_TIER==='true',Groq:this.env.GROQ_FREE_TIER==='true'},autoFallback:true};
    this.active++;
    try{
      const reply=await this.router.ask(settings,data.history,data.question,AbortSignal.timeout(85000),data.files);
      return json({text:withSources(reply),incomplete:reply.incomplete}); // news answers carry their sources
    }catch(error){console.log(`chat failed: ${error instanceof UserError?error.message:error?.name||'Error'}; routes: ${this.router.diagnostics(settings).map(r=>`${r.provider}=${r.status}`).join(', ')}`);const rejected=error instanceof UserError&&error.code==='input';return json({error:rejected?'Input rejected':error instanceof UserError?'AI temporarily unavailable':'Service unavailable'},rejected?422:503);}finally{this.active--;}
  }
  // Gemini, then Groq, then OpenRouter's free models (if its key is set), then Workers AI.
  settings(){return {keys:{Gemini:this.env.GEMINI_API_KEY||'',Groq:this.env.GROQ_API_KEY||'',OpenRouter:this.env.OPENROUTER_API_KEY||'',Cloudflare:this.env.AI?'binding':''},free:{Gemini:this.env.GEMINI_FREE_TIER==='true',Groq:this.env.GROQ_FREE_TIER==='true',Cloudflare:this.env.WORKERS_AI_FREE==='true'},autoFallback:true};}
  // Telegram resends an update it thinks failed: each one is answered once (per chat, update ids only grow).
  async firstDelivery(item){return this.state.storage.transaction(async tx=>{const key=`tg:seen:${item.chatId}`;if((await tx.get(key)||0)>=item.updateId)return false;await tx.put(key,item.updateId);return true;});}
  // One Telegram message -> one answer in the chat. The bot has its own daily budget (per Telegram user and in total) and
  // remembers the last few turns of each chat for three days; nothing else about the user is stored.
  async telegram(item){
    if(item.kind==='command'&&item.command==='yangiliklar')item={...item,kind:'news'}; // answered by the AI with Google Search
    const bot=new TelegramBot(this.env.TELEGRAM_TOKEN,upstream),store=this.state.storage,chatKey=`tg:chat:${item.chatId}`;
    try{
      if(item.kind==='callback'){await bot.call('answerCallbackQuery',{callback_query_id:item.id}).catch(()=>{});if(item.data==='new'){await store.delete(chatKey);await bot.send(item.chatId,TEXTS.fresh);}return;}
      if(!item.private){if(item.kind==='command')await bot.send(item.chatId,TEXTS.group);return;}
      if(item.kind==='command'){
        if(item.command==='start'){await store.delete(chatKey);await bot.call('sendPhoto',{chat_id:item.chatId,photo:`${SITE}bot/hello.jpg`,caption:TEXTS.hello,parse_mode:'HTML'}).catch(()=>bot.send(item.chatId,TEXTS.hello));}
        else if(item.command==='yangi'){await store.delete(chatKey);await bot.send(item.chatId,TEXTS.fresh);}
        else await bot.send(item.chatId,TEXTS.help);
        return;
      }
      if(['unsupported','too-big','too-long'].includes(item.kind)){await bot.send(item.chatId,item.kind==='too-big'?TEXTS.big:item.kind==='too-long'?TEXTS.long:TEXTS.unsupported);return;}
      const day=Math.floor(Date.now()/86400000),who=await hash(`${this.env.RATE_SALT}:${day}:tg:${item.userId}`);
      const user=Math.min(200,Math.max(1,Number(this.env.TG_DAILY_USER)||20)),limits={total:Math.min(3000,Math.max(1,Number(this.env.TG_DAILY_TOTAL)||300)),ip:user,device:user,minute:4};
      const allowed=await store.transaction(async tx=>{const next=budget(await tx.get('telegram'),Date.now(),who,who,limits);if(next.allowed)await tx.put('telegram',next.data);return next;});
      if(!allowed.allowed){await bot.send(item.chatId,allowed.retry===60?TEXTS.slow:TEXTS.limit);return;}
      if(this.active>=4){await bot.send(item.chatId,TEXTS.busy);return;}
      await bot.call('sendChatAction',{chat_id:item.chatId,action:'typing'}).catch(()=>{});
      const {question,remember}=questionFor(item);
      const files=[];if(item.fileId){const file=await bot.download(item.fileId);files.push({kind:item.kind==='voice'?'audio':item.kind==='pdf'?'pdf':'image',name:item.kind==='voice'?'Ovozli xabar':item.kind==='sticker'?'stiker':item.name||'rasm.jpg',mime:file.mime&&file.mime.split('/')[0]===item.mime.split('/')[0]?file.mime:item.mime,data:file.data});}
      const saved=await store.get(chatKey);const history=saved&&Date.now()-saved.updated<3*86400000?saved.history:[];
      let reply;this.active++;try{reply=await this.router.ask(this.settings(),history,question,AbortSignal.timeout(85000),files,{search:item.kind==='news'?'Bugungi yangiliklar':item.kind==='text'?undefined:false});}finally{this.active--;}
      const {heard,text}=item.kind==='voice'?splitHeard(reply.text):{heard:'',text:reply.text};
      await store.put(chatKey,{updated:Date.now(),history:[...history,{role:'user',text:(heard?`🎤 ${heard}`:remember).slice(0,1000)},{role:'assistant',text:text.slice(0,2000)}].slice(-8)});
      const parts=splitAnswer(text);
      for(const [i,part] of parts.entries()){const last=i===parts.length-1;await bot.send(item.chatId,(i===0&&heard?`<i>🎤 ${escape(heard)}</i>\n\n`:'')+toTelegramHtml(part)+(last?sourcesHtml(reply):''),last?{reply_markup:keyboardFor(reply)}:{});}
    }catch(error){
      console.log(`telegram failed: ${error?.code==='big'?'file too big':error instanceof UserError?error.message:error?.name||'Error'}`);
      await bot.send(item.chatId,error?.code==='big'?TEXTS.big:error instanceof UserError&&error.code==='input'?TEXTS.rejected:TEXTS.failed).catch(()=>{});
    }
  }
  // Voice answers have their own daily budget, so listening never eats the chat limit.
  async speech(data,identities){
    if(!this.env.GEMINI_API_KEY||this.env.GEMINI_FREE_TIER!=='true')return json({error:'Speech not configured'},503);
    const limits={total:Math.min(2000,Math.max(1,Number(this.env.SPEAK_TOTAL)||400)),ip:Math.min(200,Math.max(1,Number(this.env.SPEAK_IP)||80)),device:Math.min(200,Math.max(1,Number(this.env.SPEAK_DEVICE)||40)),minute:10};
    const result=await this.state.storage.transaction(async tx=>{const next=budget(await tx.get('speech'),Date.now(),identities.ip,identities.device,limits);if(next.allowed)await tx.put('speech',next.data);return next;});
    if(!result.allowed)return json({error:'Free limit reached'},429,{'Retry-After':String(result.retry)});
    this.active++;
    try{const audio=await speak({key:this.env.GEMINI_API_KEY,text:data.text,signal:AbortSignal.timeout(60000),fetcher:upstream});return json({mime:audio.mime,audio:audio.data});}
    catch(error){console.log(`speech failed: ${error instanceof UserError?error.message:error?.name||'Error'}`);return json({error:error?.code==='limit'?'Free limit reached':'Speech unavailable'},error?.code==='limit'?429:503);}finally{this.active--;}
  }
}
