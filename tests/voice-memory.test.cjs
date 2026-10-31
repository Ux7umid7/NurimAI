const test=require('node:test');const assert=require('node:assert/strict');
// The bot's spoken answers (server/voice.mjs) and long-term memory (server/memory.mjs).
function wav(seconds=1,rate=24000,channels=1,bits=16){const n=Math.round(rate*seconds),pcm=Buffer.alloc(n*channels*bits/8);for(let i=0;i<n;i++)for(let c=0;c<channels;c++){if(bits===16)pcm.writeInt16LE(c?-1000:Math.round(Math.sin(i/9)*6000),(i*channels+c)*2);}
 const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(channels,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*channels*bits/8,28);h.writeUInt16LE(channels*bits/8,32);h.writeUInt16LE(bits,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);}

test('a WAV from the TTS becomes a 16 kHz MP3 that Telegram shows as a voice note',async()=>{
 const {wavSamples,resample,mp3,wavToMp3}=await import('../server/voice.mjs');
 const mono=wavSamples(new Uint8Array(wav(1)));assert.deepEqual([mono.rate,mono.samples.length,mono.samples[1]],[24000,24000,Math.round(Math.sin(1/9)*6000)]);
 const stereo=wavSamples(new Uint8Array(wav(0.5,16000,2)));assert.deepEqual([stereo.samples.length,stereo.samples[0]],[8000,0]); // the first channel
 assert.throws(()=>wavSamples(new Uint8Array(wav(0.1,16000,1,8))),/16-bit/);assert.throws(()=>wavSamples(new Uint8Array(Buffer.from('not a wav file at all, really not, no no no no'))),/not a WAV/);
 assert.equal(resample(mono.samples,24000,16000).length,16000);assert.equal(resample(mono.samples,24000,24000),mono.samples);
 const out=wavToMp3(wav(2).toString('base64'));assert.equal(out[0],0xFF);assert.equal(out[1]&0xE0,0xE0);assert.ok(out.length>4000&&out.length<12000,`${out.length} bytes`); // MPEG frame sync, about 32 kbps
 assert.equal(mp3(new Int16Array(0)).length>=0,true);
});
test('what is read aloud: plain words, no Markdown, code or emoji, cut at a sentence end',async()=>{
 const {speechText}=await import('../server/voice.mjs');
 assert.equal(speechText('## Kasrlar\n**Javob:** $\\frac{1}{2}$ 😀\n- birinchi\n---\n```js\nlet a=1\n```\nBatafsil: https://kun.uz/x'),'Kasrlar\nJavob: 1/2\nbirinchi\n(kod matnda)\nBatafsil:');
 const long=Array.from({length:40},(_,i)=>`Bu ${i + 1}-gap va u ancha uzun bo‘lib, ovoz uchun kesiladi.`).join(' ');
 const said=speechText(long,300);assert.ok(said.length<=300&&said.endsWith('.'),said);
});
test('memory: the note goes with the question, the XOTIRA line comes out of the answer, facts merge without repeats',async()=>{
 const {withMemory,memoryNote,splitMemory,mergeFacts,MAX_FACTS,MEMORY_TEXTS}=await import('../server/memory.mjs');
 assert.equal(memoryNote([]),'');assert.match(withMemory('Kasr nima?',[]),/^Kasr nima\?\n\nAgar foydalanuvchi/);
 assert.match(withMemory('Kasr nima?',[{text:'Ismi Ali'},{text:'8-sinfda o‘qiydi'}]),/^\[Foydalanuvchi haqida avval aytilganlar — hisobga ol, lekin har javobda qaytarib aytma: Ismi Ali; 8-sinfda o‘qiydi\]\n\nKasr nima\?\n\nAgar/);
 assert.deepEqual(splitMemory('Salom, Ali!\nKasr — bu qism.\n\n**XOTIRA:** Ismi Ali; 8-sinfda o‘qiydi.'),{text:'Salom, Ali!\nKasr — bu qism.',facts:['Ismi Ali','8-sinfda o‘qiydi']});
 assert.deepEqual(splitMemory('Javob.\nXOTIRA: yo‘q'),{text:'Javob.',facts:[]});assert.deepEqual(splitMemory('Xotira mashqlari foydali.'),{text:'Xotira mashqlari foydali.',facts:[]});
 const merged=mergeFacts([{text:'Ismi Ali',at:1},{text:'Futbolni yaxshi ko‘radi',at:1}],['ismi ali','Matematikani yoqtiradi'],5);
 assert.deepEqual(merged,[{text:'Futbolni yaxshi ko‘radi',at:1},{text:'ismi ali',at:5},{text:'Matematikani yoqtiradi',at:5}]);
 assert.equal(mergeFacts([],Array.from({length:20},(_,i)=>`Fakt ${i}`)).length,MAX_FACTS);
 assert.match(MEMORY_TEXTS.list([{text:'<b>Ali</b>'}]),/• &lt;b&gt;Ali&lt;\/b&gt;\n\nO‘chirish: \/unut/);assert.match(MEMORY_TEXTS.list([]),/Hali siz haqingizda hech narsa/);
});
test('/ovoz settings are read from plain words',async()=>{
 const {voiceMode}=await import('../server/telegram.mjs');
 assert.deepEqual(['doim','har doim','yo‘q',"yo'q",'o‘chir','ovozga','standart','',undefined,'nimadir'].map(voiceMode),['always','always','off','off','off','auto','auto',null,null,null]);
});
