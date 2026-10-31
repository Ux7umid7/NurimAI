const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
// The free GPT-OSS route on Groq, and the user's own paid keys: ChatGPT (Responses API) and Claude (Anthropic SDK), tried first.
const {Router,body,parse,UserError}=require('../src/router.cjs');const {claude,request,reply}=require('../src/claude.cjs');const {Store,defaults}=require('../src/store.cjs');
const Anthropic=require('@anthropic-ai/sdk').default;
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const q={model:'test',choices:[{message:{content:'Bepul'},finish_reason:'stop'}]};
const chatgpt={model:'gpt-6.1-sol',status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',role:'assistant',content:[{type:'output_text',text:'ChatGPT javobi',annotations:[]}]}]};
const message=(text,stop='end_turn')=>({model:'claude-opus-5-5',stop_reason:stop,content:[{type:'thinking',thinking:''},{type:'text',text}]});
const pdf={kind:'pdf',name:'kitob.pdf',mime:'application/pdf',data:'JVBERi0='},image={kind:'image',name:'rasm.png',mime:'image/png',data:'iVBORw=='},audio={kind:'audio',name:'savol.wav',mime:'audio/wav',data:'UklGRg=='};
const settings=(keys={})=>({...defaults(),keys:{...defaults().keys,Groq:'test-groq',...keys},free:{Gemini:true,Groq:true}});
// A stand-in for the SDK client: records each request and answers with the given message (or throws).
function fakeClaude(answer){const seen=[];return {seen,provider:claude({client:key=>({messages:{stream:(params,options)=>{seen.push({key,params,options});return {finalMessage:async()=>{if(answer instanceof Error)throw answer;return answer;}};}}})})};}

test('GPT-OSS runs on the Groq key with low reasoning that is never shown',async()=>{
 const b=body('GPT',[],'Savol');assert.equal(b.model,'openai/gpt-oss-120b');assert.equal(b.reasoning_effort,'low');assert.equal(b.include_reasoning,false);assert.equal('reasoning_format' in b,false);assert.equal(b.max_completion_tokens,3000);assert.equal(body('GPT',[],'Referat',[],true).max_completion_tokens,8000);
 const seen=[];const router=new Router({fetcher:async(url,o)=>{seen.push([url,o.headers.Authorization,JSON.parse(o.body).model]);return response(q);}});
 const answer=await router.ask(settings(),[],'Salom');assert.equal(answer.provider,'GPT');assert.deepEqual(seen,[['https://api.groq.com/openai/v1/chat/completions','Bearer test-groq','openai/gpt-oss-120b']]);
 const off=settings();off.free.Groq=false;await assert.rejects(router.ask(off,[],'Salom'),UserError,'no Groq free tier: no GPT either');
});
test('ChatGPT gets instructions, the turns and media as Responses API input, and its answer is read from the message items',()=>{
 const b=body('ChatGPT',[{role:'user',text:'old'},{role:'assistant',text:'ans'}],'Tushuntir',[pdf,image]);
 assert.equal(b.model,'gpt-6.1-sol');assert.match(b.instructions,/NurimAI/);assert.equal(b.store,false);assert.deepEqual(b.reasoning,{effort:'low'});assert.equal(b.max_output_tokens,16000);
 assert.deepEqual(b.input.slice(0,2),[{role:'user',content:'old'},{role:'assistant',content:'ans'}]);
 assert.deepEqual(b.input[2].content.slice(0,2),[{type:'input_file',filename:'kitob.pdf',file_data:'data:application/pdf;base64,JVBERi0='},{type:'input_image',image_url:'data:image/png;base64,iVBORw=='}]);assert.match(b.input[2].content[2].text,/Biriktirilgan: kitob\.pdf, rasm\.png\n\nTushuntir$/);
 assert.deepEqual(body('ChatGPT',[],'Referat',[],true).reasoning,{effort:'medium'});
 assert.deepEqual([parse('ChatGPT',chatgpt).text,parse('ChatGPT',chatgpt).incomplete,parse('ChatGPT',chatgpt).model],['ChatGPT javobi',false,'gpt-6.1-sol']);
 assert.equal(parse('ChatGPT',{...chatgpt,status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}).incomplete,true);
 assert.equal(parse('ChatGPT',{output:[{type:'message',content:[{type:'refusal',refusal:'Yordam bera olmayman.'}]}]}).text,'Yordam bera olmayman.');
 assert.throws(()=>parse('ChatGPT',{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{type:'reasoning'}]}),'reasoning used it all: no text, next route');
});
test('a paid key answers first; when it is used up or rejects a request, the free routes answer instead of an error',async()=>{
 const seen=[];let paid=response(chatgpt);const router=new Router({fetcher:async(url,o)=>{seen.push(url);if(url.includes('openai.com')){assert.equal(o.headers.Authorization,'Bearer sk-test');return paid;}return response(q);}});
 const s=settings({ChatGPT:'sk-test'});
 assert.equal((await router.ask(s,[],'Salom')).provider,'ChatGPT');assert.equal(seen.length,1);
 paid=response({error:{type:'insufficient_quota'}},429);seen.length=0;assert.equal((await router.ask(s,[],'Salom')).provider,'GPT');assert.deepEqual(router.diagnostics(s).find(d=>d.provider==='ChatGPT').status,'Limit yoki balans tugagan');
 const other=new Router({fetcher:async url=>url.includes('openai.com')?response({error:{message:'bad'}},400):response(q)});assert.equal((await other.ask(s,[],'Salom')).provider,'GPT','a paid 400 is not the user\'s fault');
 assert.deepEqual(router.diagnostics(settings()).map(d=>d.provider),['Gemini','GPT','Groq','OpenRouter'],'paid routes are listed only when their key is set');
});
test('Claude gets the system prompt, the turns and image/PDF blocks through the SDK, with the router\'s signal',async()=>{
 const p=request([{role:'user',text:'old'},{role:'assistant',text:'ans'}],'Tushuntir',[pdf,image]);
 assert.equal(p.model,'claude-opus-5-5');assert.equal(p.max_tokens,16000);assert.deepEqual(p.output_config,{effort:'low'});assert.equal('thinking' in p,false,'Opus 5.5 always thinks adaptively');assert.match(p.system,/NurimAI/);
 assert.deepEqual(p.messages.slice(0,2),[{role:'user',content:'old'},{role:'assistant',content:'ans'}]);
 assert.deepEqual(p.messages[2].content.slice(0,2),[{type:'document',source:{type:'base64',media_type:'application/pdf',data:'JVBERi0='}},{type:'image',source:{type:'base64',media_type:'image/png',data:'iVBORw=='}}]);assert.equal(p.messages[2].content[2].type,'text');
 assert.deepEqual([request([],'Referat',[],true).max_tokens,request([],'Referat',[],true).output_config.effort],[32000,'medium']);
 const {seen,provider}=fakeClaude(message('Claude javobi'));const calls=[];const router=new Router({extra:{Claude:provider},fetcher:async url=>{calls.push(url);return response(q);}});
 const s=settings({Claude:'sk-ant-test'});const answer=await router.ask(s,[],'Salom',undefined,[pdf]);
 assert.deepEqual([answer.provider,answer.text,answer.model],['Claude','Claude javobi','claude-opus-5-5']);assert.equal(calls.length,0);assert.equal(seen[0].key,'sk-ant-test');assert.ok(seen[0].options.signal instanceof AbortSignal);
 await assert.rejects(router.ask(s,[],'Salom',undefined,[audio]),/faqat Gemini/,'Claude does not hear audio');
 assert.deepEqual([reply(message('','refusal')).text,reply(message('Uzun…','max_tokens')).incomplete],['Bu so‘rovga javob bera olmayman. Boshqa savol bilan yordam beraman.',true]);
 assert.equal(new Router({extra:{}}).diagnostics(s).some(d=>d.provider==='Claude'),false,'no Claude route where the SDK is not added (the gateway)');
});
test('Claude errors become route states: a bad key is switched off, a limit waits, and the free routes answer meanwhile',async()=>{
 const cases=[[new Anthropic.AuthenticationError(401,{type:'error',error:{type:'authentication_error',message:'x'}},'x',new Headers()),'Kalit yoki ruxsatni tekshiring',true],[new Anthropic.RateLimitError(429,{type:'error',error:{type:'rate_limit_error',message:'x'}},'x',new Headers()),'Limit yoki balans tugagan',false],[new Anthropic.APIConnectionError({message:'offline'}),'Tarmoq xatosi',false]];
 for(const [error,status,off] of cases){
  const {provider}=fakeClaude(error);const router=new Router({extra:{Claude:provider},fetcher:async()=>response(q)});const s=settings({Claude:'sk-ant-test'});
  assert.equal((await router.ask(s,[],'Salom')).provider,'GPT');const state=router.diagnostics(s).find(d=>d.provider==='Claude');assert.equal(state.status,status);assert.equal(router.states.Claude.disabled,off);
 }
 const c=new AbortController();const {provider}=fakeClaude(new Anthropic.APIUserAbortError());const router=new Router({extra:{Claude:{...provider,ask:async a=>{c.abort();return provider.ask(a);}}},fetcher:async()=>response(q)});
 await assert.rejects(router.ask(settings({Claude:'sk-ant-test'}),[],'Salom',c.signal),{name:'AbortError'},'the stop button stops every route');
});
test('the settings keep Claude and ChatGPT keys encrypted, check their format, and need no free-tier box',()=>{
 const fakeCrypto={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-paid-'));
 try{
  const store=new Store(dir,fakeCrypto);store.update({keys:{Claude:'sk-ant-secret',ChatGPT:'sk-proj-secret'}});
  assert.deepEqual([store.public().configured.Claude,store.public().configured.ChatGPT],[true,true]);assert.equal(fs.readFileSync(store.file,'utf8').includes('secret'),false);
  const again=new Store(dir,fakeCrypto);again.load();assert.deepEqual([again.value.keys.Claude,again.value.keys.ChatGPT],['sk-ant-secret','sk-proj-secret']);
  assert.throws(()=>again.update({keys:{Claude:'sk-proj-wrong'}}),/Claude kaliti «sk-ant-»/);assert.throws(()=>again.update({keys:{ChatGPT:'AIza-wrong'}}),/ChatGPT kaliti «sk-»/);
  again.update({clear:{Claude:true}});assert.equal(again.value.keys.Claude,'');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
