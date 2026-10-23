const test=require('node:test');const assert=require('node:assert/strict');
const {speak,speechBody,speechAudio,SPEECH,body,Router,UserError}=require('../src/router.cjs');const {speakGateway,askGateway}=require('../src/gateway.cjs');
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const valid={deviceId:'123e4567-e89b-12d3-a456-426614174000',question:'Savol',history:[]};
test('TTS request uses the Uzbek-capable model, a warm voice and the key only in its header',async()=>{
 let seen;const audio=await speak({key:'test-key',text:'Salom!',fetcher:async(url,o)=>{seen={url,o,body:JSON.parse(o.body)};return response({steps:[{type:'model_output',content:[{type:'audio',data:'UklGRg==',mime_type:'audio/wav'}]}]});}});
 assert.equal(seen.url,SPEECH.url);assert.equal(seen.o.headers['x-goog-api-key'],'test-key');assert.equal(seen.o.redirect,'manual');assert.equal(JSON.stringify(seen.body).includes('test-key'),false);
 assert.equal(seen.body.model,SPEECH.model);assert.equal(seen.body.input[0].content[0].text,'Salom!');assert.deepEqual(seen.body.response_format,{type:'audio'});assert.equal(audio.mime,'audio/wav');
 assert.deepEqual(speechBody('x').generation_config.speech_config,[{voice:SPEECH.voice}]);
});
test('speech errors are explained and limits are marked; raw PCM becomes WAV',async()=>{
 await assert.rejects(speak({key:'k',text:'x',fetcher:async()=>response({},429)}),e=>e instanceof UserError&&e.code==='limit');
 await assert.rejects(speak({key:'k',text:'x',fetcher:async()=>response({steps:[]})}),/o‘qilmadi/);
 await assert.rejects(speak({key:'k',text:'x'.repeat(SPEECH.maxChars+1)}),UserError);
 const pcm=speechAudio({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:Buffer.alloc(4).toString('base64')}}]}}]});const wav=Buffer.from(pcm.data,'base64');
 assert.equal(pcm.mime,'audio/wav');assert.equal(wav.toString('latin1',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),24000);assert.equal(wav.length,48);
});
test('voice recordings go to Gemini inline, and only Gemini may answer them',async()=>{
 const audio={kind:'audio',name:'Ovozli savol.wav',mime:'audio/wav',data:'UklGRg=='};const b=body('Gemini',[],'Tingla',[audio]);
 assert.deepEqual(b.contents[0].parts[0],{inlineData:{mimeType:'audio/wav',data:'UklGRg=='}});
 const calls=[];const router=new Router({fetcher:async url=>{calls.push(url);return response({},429);}});
 const settings={keys:{Gemini:'g',Groq:'q',OpenRouter:''},free:{Gemini:true,Groq:true},autoFallback:true};
 await assert.rejects(router.ask(settings,[],'q',undefined,[audio]),/ovozli/);assert.equal(calls.length,1);assert.match(calls[0],/googleapis/);
});
test('server accepts WAV voice questions, validates speech text and keeps a separate speech budget',async()=>{
 const {validatePayload,validateSpeech,budget,default:worker}=await import('../server/worker.mjs');
 assert.equal(validatePayload({...valid,files:[{kind:'audio',name:'v.wav',mime:'audio/wav',data:'UklGRg=='}]}).files[0].kind,'audio');
 for(const f of [{kind:'audio',name:'v.mp3',mime:'audio/mpeg',data:'AA=='},{kind:'audio',name:'v.wav',mime:'image/png',data:'AA=='},{kind:'image',name:'a.wav',mime:'audio/wav',data:'AA=='}])assert.throws(()=>validatePayload({...valid,files:[f]}));
 assert.equal(validateSpeech({deviceId:valid.deviceId,text:'  Salom '}).text,'Salom');for(const bad of [{deviceId:valid.deviceId,text:''},{deviceId:valid.deviceId,text:'x'.repeat(1201)},{deviceId:'x',text:'a'}])assert.throws(()=>validateSpeech(bad));
 let state;const limits={total:100,ip:100,device:100,minute:10};for(let i=0;i<10;i++)state=budget(state,1000,'ip','d',limits).data;assert.equal(budget(state,1000,'ip','d',limits).allowed,false);
 const res=await worker.fetch(new Request('https://test/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:valid.deviceId,text:'Salom'})}),{});assert.equal(res.status,503);
 assert.equal((await worker.fetch(new Request('https://test/other',{method:'POST'}),{})).status,404);
});
test('app explains an old server and the speech limit in plain words',async()=>{
 const base={url:'https://test.example',deviceId:valid.deviceId,text:'Salom',signal:new AbortController().signal};
 await assert.rejects(speakGateway({...base,fetcher:async()=>response({error:'Not found'},404)}),/hali yangilanmagan/);
 await assert.rejects(speakGateway({...base,fetcher:async()=>response({error:'x'},429)}),/limiti tugadi/);
 await assert.rejects(speakGateway({...base,fetcher:async()=>response({mime:'text/html',audio:'AA=='})}),/o‘qilmadi/);
 await assert.rejects(askGateway({url:base.url,deviceId:valid.deviceId,history:[],question:'q',files:[{kind:'audio'}],voice:true,signal:base.signal,fetcher:async()=>response({error:'Invalid request'},400)}),/serveri hali qabul qilmayapti/);
});
