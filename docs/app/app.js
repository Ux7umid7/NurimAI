'use strict';
// NurimAI telefon ilovasi (veb-ilova va Android). Desktopdagi asosiy jarayon vazifalari - server, tarix, mashq, eslatmalar - shu yerda;
// ular window.nurim orqali desktop bilan umumiy voice.js va ustoz.js ga beriladi (javoblar o'sha {ok,data|error} ko'rinishida).
const CONFIG = window.NURIM_CONFIG || {};
const QA = new URLSearchParams(location.search).has('qa'); // avtomatik sinovlar: jonli AI o'rniga tayyor javob
const $ = id => document.getElementById(id);
const Cap = window.capacitorExports?.Capacitor;
const NATIVE = Boolean(Cap?.isNativePlatform?.());
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const saved = {
  get(key, fallback) { try { const v = localStorage.getItem('nurim.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('nurim.' + key, JSON.stringify(value)); return true; } catch { return false; } }
};
const state = { version: CONFIG.version || '', platform: NATIVE ? 'android' : IOS ? 'ios' : 'web', settings: { autoSpeak: true, saveHistory: true, ...saved.get('settings', {}) } };
const deviceId = (() => { let id = saved.get('device'); if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) { id = crypto.randomUUID(); saved.set('device', id); } return id; })();
let busy = false, files = [], history = [], visible = [], chatId = crypto.randomUUID(), controller = null, generating = null, fileSeq = 0;
const shownFiles = new Set();
class UserError extends Error {}
NurimPractice.configure({ ErrorClass: UserError });
const practice = new NurimPractice.Practice({ read: () => { try { return localStorage.getItem('nurim.practice'); } catch { return null; } }, write: text => { try { localStorage.setItem('nurim.practice', text); } catch { throw new UserError('Telefon xotirasi to‘ldi: eski suhbatlarni o‘chirib ko‘ring.'); } } });
practice.load();

async function call(promise) { const result = await promise; if (!result.ok) throw new Error(result.error); return result.data; }
function notice(text) { $('notice').textContent = text || ''; $('notice').hidden = !text; }
function scroll() { const area = $('chat-area'); requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; }); }

