// Ovoz: 🎤 bilan savol (mikrofon -> 16 kHz mono WAV -> NurimAI) va javobni ovoz chiqarib o'qish (🔊).
// Mikrofon faqat tugma bosilganda yoqiladi; yozuv xotirada turadi va faqat shu savol uchun yuboriladi.
let recorder=null,recStart=0,recTimer=null,recChunks=[],speaking=null;
// Chromium yozadi WebM/Opus, iPhone Safari esa MP4/AAC: qaysi biri bo'lsa ham keyin WAV'ga aylantiriladi.
const REC_TYPE=['audio/webm;codecs=opus','audio/mp4','audio/aac'].find(t=>globalThis.MediaRecorder?.isTypeSupported?.(t))||'';
const MAX_RECORD=60;
const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
function showRecording(on){$('rec').hidden=!on;$('enter-hint').hidden=on;$('mic').classList.toggle('recording',on);$('mic').setAttribute('aria-label',on?'Yozishni tugatib yuborish':'Ovozli savol');$('mic').title=on?'Tugatib yuborish':'Ovozli savol: bosing, gapiring, yana bosing';}
async function startRecording(){
  if(busy||recorder)return;notice('');if(speaking)speaking.stop();
  let stream;
  try{
    if(!await call(window.nurim.micAccess()))throw Object.assign(new Error(),{name:'NotAllowedError'});
    stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  }catch(e){notice(['NotAllowedError','SecurityError'].includes(e.name)?'Mikrofonga ruxsat yo‘q. Windows: Sozlamalar → Maxfiylik → Mikrofon; Mac: System Settings → Privacy & Security → Microphone’da NurimAI’ni yoqing.':e.name==='NotFoundError'?'Mikrofon topilmadi. Mikrofon ulanganini tekshiring.':'Mikrofonni yoqib bo‘lmadi.');return;}
  recChunks=[];recorder=new MediaRecorder(stream,REC_TYPE?{mimeType:REC_TYPE}:undefined);
  recorder.ondataavailable=e=>{if(e.data.size)recChunks.push(e.data);};recorder.onstop=()=>stream.getTracks().forEach(t=>t.stop());
  recorder.start(250);recStart=Date.now();$('rec-time').textContent='0:00';showRecording(true);window.nurim.petMood('listen');
  recTimer=setInterval(()=>{const s=(Date.now()-recStart)/1000;$('rec-time').textContent=clock(s);if(s>=MAX_RECORD)stopRecording(true);},250);
}
async function stopRecording(send){
  if(!recorder)return;const r=recorder;recorder=null;clearInterval(recTimer);showRecording(false);
  const seconds=Math.min(MAX_RECORD,(Date.now()-recStart)/1000);
  await new Promise(resolve=>{r.addEventListener('stop',resolve,{once:true});r.stop();});
  if(!send||seconds<0.8){window.nurim.petMood('idle');if(send)notice('Juda qisqa bo‘ldi. 🎤 ni bosing, savolingizni ayting va yana bosing.');return;}
  try{await askVoice(await toWav(new Blob(recChunks,{type:r.mimeType||REC_TYPE||'audio/webm'})),seconds);}catch(e){notice(e.message||'Ovozni o‘qib bo‘lmadi.');window.nurim.petMood('idle');}
}
// Brauzer yozgan WebM/Opus -> 16 kHz mono PCM -> WAV (Gemini WAV'ni to'g'ridan-to'g'ri tinglaydi).
async function toWav(blob){
  const ctx=new AudioContext();let decoded;try{decoded=await ctx.decodeAudioData(await blob.arrayBuffer());}finally{ctx.close();}
  const rate=16000,offline=new OfflineAudioContext(1,Math.max(1,Math.ceil(decoded.duration*rate)),rate),source=offline.createBufferSource();
  source.buffer=decoded;source.connect(offline.destination);source.start();
  return encodeWav((await offline.startRendering()).getChannelData(0),rate);
}
function encodeWav(pcm,rate){
  const buffer=new ArrayBuffer(44+pcm.length*2),v=new DataView(buffer),text=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  text(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,pcm.length*2,true);
  for(let i=0;i<pcm.length;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,pcm[i]))*0x7fff,true);
  return buffer;
}
async function askVoice(wav,seconds){
  if(busy)return;notice('');const asked=bubble('user',`🎤 Ovozli savol (${clock(seconds)})`);setBusy(true);
  try{const reply=await call(window.nurim.sendVoice(wav,seconds));if(reply.transcript)asked.querySelector('p').textContent=`🎤 ${reply.transcript}`;const answer=bubble('assistant',reply.text);if(state?.settings.autoSpeak!==false)speakBubble(answer,reply.text);}
  catch(e){notice(e.message);bubble('assistant','Javob olinmadi. Savolni qayta yuborishingiz mumkin.');window.nurim.petMood('idle');}
  finally{setBusy(false);}
}
$('mic').onclick=()=>recorder?stopRecording(true):startRecording();
$('rec-cancel').onclick=()=>stopRecording(false);

// O'qish uchun matn: kod bloklari va belgilash olib tashlanadi; birinchi bo'lak qisqa (tez boshlanadi), keyingilari kattaroq.
function speechText(text){return text.replace(/```[\s\S]*?```/g,' (kod) ').replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm,'').replace(/`([^`]+)`/g,'$1').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/^\s*#{1,4}\s+/gm,'').replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm,'').replace(/\n{2,}/g,'\n').trim();}
function speechParts(text){
  const pieces=text.match(/[^.!?…\n]+[.!?…]*\s*|\n+/g)||[text];const out=[];let current='';
  for(const piece of pieces){const limit=out.length?700:220;if((current+piece).length>limit&&current.trim()){out.push(current.trim());current='';}current+=piece.slice(0,1100);}
  if(current.trim())out.push(current.trim());
  let total=0;return out.filter(part=>(total+=part.length)<=2600).slice(0,6);
}
async function speakBubble(el,text){
  if(speaking){const same=speaking.el===el;speaking.stop();if(same)return;}
  const parts=speechParts(speechText(text));const button=el.querySelector('.speak');if(!parts.length||!button)return;
  let stopped=false,audio=null;const urls=[];
  const stop=()=>{if(stopped)return;stopped=true;audio?.pause();urls.forEach(u=>URL.revokeObjectURL(u));button.textContent='🔊 Tinglash';button.classList.remove('on');window.nurim.petMood('idle');if(speaking?.el===el)speaking=null;};
  speaking={el,stop};button.textContent='◼ To‘xtatish';button.classList.add('on');
  const load=i=>i<parts.length?call(window.nurim.speak(parts[i])):null;
  let next=load(0);next?.catch(()=>{});
  try{
    for(let i=0;i<parts.length&&!stopped;i++){
      const data=await next;if(stopped)break;next=load(i+1);next?.catch(()=>{}); // keyingi bo'lak shu bo'lak o'qilayotganda tayyorlanadi
      const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(data.audio),c=>c.charCodeAt(0))],{type:data.mime}));urls.push(url);
      audio=new Audio(url);window.nurim.petMood('talk');
      await new Promise((resolve,reject)=>{audio.onended=resolve;audio.onerror=()=>reject(new Error('Ovozni ijro etib bo‘lmadi.'));audio.play().catch(reject);});
    }
  }catch(e){if(!stopped)notice(e.message);}finally{stop();}
}
