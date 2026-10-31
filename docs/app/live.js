'use strict';
// Jonli suhbat (Gemini Live): mikrofon ovozi WebSocket orqali to‘g‘ridan-to‘g‘ri Google’ga boradi, javob ovozi darrov ijro etiladi.
// NurimAI serveri faqat qisqa muddatli token beradi (server/live.mjs) — u NurimAI modeli, ovozi va ko‘rsatmasiga qulflangan.
// Sahifa telefon ilovasida, Telegram Mini App’da (/gaplash) va desktop oynasida bir xil ishlaydi.
const CONFIG = window.NURIM_CONFIG || {};
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const QA = params.has('qa'); // avtomatik sinovlar: mikrofon va tarmoqsiz, tayyor suhbat
const launch = new URLSearchParams(location.hash.slice(1));
const initData = launch.get('tgWebAppData') || ''; // Telegram Mini App: imzolangan foydalanuvchi ma’lumoti
const TELEGRAM = Boolean(initData);
const saved = {
  get(key, fallback) { try { const v = localStorage.getItem('nurim.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('nurim.' + key, JSON.stringify(value)); } catch {} }
};
const deviceId = (() => { let id = saved.get('device'); if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) { id = crypto.randomUUID(); saved.set('device', id); } return id; })();
const OUT_RATE = 24000;
const POSES = { idle: 'wave', connecting: 'think', listening: 'wave', speaking: 'talk', error: 'sad' };
const STATUS = { idle: 'Tugmani bosing va gapiring — NurimAI ovozda javob beradi.', connecting: 'Ulanmoqda…', listening: 'Tinglayapman — gapiring 🙂', speaking: 'Gapiryapti… Gapini bo‘lsangiz, to‘xtab tinglaydi.' };
let call = null;

if (TELEGRAM) { // the official script: ready/expand and the "open in browser" link
  const script = document.createElement('script'); script.src = 'https://telegram.org/js/telegram-web-app.js';
  script.onload = () => { try { Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch {} };
  document.head.append(script);
}
if (TELEGRAM || params.get('from') === 'desktop') $('back').hidden = true;

function setState(state, text) {
  $('live').dataset.state = state; $('status').textContent = text || STATUS[state] || '';
  $('nur').src = `pufak/${POSES[state] || 'wave'}.webp`;
  const active = ['connecting', 'listening', 'speaking'].includes(state);
  $('talk').textContent = active ? 'Tugatish' : 'Boshlash'; $('mute').hidden = !active || state === 'connecting'; $('clock').hidden = !active;
  if (!active) document.documentElement.style.setProperty('--level', 0);
}
function fail(text, browserButton = false) { stop(); setState('error', text); $('browser').hidden = !(browserButton && TELEGRAM); }

// Transcript: what the user said and what NurimAI said, a line per turn, filled as the words arrive.
const open = { user: null, ai: null };
function addText(role, text) {
  if (role === 'ai') close('user');
  if (!open[role]) { const li = document.createElement('li'); li.className = `${role} open`; li.textContent = ''; $('lines').append(li); open[role] = li; }
  open[role].textContent += text; $('lines').scrollTop = $('lines').scrollHeight;
}
function close(role) { if (open[role]) { open[role].classList.remove('open'); open[role].textContent = open[role].textContent.trim(); open[role] = null; } }

const b64 = buffer => { const bytes = new Uint8Array(buffer); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = text => { const s = atob(text), bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i); return bytes; };

// NurimAI's voice: 24 kHz 16-bit PCM pieces, queued one after another; an interruption drops what is still queued.
function play(c, data) {
  const bytes = unb64(data), pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  if (!pcm.length) return;
  const buffer = c.ctx.createBuffer(1, pcm.length, OUT_RATE), channel = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
  const source = c.ctx.createBufferSource(); source.buffer = buffer; source.connect(c.speaker);
  const at = Math.max(c.ctx.currentTime + 0.04, c.playAt); source.start(at); c.playAt = at + buffer.duration;
  c.sources.add(source); source.onended = () => { c.sources.delete(source); if (!c.sources.size && call === c && c.ready) setState('listening'); };
  if (call === c && $('live').dataset.state !== 'speaking') setState('speaking');
}
function hush(c) { for (const s of c.sources) { try { s.stop(); } catch {} } c.sources.clear(); c.playAt = 0; }

// The rings follow the loudest of the microphone (while listening) and NurimAI's voice (while it speaks).
function meter(c) {
  if (call !== c) return;
  c.analyser.getFloatTimeDomainData(c.wave); let peak = 0; for (const v of c.wave) peak = Math.max(peak, Math.abs(v));
  const level = $('live').dataset.state === 'speaking' ? peak : c.micLevel; c.micLevel *= 0.85;
  document.documentElement.style.setProperty('--level', Math.min(1, level * 2.2).toFixed(3));
  requestAnimationFrame(() => meter(c));
}

function connect(c) {
  const ws = new WebSocket(`${c.live.socket}?access_token=${encodeURIComponent(c.live.token)}`); c.ws = ws; c.ready = false;
  ws.onopen = () => ws.send(JSON.stringify({ setup: { ...c.live.setup, sessionResumption: c.handle ? { handle: c.handle } : {} } }));
  ws.onmessage = async event => { let m; try { m = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text()); } catch { return; } if (call === c && c.ws === ws) receive(c, m); };
  ws.onclose = event => {
    if (call !== c || c.ws !== ws) return;
    console.warn('live closed', event.code, event.reason);
    // The server closes a session after ~10 minutes (after goAway); the call goes on in a resumed one while there is time.
    if (c.handle && !c.retried && Date.now() < c.ends - 5000) { c.retried = true; connect(c); return; }
    if (!c.started) fail('Ulanib bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.'); else end('Suhbat uzildi. Davom etish uchun yana «Boshlash»ni bosing.');
  };
}
function receive(c, m) {
  if (m.setupComplete) { c.ready = true; c.started = true; c.retried = false; setState(c.sources.size ? 'speaking' : 'listening'); }
  if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) c.handle = m.sessionResumptionUpdate.newHandle;
  if (m.goAway && c.handle) { const old = c.ws; connect(c); try { old.close(); } catch {} return; }
  const content = m.serverContent; if (!content) return;
  if (content.interrupted) { hush(c); close('ai'); setState('listening'); }
  for (const part of content.modelTurn?.parts || []) if (part.inlineData?.data) play(c, part.inlineData.data);
  if (content.inputTranscription?.text) addText('user', content.inputTranscription.text);
  if (content.outputTranscription?.text) addText('ai', content.outputTranscription.text);
  if (content.turnComplete) { close('user'); close('ai'); }
}

// Errors the user should read as they are (a limit, the network); anything else gets a general note.
const said = text => Object.assign(new Error(text), { said: true });
async function token() {
  let response;
  try { response = await fetch(CONFIG.gateway + '/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(TELEGRAM ? { initData } : { deviceId }) }); }
  catch { throw said('Internet yo‘q yoki NurimAI serveri javob bermadi. Qayta urinib ko‘ring.'); }
  if (response.status === 429) throw said('Bugungi bepul jonli suhbatlar tugadi. Ertaga yana urinib ko‘ring yoki savolingizni yozib yuboring.');
  if (response.status === 401) throw said('Telegram orqali kirish tasdiqlanmadi. Botda /gaplash ni qayta bosing.');
  if (!response.ok) throw said('Jonli suhbat hozir ishlamayapti. Birozdan keyin urinib ko‘ring.');
  const live = await response.json();
  if (typeof live.token !== 'string' || !/^wss:\/\/generativelanguage\.googleapis\.com\//.test(live.socket || '')) throw said('Jonli suhbat hozir ishlamayapti.');
  return live;
}

async function start() {
  if (call) return;
  $('browser').hidden = true; $('lines').replaceChildren(); open.user = open.ai = null;
  if (QA) return demo();
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode) return fail('Bu qurilma yoki brauzerda jonli suhbat ishlamaydi. Chrome yoki Safari’ning yangi versiyasida oching.', true);
  // The audio context is made inside the tap, so phones let it play.
  const ctx = new AudioContext(); const c = call = { ctx, sources: new Set(), playAt: 0, micLevel: 0, ready: false, started: false, muted: false };
  setState('connecting');
  try {
    c.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (error) { if (call === c) fail(error?.name === 'NotAllowedError' ? 'Mikrofonga ruxsat berilmadi. Telefon yoki brauzer sozlamalarida mikrofonga ruxsat bering va qayta bosing.' : 'Mikrofon topilmadi yoki band.', true); return; }
  try {
    const [live] = await Promise.all([token(), ctx.audioWorklet.addModule('live-worklet.js'), ctx.resume()]);
    if (call !== c) return;
    c.live = live; c.ends = Date.now() + (Number(live.minutes) || 15) * 60000;
    c.speaker = ctx.createGain(); c.analyser = ctx.createAnalyser(); c.analyser.fftSize = 512; c.wave = new Float32Array(c.analyser.fftSize);
    c.speaker.connect(ctx.destination); c.speaker.connect(c.analyser);
    const mic = ctx.createMediaStreamSource(c.stream), node = new AudioWorkletNode(ctx, 'nurim-mic');
    node.port.onmessage = event => {
      const { pcm, level } = event.data; if (!c.muted) c.micLevel = Math.max(c.micLevel, level);
      if (c.ready && !c.muted && c.ws?.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(pcm), mimeType: 'audio/pcm;rate=16000' } } }));
    };
    mic.connect(node); node.connect(ctx.destination); // the processor outputs silence; being connected keeps it running
    c.timer = setInterval(() => tick(c), 1000); tick(c); meter(c);
    connect(c);
  } catch (error) { if (call === c) fail(error?.said ? error.message : 'Jonli suhbat hozir ishlamayapti. Birozdan keyin urinib ko‘ring.'); }
}
function tick(c) {
  const left = Math.max(0, Math.round((c.ends - Date.now()) / 1000));
  $('clock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; $('clock').classList.toggle('low', left <= 60);
  if (!left) end('15 daqiqalik suhbat vaqti tugadi. Yana gaplashish uchun «Boshlash»ni bosing.');
}
function stop() {
  const c = call; if (!c) return; call = null;
  clearInterval(c.timer); try { c.ws?.close(); } catch {} hush(c); c.stream?.getTracks().forEach(t => t.stop()); c.ctx?.close().catch(() => {});
  close('user'); close('ai'); $('mute').setAttribute('aria-pressed', 'false'); $('mute').textContent = 'Mikrofon';
}
function end(text) { stop(); setState('idle', text); }

// QA: the states and transcript of a short call, without a microphone or network.
function demo() {
  const c = call = { sources: new Set(), muted: false, ends: Date.now() + 15 * 60000 };
  setState('connecting'); c.timer = setInterval(() => tick(c), 1000); tick(c);
  setTimeout(() => { if (call !== c) return; setState('listening'); addText('user', 'Salom, kasr nima?'); }, 150);
  setTimeout(() => { if (call !== c) return; setState('speaking'); addText('ai', 'Salom! Kasr — butunning bir qismi. Masalan, yarim olma.'); close('ai'); }, 300);
  setTimeout(() => { if (call === c) setState('listening'); }, 450);
}

$('talk').onclick = () => { if (call) end('Suhbat tugadi. Yana gaplashish uchun «Boshlash»ni bosing.'); else start(); };
$('mute').onclick = () => { if (!call) return; call.muted = !call.muted; $('mute').setAttribute('aria-pressed', String(call.muted)); $('mute').textContent = call.muted ? 'Ovoz o‘chiq' : 'Mikrofon'; if (call.ready || QA) $('status').textContent = call.muted ? 'Mikrofon o‘chiq — NurimAI sizni eshitmaydi.' : STATUS[$('live').dataset.state] || ''; };
// Telegram's own view may not let the page use the microphone; the same page opens in the phone's browser instead.
$('browser').onclick = () => { const url = location.href.split('#')[0]; try { Telegram.WebApp.openLink(url); } catch { location.href = url; } };
addEventListener('pagehide', stop);
setState('idle');