// Javob formatlash: DOM tugunlari (hech qachon HTML emas) - paragraf, ro'yxat, **qalin**, `kod`, ``` bloklar.
function inline(parent, text) { let last = 0; for (const m of text.matchAll(/\*\*([^*\n]+)\*\*|`([^`\n]+)`/g)) { if (m.index > last) parent.append(text.slice(last, m.index)); const e = document.createElement(m[1] !== undefined ? 'strong' : 'code'); e.textContent = m[1] ?? m[2]; parent.append(e); last = m.index + m[0].length; } if (last < text.length) parent.append(text.slice(last)); }
function rich(container, text) {
  let list = null, para = null, code = null;
  for (const line of text.split('\n')) {
    if (code) { if (/^\s*```/.test(line)) code = null; else code.textContent += (code.textContent ? '\n' : '') + line; continue; }
    if (/^\s*```/.test(line)) { list = para = null; const pre = document.createElement('pre'); code = document.createElement('code'); pre.append(code); container.append(pre); continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { list = para = null; container.append(document.createElement('hr')); continue; } // --- butun kenglikdagi ajratuvchi chiziq
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line), num = /^\s*(\d+)[.)]\s+(.*)$/.exec(line), head = /^\s*#{1,4}\s+(.*)$/.exec(line);
    if (bullet || num) { const tag = bullet ? 'UL' : 'OL'; if (!list || list.tagName !== tag) { list = document.createElement(tag); if (num) list.start = Number(num[1]); container.append(list); para = null; } const li = document.createElement('li'); inline(li, bullet ? bullet[1] : num[2]); list.append(li); continue; }
    if (!line.trim()) { list = para = null; continue; }
    if (head) { list = para = null; const h = document.createElement('p'); h.className = 'head'; inline(h, head[1].replace(/\*\*/g, '')); container.append(h); continue; }
    list = null; if (para) para.append(document.createElement('br')); else { para = document.createElement('p'); container.append(para); } inline(para, line);
  }
}
function chip(file, removable) {
  const el = document.createElement('span'); el.className = `file-chip ${file.kind}`; el.title = file.note ? `${file.name}\n${file.note}` : file.name;
  if (file.thumb) { const img = document.createElement('img'); img.src = file.thumb; img.alt = ''; el.append(img); } else { const badge = document.createElement('b'); badge.textContent = (file.ext || file.kind).slice(0, 4).toUpperCase(); el.append(badge); }
  const name = document.createElement('span'); name.textContent = file.name; el.append(name);
  if (removable) { const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', `${file.name} faylini olib tashlash`); x.onclick = () => { files = files.filter(f => f.id !== file.id); renderFiles(); }; el.append(x); }
  return el;
}
function renderFiles() { $('attachments').replaceChildren(...files.map(f => chip(f, true))); $('attachments').hidden = !files.length; $('file-actions').hidden = !files.length || busy; $('question').placeholder = files.length ? 'Fayl haqida so‘rang…' : 'NurimAI’ga yozing…'; composerState(); }
// --- Referat (Word) va taqdimot (PowerPoint): fayl telefonda yasaladi, oxirgi 10 tasi shu telefonda saqlanadi ---
const DOCS_KEEP = 10;
const bytesToB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
function keepDoc(doc, bytes) {
  try {
    localStorage.setItem('nurim.doc.' + doc.id, bytesToB64(bytes));
    const list = [doc.id, ...saved.get('docs', []).filter(id => id !== doc.id)];
    for (const old of list.slice(DOCS_KEEP)) localStorage.removeItem('nurim.doc.' + old);
    saved.set('docs', list.slice(0, DOCS_KEEP));
  } catch {} // xotira to'lgan bo'lsa fayl faqat shu seansda qoladi
}
const madeDocs = new Map();
function docBytes(id) {
  if (madeDocs.has(id)) return madeDocs.get(id);
  try { const s = localStorage.getItem('nurim.doc.' + id); if (!s) return null; const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; } catch { return null; }
}
let nativeFiles = null; // Android: Capacitor Filesystem + Share (registered once)
async function saveDoc(doc) {
  const bytes = docBytes(doc.id); if (!bytes) throw new UserError('Bu fayl endi telefonda yo‘q (eski yoki o‘chirilgan). Qayta so‘rang.');
  if (NATIVE) {
    nativeFiles ||= { fs: window.capacitorExports.registerPlugin('Filesystem'), share: window.capacitorExports.registerPlugin('Share') };
    const written = await nativeFiles.fs.writeFile({ path: doc.name, data: bytesToB64(bytes), directory: 'CACHE' });
    try { await nativeFiles.share.share({ title: doc.name, files: [written.uri], dialogTitle: 'Faylni ochish yoki saqlash' }); } catch (e) { if (!/cancel/i.test(String(e?.message || e))) throw new UserError('Faylni ochib bo‘lmadi.'); }
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: NurimDocs.MIME[doc.kind] }));
  const a = document.createElement('a'); a.href = url; a.download = doc.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function docCard(doc) {
  const card = document.createElement('div'); card.className = `doc-card ${doc.kind}`;
  const badge = document.createElement('b'); badge.textContent = doc.kind === 'pptx' ? 'PPTX' : 'DOCX';
  const name = document.createElement('span'); name.textContent = doc.name;
  const get = document.createElement('button'); get.type = 'button'; get.className = 'primary doc-get'; get.textContent = NATIVE ? 'Ochish / saqlash' : 'Yuklab olish';
  get.onclick = () => saveDoc(doc).catch(e => notice(e.message));
  card.append(badge, name, get); return card;
}
const QA_PLAN = { docx: '{"mavzu":"Sinov referati","bolimlar":[{"sarlavha":"Kirish","matn":["Sinov matni."]},{"sarlavha":"Xulosa","matn":["Yakun."]}],"adabiyotlar":["Darslik"]}', pptx: '{"mavzu":"Sinov taqdimoti","izoh":"QA","slaydlar":[{"sarlavha":"Birinchi","bandlar":["Bir","Ikki"]},{"sarlavha":"Xulosa","bandlar":["Yakun"]}]}' };
async function makeDoc(question, want, signal) {
  const reply = QA ? { text: QA_PLAN[want.kind] } : await askAI(NurimDocs.prompt(question, want, files.length > 0), { signal, long: true });
  const plan = NurimDocs.parse(want.kind, reply.text); if (!plan) throw new UserError('Faylni tayyorlay olmadim. Qayta urinib ko‘ring yoki mavzuni boshqacha yozing.');
  const bytes = NurimDocs.build(plan), doc = { id: crypto.randomUUID(), name: NurimDocs.fileName(plan), kind: plan.kind };
  madeDocs.set(doc.id, bytes); keepDoc(doc, bytes);
  return { text: NurimDocs.summary(plan), incomplete: false, doc };
}
function bubble(role, text, attached = [], doc = null, remembered = []) {
  if (role !== 'user') text = NurimMath.plainMath(text); // LaTeX ($\frac{1}{2}$ -> 1/2): ko'rinishi, nusxasi va ovozi oddiy matn
  $('welcome').hidden = true; $('suggest').hidden = true; heroStop();
  const el = document.createElement('article'); el.className = `bubble ${role}`;
  if (role === 'user') {
    if (attached.length) { const row = document.createElement('div'); row.className = 'bubble-files'; row.append(...attached.map(f => chip(f, false))); el.append(row); }
    const p = document.createElement('p'); p.textContent = text; el.append(p);
  } else {
    const avatar = document.createElement('img'); avatar.src = 'pufak/avatar.webp'; avatar.alt = '';
    const body = document.createElement('div'); body.className = 'rich'; rich(body, text); el.append(avatar, body);
    if (doc) body.append(docCard(doc));
    if (remembered?.length) { const note = document.createElement('p'); note.className = 'memory-note'; note.textContent = `🧠 Eslab qoldim: ${remembered.join('; ')}`; body.append(note); }
    if (text.startsWith('Javob olinmadi')) el.classList.add('error');
    else {
      const actions = document.createElement('div'); actions.className = 'actions';
      const listen = document.createElement('button'); listen.type = 'button'; listen.className = 'speak'; listen.textContent = '🔊 Tinglash'; listen.onclick = () => speakBubble(el, text);
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'copy'; copy.textContent = 'Nusxa'; copy.onclick = async () => { try { await navigator.clipboard.writeText(text); copy.textContent = 'Olindi ✓'; } catch { notice('Nusxa olib bo‘lmadi.'); } };
      actions.append(listen, copy);
      if (navigator.share) { const share = document.createElement('button'); share.type = 'button'; share.textContent = 'Ulashish'; share.onclick = () => navigator.share({ text }).catch(() => {}); actions.append(share); }
      el.append(actions);
    }
  }
  $('messages').append(el); scroll(); return el;
}
function setBusy(value) {
  busy = value; $('stop').hidden = !value; $('question').readOnly = value;
  for (const id of ['attach', 'mic', 'send', 'new']) $(id).disabled = value;
  $('file-actions').hidden = !files.length || value; $('status').textContent = value ? 'Javob tayyorlanmoqda…' : 'Yoningizdagi ustoz';
  if (!value && moodBase === 'think') mood('idle');
  scroll();
}

// --- Server ---
// Signal + vaqt chegarasi (AbortSignal.any eski Safari'da yo'q).
function limit(signal, ms) { const c = new AbortController(); const timer = setTimeout(() => c.abort(new DOMException('Timeout', 'TimeoutError')), ms); signal?.addEventListener('abort', () => c.abort(signal.reason), { once: true }); c.signal.addEventListener('abort', () => clearTimeout(timer), { once: true }); return c.signal; }
async function gateway(path, body, signal, ms) {
  if (!CONFIG.gateway) throw new UserError('NurimAI serveri sozlanmagan.');
  let response;
  try { response = await fetch(CONFIG.gateway + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: limit(signal, ms) }); }
  catch (e) { if (signal?.aborted) throw e; throw new UserError(navigator.onLine === false ? 'Internet yo‘q. Ulanishni tekshirib, qayta yuboring.' : e?.name === 'TimeoutError' ? 'Server javob bermadi. Birozdan keyin qayta urinib ko‘ring.' : 'Serverga ulanib bo‘lmadi. Internetni tekshiring.'); }
  let data = {}; try { data = await response.json(); } catch {}
  return { status: response.status, ok: response.ok, data };
}
const recent = () => { const out = []; let count = 0; for (let i = history.length - 2; i >= 0 && out.length < 12; i -= 2) { const a = history[i], b = history[i + 1]; if (a.role !== 'user' || b.role !== 'assistant') continue; count += a.text.length + b.text.length; if (count > 12000) break; out.unshift(a, b); } return out; };
const forRequest = list => list.map(f => f.kind === 'text' ? { kind: 'text', name: f.name, text: f.text } : { kind: f.kind, name: f.name, mime: f.mime, data: f.data });
// --- Xotira: foydalanuvchi o'zi haqida aytgan qisqa faktlar faqat shu telefonda; har chat savoli bilan serverga boradi ---
const memory = { get() { const m = saved.get('memory', {}); return { enabled: m.enabled !== false, facts: Array.isArray(m.facts) ? m.facts.filter(f => typeof f?.text === 'string') : [] }; }, set(m) { saved.set('memory', m); } };
function keepFacts(texts) { const m = memory.get(); if (!m.enabled || !texts.length) return; memory.set({ ...m, facts: NurimMemory.mergeFacts(m.facts, texts) }); }
// remember: a chat question (memory goes with it, new facts come back); quizzes, cards and documents do not use memory.
async function askAI(question, { extra = [], signal, voice = false, withHistory = true, withFiles = true, long = false, remember = false } = {}) {
  const sentFiles = [...(withFiles ? forRequest(files) : []), ...extra], mem = memory.get(), facts = remember && mem.enabled ? mem.facts.map(f => f.text) : null;
  if (QA) { await new Promise(r => setTimeout(r, 200)); if (question.endsWith('/qa-xato')) throw new UserError('Sinov xatosi.'); const n = sentFiles.length - extra.length, noted = facts && question.includes('/qa-xotira') ? ['Ismi Sinov', '8-sinfda o‘qiydi'] : []; keepFacts(noted); return { text: noted.length ? 'Tanishganimdan xursandman!' : `${voice ? 'Savolingiz: Kasr nima?\n' : ''}Bu avtomatik sinov uchun tayyor javob. Jonli AI emas.${n ? ` Biriktirilgan fayllar: ${n}.` : ''}`, incomplete: false, remembered: noted }; }
  const r = await gateway('/chat', { deviceId, history: withHistory ? recent() : [], question, ...(sentFiles.length ? { files: sentFiles } : {}), ...(long ? { long: true } : {}), ...(facts ? { memory: facts } : {}) }, signal, sentFiles.length || long ? 120000 : 90000); // long: a referat/presentation plan
  if (!r.ok) throw new UserError({ 429: 'Bugungi bepul limit tugadi. Ertaga yana yozing.', 413: 'Fayllar juda katta. Keraksizini olib tashlang.', 422: sentFiles.length ? 'AI bu fayl yoki savolni qabul qilmadi. Faylni olib tashlab ko‘ring.' : 'AI bu savolni qabul qilmadi. Matnni qisqartiring yoki yangi suhbat boshlang.', 400: voice ? 'Ovozli savolni server hali qabul qilmayapti. Savolni yozib yuboring.' : 'So‘rov noto‘g‘ri. Ilovani yangilang.', 403: 'Server bu ilovani tanimadi. Ilovani yangilang.' }[r.status] || 'AI serveri hozir javob bera olmadi. Keyinroq urinib ko‘ring.');
  if (typeof r.data.text !== 'string' || !r.data.text.trim()) throw new UserError('Server javobi o‘qilmadi.');
  const noted = facts && Array.isArray(r.data.facts) ? r.data.facts.filter(f => typeof f === 'string').slice(0, 15) : []; keepFacts(noted);
  return { text: r.data.text, incomplete: r.data.incomplete === true, remembered: noted };
}

// --- Suhbat ---
const VOICE_QUESTION = 'Bu ovozli xabar. Uni diqqat bilan tingla. Birinchi qatorda eshitganingni so‘zma-so‘z «Savolingiz: …» deb yoz, keyingi qatordan javob ber. Ovoz eshitilmasa yoki tushunarsiz bo‘lsa, shuni ayt.';
const HEARD = /^\s*\**\s*Savolingiz\s*:?\s*\**\s*[«"]?(.+?)[»"]?\s*\**\s*$/i;
async function converse(question, { display = question, voice = false, extra = [] }) {
  if (controller || generating) throw new UserError('Avvalgi javobni kuting.');
  controller = new AbortController(); const fresh = files.filter(f => !shownFiles.has(f.id)); fresh.forEach(f => shownFiles.add(f.id));
  const asked = { role: 'user', text: display, files: fresh.map(({ name, ext, kind }) => ({ name, ext, kind })) }; visible.push(asked);
  mood('think');
  const want = !voice && !extra.length && NurimDocs.detect(question); // "Fotosintez haqida referat yozib ber" -> Word fayl
  if (want) {
    try { const made = await makeDoc(question, want, controller.signal); history.push({ role: 'user', text: display }, { role: 'assistant', text: made.text }); history = history.slice(-24); visible.push({ role: 'assistant', text: made.text, doc: made.doc }); mood('happy'); remember(); return made; }
    catch (e) { visible.push({ role: 'assistant', text: 'Javob olinmadi. Savolni qayta yuborishingiz mumkin.', error: true }); mood(e?.name === 'AbortError' ? 'idle' : 'sad'); remember(); throw e; }
    finally { controller = null; }
  }
  try {
    const reply = await askAI(practice.state.teacher ? `${question}\n\n(${NurimPractice.TEACHER})` : question, { extra, signal: controller.signal, voice, remember: true });
    let text = reply.text, transcript = '';
    if (voice) { const lines = text.split('\n'); const heard = HEARD.exec(lines[0] || ''); if (heard) { transcript = heard[1].trim().slice(0, 600); text = lines.slice(1).join('\n').trim() || text; asked.text = `🎤 ${transcript}`; } }
    history.push({ role: 'user', text: transcript || display }, { role: 'assistant', text }); history = history.slice(-24); visible.push({ role: 'assistant', text }); mood('happy'); remember();
    return { ...reply, text, transcript };
  } catch (e) { visible.push({ role: 'assistant', text: 'Javob olinmadi. Savolni qayta yuborishingiz mumkin.', error: true }); mood(e?.name === 'AbortError' ? 'idle' : 'sad'); remember(); throw e; }
  finally { controller = null; }
}
async function askText(question) {
  if (!question || busy) return; notice('');
  const fresh = files.filter(f => !shownFiles.has(f.id)); bubble('user', question, fresh.map(({ name, ext, kind }) => ({ name, ext, kind }))); $('question').value = ''; grow(); setBusy(true);
  try { const reply = await call(window.nurim.send(question)); bubble('assistant', reply.text, [], reply.doc, reply.remembered); if (reply.incomplete) notice('Javob uzunligi chegarasiga yetdi. Davomini so‘rashingiz mumkin.'); }
  catch (error) { notice(error.message); bubble('assistant', 'Javob olinmadi. Savolni qayta yuborishingiz mumkin.'); $('question').value = question; grow(); }
  finally { setBusy(false); }
}
function newChat() {
  if (busy) return; controller?.abort(); history = []; visible = []; files = []; shownFiles.clear(); chatId = crypto.randomUUID();
  $('messages').replaceChildren(); $('welcome').hidden = false; $('suggest').hidden = false; $('question').value = ''; grow(); renderFiles(); notice(''); greet(); mood('wave');
}

// --- Tarix: shu telefonda (localStorage) ---
const CHAT_LIMITS = { chats: 60, messages: 200, text: 20000 };
const norm = t => [...t].map(c => /[‘’ʻʼ`´]/.test(c) ? "'" : c.toLowerCase().length === 1 ? c.toLowerCase() : c).join('');
function remember() {
  if (!state.settings.saveHistory || !visible.length) return;
  const chats = saved.get('chats', []).filter(c => c.id !== chatId);
  const first = visible.find(m => m.role === 'user');
  chats.unshift({ id: chatId, title: (first?.text || 'Suhbat').replace(/\s+/g, ' ').trim().slice(0, 70), updated: Date.now(), messages: visible.slice(-CHAT_LIMITS.messages).map(m => ({ ...m, text: m.text.slice(0, CHAT_LIMITS.text) })) });
  let list = chats.slice(0, CHAT_LIMITS.chats);
  while (list.length && !saved.set('chats', list)) list = list.slice(0, -1); // xotira to'lsa eng eskisi tushib qoladi
  renderHistory();
}
function renderHistory() {
  const q = norm($('history-search').value.trim()); const chats = saved.get('chats', []);
  const items = chats.filter(c => !q || norm(c.title).includes(q) || c.messages.some(m => norm(m.text).includes(q)));
  $('history-list').replaceChildren(...items.map(c => {
    const li = document.createElement('li'); if (c.id === chatId) li.className = 'current';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'open';
    const title = document.createElement('strong'); title.textContent = c.title; const meta = document.createElement('small'); meta.textContent = `${when(c.updated)} · ${c.messages.length} ta xabar`;
    open.append(title, meta); open.onclick = () => openChat(c.id);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = '×'; del.setAttribute('aria-label', `“${c.title}” suhbatini o‘chirish`);
    del.onclick = () => { saved.set('chats', saved.get('chats', []).filter(x => x.id !== c.id)); renderHistory(); };
    li.append(open, del); return li;
  }));
  $('history-empty').hidden = items.length > 0; $('history-empty').textContent = q ? 'Hech narsa topilmadi.' : state.settings.saveHistory ? 'Hali suhbat yo‘q.' : 'Tarix saqlash o‘chirilgan (Sozlamalar).';
}
function openChat(id) {
  if (busy) return; const c = saved.get('chats', []).find(x => x.id === id); if (!c) return;
  newChat(); chatId = c.id; visible = c.messages.map(m => ({ ...m }));
  for (let i = 0; i + 1 < visible.length; i++) { const [a, b] = [visible[i], visible[i + 1]]; if (a.role === 'user' && b.role === 'assistant' && !b.error) { history.push({ role: 'user', text: a.text }, { role: 'assistant', text: b.text }); i++; } }
  history = history.slice(-24); for (const m of visible) bubble(m.role, m.text, m.files || [], m.doc); closeDrawer(); renderHistory();
}
const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
function when(time) { const d = new Date(time), now = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5); return days === 0 ? 'Bugun ' + hm : days === 1 ? 'Kecha ' + hm : `${d.getDate()}-${MONTHS[d.getMonth()]}`; }

