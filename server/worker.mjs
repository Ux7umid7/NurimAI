import routerModule from '../src/router.cjs';
const { Router, UserError } = routerModule;
const json = (data,status=200,extra={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const MEDIA = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
// Optional attachments (absent in 0.3.0 clients): extracted document text, or base64 images/PDFs for Gemini.
function validateFiles(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 5) throw new Error('files');
  let data = 0, text = 0;
  const files = list.map(f => {
    if (!f || typeof f.name !== 'string' || !f.name || f.name.length > 200) throw new Error('files');
    if (f.kind === 'text') { if (typeof f.text !== 'string' || !f.text.trim() || f.text.length > 60000) throw new Error('files'); text += f.text.length; return { kind: 'text', name: f.name, text: f.text }; }
    if (!['image', 'pdf'].includes(f.kind) || !MEDIA.has(f.mime) || (f.kind === 'pdf') !== (f.mime === 'application/pdf') || typeof f.data !== 'string' || !f.data || f.data.length > 10 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(f.data)) throw new Error('files');
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
export function budget(previous, now, ip, device, limits) {
  const day=Math.floor(now/86400000);const minute=Math.floor(now/60000);
  const data=previous?.day===day?structuredClone(previous):{day,total:0,ips:{},devices:{}};
  const row=data.ips[ip]||{count:0,minute,hits:0};if(row.minute!==minute){row.minute=minute;row.hits=0;}
  if(data.total>=limits.total||row.count>=limits.ip||(data.devices[device]||0)>=limits.device)return {allowed:false,retry:Math.ceil(((day+1)*86400000-now)/1000)};
  if(row.hits>=4)return {allowed:false,retry:60};
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
async function hash(text){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');}
class TooLarge extends Error {}
async function readBounded(request,limit){const reader=request.body?.getReader();if(!reader)throw new Error();const parts=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new TooLarge();}parts.push(value);}const bytes=new Uint8Array(size);let pos=0;for(const p of parts){bytes.set(p,pos);pos+=p.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')return json({service:'NurimAI',ready:Boolean(env.RATE_SALT&&((env.GEMINI_API_KEY&&env.GEMINI_FREE_TIER==='true')||(env.GROQ_API_KEY&&env.GROQ_FREE_TIER==='true')))});
  if(request.method!=='POST'||url.pathname!=='/chat')return json({error:'Not found'},404);
  if(request.headers.get('Origin'))return json({error:'Desktop API only'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  if(!env.RATE_SALT||!env.BUDGET)return json({error:'Service not configured'},503);
  let data;try{data=validatePayload(await readBounded(request,14*1024*1024));}catch(error){return error instanceof TooLarge?json({error:'Request too large'},413):json({error:'Invalid request'},400);}
  const ip=request.headers.get('CF-Connecting-IP');if(!ip)return json({error:'Client unavailable'},403);
  const day=Math.floor(Date.now()/86400000);
  const identities={ip:await hash(`${env.RATE_SALT}:${day}:${ip}`),device:await hash(`${env.RATE_SALT}:${day}:${data.deviceId}`)};
  try{return await env.BUDGET.get(env.BUDGET.idFromName('global')).fetch(new Request('https://internal/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,identities})}));}catch{return json({error:'Service unavailable'},503);}
}};
export class AiGateway {
  constructor(state,env){this.state=state;this.env=env;this.router=new Router({fetcher:upstream});this.active=0;}
  async fetch(request){
    if(this.active>=4)return json({error:'Busy'},429,{'Retry-After':'20'});
    const {data,identities}=await request.json();
    const limits={total:Math.min(1000,Math.max(1,Number(this.env.DAILY_TOTAL)||200)),ip:Math.min(100,Math.max(1,Number(this.env.DAILY_IP)||60)),device:Math.min(100,Math.max(1,Number(this.env.DAILY_DEVICE)||30))};
    const result=await this.state.storage.transaction(async tx=>{const next=budget(await tx.get('budget'),Date.now(),identities.ip,identities.device,limits);if(next.allowed)await tx.put('budget',next.data);return next;});
    if(!result.allowed)return json({error:'Free limit reached'},429,{'Retry-After':String(result.retry)});
    const settings={keys:{Gemini:this.env.GEMINI_API_KEY||'',Groq:this.env.GROQ_API_KEY||'',OpenRouter:''},free:{Gemini:this.env.GEMINI_FREE_TIER==='true',Groq:this.env.GROQ_FREE_TIER==='true'},autoFallback:true};
    this.active++;
    try{
      const reply=await this.router.ask(settings,data.history,data.question,AbortSignal.timeout(85000),data.files);
      return json({text:reply.text,incomplete:reply.incomplete});
    }catch(error){console.log(`chat failed: ${error instanceof UserError?error.message:error?.name||'Error'}; routes: ${this.router.diagnostics(settings).map(r=>`${r.provider}=${r.status}`).join(', ')}`);const rejected=error instanceof UserError&&error.code==='input';return json({error:rejected?'Input rejected':error instanceof UserError?'AI temporarily unavailable':'Service unavailable'},rejected?422:503);}finally{this.active--;}
  }
}