// --- Fayllar: kamera, galereya, hujjatlar (hammasi telefonda tayyorlanadi) ---
const LIMITS = { files: 5, input: 15 * 1024 * 1024, image: 4 * 1024 * 1024, pdf: 7 * 1024 * 1024, text: 60000, totalText: 120000, totalBinary: 9 * 1024 * 1024 };
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'css', 'sql', 'yaml', 'yml', 'ini', 'log', 'srt']);
const mb = n => `${Math.round(n / 1024 / 1024)} MB`;
const toBase64 = async blob => { const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
async function loadImage(file) { const url = URL.createObjectURL(file); try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); } }
async function prepareImage(file, name, ext) {
  let img; try { img = await loadImage(file); } catch { throw new UserError(`${name}: rasmni ochib bo‘lmadi.${ext === 'heic' || ext === 'heif' ? ' Kamera sozlamasida “Eng mos” (JPEG) formatini tanlang.' : ''}`); }
  const w = img.naturalWidth, h = img.naturalHeight, scale = Math.min(1, 2000 / Math.max(w, h));
  const draw = (s, type, quality) => new Promise(resolve => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); c.toBlob(resolve, type, quality); });
  const keepPng = file.type === 'image/png' && scale === 1 && file.size <= 1.5 * 1024 * 1024;
  const blob = keepPng ? file : await draw(scale, 'image/jpeg', 0.86);
  if (!blob || blob.size > LIMITS.image) throw new UserError(`${name}: rasm juda katta. Kichikroq rasm yuboring.`);
  const thumbBlob = await draw(Math.min(1, 96 / Math.max(w, h)), 'image/jpeg', 0.8);
  return { name, ext: keepPng ? 'png' : 'jpg', kind: 'image', mime: keepPng ? 'image/png' : 'image/jpeg', data: await toBase64(blob), size: blob.size, thumb: thumbBlob ? `data:image/jpeg;base64,${await toBase64(thumbBlob)}` : '' };
}
async function inflate(bytes) { const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Uint8Array(await new Response(stream).arrayBuffer()); }
async function officeText(file, ext) {
  const entries = NurimOffice.zipEntries(new Uint8Array(await file.arrayBuffer())); const texts = new Map(); const utf8 = new TextDecoder(); let total = 0;
  const wanted = name => /\.(xml|rels)$/.test(name) && (ext === 'docx' ? name.startsWith('word/') : ext === 'xlsx' ? name.startsWith('xl/') : name.startsWith('ppt/slides/'));
  for (const [name, entry] of entries) {
    if (!wanted(name)) continue;
    const raw = entry.method === 0 ? entry.data : entry.method === 8 ? await inflate(entry.data) : null; if (!raw) continue;
    total += raw.length; if (total > 50 * 1024 * 1024) throw new Error('zip'); // zip-bomba
    texts.set(name, utf8.decode(raw));
  }
  const zip = { names: [...entries.keys()], text: name => texts.get(name) ?? null };
  return ext === 'docx' ? NurimOffice.docxText(zip) : ext === 'xlsx' ? NurimOffice.xlsxText(zip) : NurimOffice.pptxText(zip);
}
function plainText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  const utf8 = new TextDecoder().decode(bytes).replace(/^﻿/, ''); const broken = (utf8.match(/�/g) || []).length;
  return broken > 3 && broken > utf8.length / 200 ? new TextDecoder('windows-1251').decode(bytes) : utf8;
}
async function prepareFile(file) {
  const name = String(file.name || 'fayl').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'fayl';
  if (!file.size) throw new UserError(`${name}: fayl bo‘sh.`);
  if (file.size > LIMITS.input) throw new UserError(`${name}: fayl juda katta (${mb(LIMITS.input)} gacha).`);
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase();
  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif', 'gif'].includes(ext)) return prepareImage(file, name, ext);
  if (file.type === 'application/pdf' || ext === 'pdf') { if (file.size > LIMITS.pdf) throw new UserError(`${name}: PDF juda katta (${mb(LIMITS.pdf)} gacha).`); return { name, ext: 'pdf', kind: 'pdf', mime: 'application/pdf', data: await toBase64(file), size: file.size }; }
  if (['doc', 'xls', 'ppt'].includes(ext)) throw new UserError(`${name}: eski .${ext} formatini o‘qiy olmayman. .${ext}x yoki PDF qilib saqlang.`);
  let text;
  try { if (['docx', 'xlsx', 'pptx'].includes(ext)) text = await officeText(file, ext); else if (TEXT_EXT.has(ext) || file.type.startsWith('text/')) text = plainText(await file.arrayBuffer()); }
  catch { throw new UserError(`${name}: faylni o‘qib bo‘lmadi. U buzilgan yoki parol bilan himoyalangan bo‘lishi mumkin.`); }
  if (text === undefined) throw new UserError(`${name}: bu turdagi fayl qo‘llab-quvvatlanmaydi. Rasm, PDF, Word, Excel, PowerPoint yoki matn yuboring.`);
  if (!text.trim()) throw new UserError(`${name}: faylda o‘qiladigan matn topilmadi.`);
  const cut = text.length > LIMITS.text;
  return { name, ext: ext || 'txt', kind: 'text', text: cut ? text.slice(0, LIMITS.text) : text, size: Math.min(text.length, LIMITS.text), note: cut ? `Faqat dastlabki ${LIMITS.text.toLocaleString('uz')} belgi olindi.` : '' };
}
function checkFits(next) {
  if (files.length >= LIMITS.files) throw new UserError(`Bitta suhbatda ${LIMITS.files} tagacha fayl bo‘lishi mumkin.`);
  const all = [...files, next];
  if (all.reduce((n, f) => n + (f.kind === 'text' ? 0 : f.size), 0) > LIMITS.totalBinary) throw new UserError(`Rasm va PDF’lar jami ${mb(LIMITS.totalBinary)} dan oshmasin.`);
  if (all.reduce((n, f) => n + (f.kind === 'text' ? f.text.length : 0), 0) > LIMITS.totalText) throw new UserError('Hujjatlardagi matn juda ko‘p. Keraksiz faylni olib tashlang.');
}
async function addFiles(list) {
  const errors = []; let added = 0;
  for (const file of [...list].slice(0, LIMITS.files)) { try { const f = await prepareFile(file); checkFits(f); f.id = String(++fileSeq); files.push(f); added++; if (f.note) errors.push(`${f.name}: ${f.note}`); } catch (e) { errors.push(e instanceof UserError ? e.message : `${file.name}: faylni qo‘shib bo‘lmadi.`); } }
  renderFiles(); notice(errors.join('\n')); if (added) mood('catch'); else if (errors.length) mood('sad');
}

// --- Qahramon: 2D Pufak (Ustozim Nurim brendi). Bo'sh ekranda katta, suhbatda pastdagi kichik "dock"da; har holatga o'z rasmi. ---
const ONCE = new Set(['happy', 'wave', 'sad', 'catch']);
const DOCK_TEXT = { think: 'O‘ylayapman…', talk: 'Gapiryapman…', listen: 'Tinglayapman…', happy: 'Tayyor!', sad: 'Afsus…', catch: 'Oldim!', wave: 'Salom!' };
const ART = { idle: 'pufak', listen: 'pufak', wave: 'pufak', think: 'think', talk: 'talk', happy: 'happy', sad: 'sad', catch: 'catch', sleep: 'sleep' }; // asosiy rasmda Pufak qo'l silkitib turibdi
let moodBase = 'idle', moodTicket = 0;
function show(img, name, onDone) {
  const ticket = ++moodTicket; img.src = `pufak/${ART[name] || 'pufak'}.webp`; img.dataset.mood = name;
  img.classList.remove('pop'); void img.offsetWidth; if (name !== 'idle') img.classList.add('pop'); // bir martalik sakrash
  if (onDone) setTimeout(() => { if (ticket === moodTicket) onDone(); }, 1600);
}
function mood(name) {
  if (['think', 'talk', 'listen'].includes(name)) moodBase = name; else if (['idle', 'happy', 'sad'].includes(name)) moodBase = 'idle'; // javob yoki xato o'ylashni tugatadi
  const back = ONCE.has(name) ? () => mood(moodBase) : null;
  if (!$('welcome').hidden) { $('dock').hidden = true; show($('hero-still'), name, back); return; } // bo'sh suhbatda katta qahramon javob beradi
  if (name === 'idle' && !busy) { $('dock').hidden = true; return; }
  $('dock').hidden = false; $('dock').dataset.mood = name; $('dock-text').textContent = DOCK_TEXT[name] || ''; show($('dock-still'), name, back);
}
function heroIdle() { if (!$('welcome').hidden) show($('hero-still'), 'idle'); }
function heroStop() {} // 2D rasmda to'xtatadigan narsa yo'q; pastdagi "dock" o'z taymerini tugatib, o'zi yopiladi

// --- window.nurim: desktop bilan bir xil API ---
const ok = fn => async (...args) => { try { return { ok: true, data: await fn(...args) }; } catch (e) { return { ok: false, error: e?.name === 'AbortError' ? 'Javob to‘xtatildi.' : e instanceof UserError ? e.message : 'Amal bajarilmadi. Qayta urinib ko‘ring.' }; } };
const listeners = { panel: [], reminder: [] };
async function speakText(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1200) throw new UserError('Ovoz uchun matn noto‘g‘ri.');
  if (QA) return { mime: 'audio/wav', audio: btoa(String.fromCharCode(...new Uint8Array(encodeWav(new Float32Array(4800).map((_, i) => Math.sin(i / 8) * 0.1), 16000)))) };
  const r = await gateway('/speak', { deviceId, text }, null, 70000);
  if (!r.ok) throw new UserError({ 404: 'Ovozli javob uchun server hali yangilanmagan.', 429: 'Bugungi ovozli javoblar limiti tugadi. Ertaga yana tinglay olasiz.' }[r.status] || 'Ovozli javob hozir ishlamayapti.');
  if (typeof r.data.audio !== 'string' || !/^audio\//.test(String(r.data.mime))) throw new UserError('Ovozli javob o‘qilmadi.');
  return { mime: r.data.mime, audio: r.data.audio };
}
async function makeExercise(options) {
  if (controller || generating) throw new UserError('Avvalgi javobni kuting.');
  const kind = options?.kind === 'cards' ? 'cards' : 'quiz', fromChat = options?.fromChat === true, topic = typeof options?.topic === 'string' ? options.topic.trim().slice(0, 300) : '';
  if (!fromChat && !topic) throw new UserError('Mavzuni yozing.');
  if (fromChat && !history.length && !files.length) throw new UserError('Suhbat hali bo‘sh: avval savol bering yoki fayl biriktiring, yoki mavzuni yozing.');
  const count = kind === 'quiz' ? ([5, 10, 15].includes(options?.count) ? options.count : 5) : ([10, 15, 20].includes(options?.count) ? options.count : 10);
  const prompt = kind === 'quiz' ? NurimPractice.quizPrompt({ topic, count, level: options?.level, fromChat }) : NurimPractice.cardsPrompt({ topic, count, fromChat });
  generating = new AbortController(); mood('think');
  try {
    const text = QA ? NurimPractice.sample(kind, 3) : (await askAI(prompt, { signal: generating.signal, withHistory: fromChat, withFiles: fromChat })).text;
    if (kind === 'quiz') { const q = NurimPractice.parseQuiz(text); mood('catch'); return { quiz: { ...q, topic: topic || q.title } }; }
    const cards = NurimPractice.parseCards(text); const deck = practice.addDeck(cards.title, cards.cards); mood('catch'); return { deck: deck.id, view: practice.view() };
  } catch (e) { mood(e?.name === 'AbortError' ? 'idle' : 'sad'); throw e; } finally { generating = null; if (!busy) mood('idle'); }
}
window.nurim = Object.freeze({
  send: ok(question => converse(question, {})),
  stop: ok(() => { controller?.abort(); generating?.abort(); }),
  sendVoice: ok((wav, seconds) => {
    if (!(wav instanceof ArrayBuffer) || wav.byteLength < 1000 || wav.byteLength > 4 * 1024 * 1024) throw new UserError('Ovoz yozuvi noto‘g‘ri yoki juda uzun (1 daqiqagacha).');
    const secs = Math.max(1, Math.min(60, Math.round(Number(seconds) || 1))); const bytes = new Uint8Array(wav); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return converse(VOICE_QUESTION, { display: `🎤 Ovozli savol (${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')})`, voice: true, extra: [{ kind: 'audio', name: 'Ovozli savol.wav', mime: 'audio/wav', data: btoa(s) }] });
  }),
  speak: ok(speakText), micAccess: ok(async () => true),
  petMood: ok(state => { if (['talk', 'listen', 'idle'].includes(state)) mood(state); }),
  practice: ok(() => practice.view()), practiceGenerate: ok(makeExercise),
  practiceDue: ok(deckId => practice.due(new Date(), typeof deckId === 'string' ? deckId : '')),
  practiceReview: ok((deckId, cardId, grade) => { practice.review(deckId, cardId, grade); return practice.view(); }),
  practiceQuizDone: ok(result => { practice.finishQuiz(result || {}); mood(result?.score >= Math.ceil((result?.total || 1) * 0.7) ? 'happy' : 'wave'); return practice.view(); }),
  practiceDeckDelete: ok(id => { practice.removeDeck(id); return practice.view(); }),
  practiceOptions: ok(value => { practice.setOptions(value || {}); scheduleReminders(); return practice.view(); }),
  practiceMood: ok(state => { if (['happy', 'sad'].includes(state)) mood(state); }),
  reminderAdd: ok(value => { practice.addReminder(value || {}); scheduleReminders(); return practice.view(); }),
  reminderDelete: ok(id => { practice.removeReminder(id); scheduleReminders(); return practice.view(); }),
  onPanel: callback => listeners.panel.push(callback), onReminder: callback => listeners.reminder.push(callback)
});

// --- Eslatmalar: Android'da tizim bildirishnomasi (ilova yopiq bo'lsa ham), veb-ilovada ochilganda ko'rsatiladi ---
const Notify = NATIVE ? window.capacitorLocalNotifications?.LocalNotifications : null;
const reminderId = text => { let h = 7; for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h % 2000000000) || 2; };
async function scheduleReminders() {
  if (!Notify) return;
  try {
    const pending = await Notify.getPending(); if (pending.notifications.length) await Notify.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    const s = practice.state, list = [];
    const at = (time, extra = {}) => { const [hour, minute] = time.split(':').map(Number); return { hour, minute, ...extra }; };
    if (s.practiceReminder.on) list.push({ id: 1, title: 'NurimAI · Kunlik mashq', body: 'Kunlik mashq vaqti! Bir necha kartochka yoki kichik test 🔥', schedule: { on: at(s.practiceReminder.time), allowWhileIdle: true }, extra: { panel: 'ustoz' } });
    for (const r of s.reminders) {
      const base = { id: reminderId(r.id), title: 'NurimAI · Eslatma', body: r.text, extra: { panel: 'ustoz' } };
      if (r.repeat === 'daily') list.push({ ...base, schedule: { on: at(r.time), allowWhileIdle: true } });
      else { const [y, m, d] = r.date.split('-').map(Number), [hh, mm] = r.time.split(':').map(Number), when_ = new Date(y, m - 1, d, hh, mm); if (when_ > new Date()) list.push({ ...base, schedule: { at: when_, allowWhileIdle: true } }); }
    }
    if (!list.length) return;
    if ((await Notify.checkPermissions()).display !== 'granted' && (await Notify.requestPermissions()).display !== 'granted') { notice('Eslatmalar uchun bildirishnomaga ruxsat bering (Sozlamalar → Ilovalar → NurimAI).'); return; }
    await Notify.schedule({ notifications: list });
  } catch { notice('Eslatmani rejalashtirib bo‘lmadi.'); }
}
function checkDueReminders() { if (Notify) return; for (const r of practice.dueReminders()) { notice(`⏰ ${r.text}`); listeners.reminder.forEach(cb => cb(r)); } }

// --- Ekran: salom, menyu, sahifalar ---
function greet() {
  const h = new Date().getHours(); $('greet').textContent = h >= 5 && h < 11 ? 'Xayrli tong!' : h < 17 ? 'Xayrli kun!' : h < 22 ? 'Xayrli kech!' : 'Tun bo‘lsa ham, shu yerdaman.';
  const p = practice.view(); practiceCard($('streak-chip'), p);
  $('drawer-streak').textContent = p.streak ? `${p.streak} kun ketma-ket` : 'Ustoz va do‘st'; $('due-badge').textContent = String(p.due); $('due-badge').hidden = !p.due;
}
// Bosh ekrandagi oltin "Kunlik mashq" kartasi: seriya, kutayotgan kartochkalar va o'q tugmasi.
function useIcon(id) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${id}`); svg.setAttribute('aria-hidden', 'true'); svg.append(use); return svg; }
function practiceCard(card, p) {
  const span = (className, ...kids) => { const s = document.createElement('span'); s.className = className; s.append(...kids); return s; };
  const title = document.createElement('strong'); title.textContent = 'Kunlik mashq';
  card.replaceChildren(span('practice-meta', useIcon('i-streak'), p.streak ? `${p.streak} kun ketma-ket` : 'Bugun boshlaymiz'), title,
    span('practice-sub', p.due ? `${p.due} ta kartochka takrorlashni kutyapti` : 'Kichik test yoki kartochkalar bilan'), span('practice-go', useIcon('i-arrow')));
  card.setAttribute('aria-label', `Kunlik mashq. ${p.streak ? `${p.streak} kun ketma-ket.` : ''} ${p.due ? `${p.due} ta kartochka kutyapti.` : ''}`.trim()); card.hidden = false;
}
function openDrawer() { renderHistory(); $('drawer').hidden = false; $('scrim').hidden = false; $('menu').setAttribute('aria-expanded', 'true'); $('history-search').blur(); }
function closeDrawer() { $('drawer').hidden = true; $('scrim').hidden = true; $('menu').setAttribute('aria-expanded', 'false'); }
function grow() { const q = $('question'); q.style.height = 'auto'; q.style.height = Math.min(150, q.scrollHeight) + 'px'; composerState(); }
function composerState() { const hasText = Boolean($('question').value.trim()); $('send').hidden = !hasText; $('mic').hidden = hasText; }
const finePointer = matchMedia('(pointer: fine)').matches; // telefonda Enter yangi qator, klaviaturali kompyuterda yuboradi
