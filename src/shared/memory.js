// Long-term memory of NurimAI's AI: short facts a user told about themself (name, grade, interests, goals, how they like
// explanations). Each place keeps its own list (desktop: encrypted file, phone: localStorage, Telegram: the server per user)
// and sends it with each question; nothing extra is asked of the AI: its answer ends with a "XOTIRA: …" line when there is
// something new, and that line is taken out. Shared by the router (Node and the Worker) and the phone app (browser).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.NurimMemory = factory(); })(typeof self !== 'undefined' ? self : this, function () {
const MAX_FACTS = 15, MAX_LENGTH = 160;
const MEMORY_ASK = 'Agar foydalanuvchi shu xabarida o‘zi haqida keyin ham kerak bo‘ladigan yangi ma’lumot aytsa (ismi, yoshi, sinfi yoki kursi, maktabi, qiziqishlari, maqsadi, qanday tushuntirish yoqishi) yoki «eslab qol» desa, javobing oxirida alohida qatorda «XOTIRA: …» deb qisqa yoz (bir nechta bo‘lsa «;» bilan). Bunday yangi ma’lumot bo‘lmasa, bu qatorni umuman yozma.';
function memoryNote(facts) { return facts && facts.length ? `[Foydalanuvchi haqida avval aytilganlar — hisobga ol, lekin har javobda qaytarib aytma: ${facts.map(f => typeof f === 'string' ? f : f.text).join('; ')}]` : ''; }
// The question as the AI gets it: what is remembered, the question, and the request to note anything new.
function withMemory(question, facts) { return [memoryNote(facts), question, MEMORY_ASK].filter(Boolean).join('\n\n'); }
const LINE = /^[ \t]*[*_]*XOTIRA[*_]*[ \t]*:[ \t]*(.+)$/gim;
// The answer -> { text without the memory line, facts in it }.
function splitMemory(answer) {
  const facts = [];
  const text = String(answer).replace(LINE, (_, list) => { facts.push(...list.split(';')); return ''; }).replace(/\n{3,}/g, '\n\n').trim();
  return { text: text || String(answer).trim(), facts: facts.map(f => f.replace(/[*_«»"]/g, '').trim().replace(/[.;,]+$/, '')).filter(f => f.length >= 3 && !/^(yo['‘’]?q|none|-)$/i.test(f)).map(f => f.slice(0, MAX_LENGTH)) };
}
const key = text => String(text).toLowerCase().replace(/[‘’'`ʻʼ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// New facts are added (a repeat only refreshes its date); the oldest go once there are more than MAX_FACTS.
function mergeFacts(old = [], fresh = [], now = Date.now()) {
  const list = old.filter(f => !fresh.some(n => key(n) === key(f.text)));
  for (const text of fresh) if (!list.some(f => key(f.text) === key(text))) list.push({ text, at: now });
  return list.slice(-MAX_FACTS);
}
// What a client may send: up to MAX_FACTS short strings (anything else is dropped, never an error).
function cleanFacts(list) { return Array.isArray(list) ? list.filter(f => typeof f === 'string' && f.trim()).map(f => f.trim().slice(0, MAX_LENGTH)).slice(-MAX_FACTS) : []; }
return { MAX_FACTS, MAX_LENGTH, MEMORY_ASK, memoryNote, withMemory, splitMemory, mergeFacts, cleanFacts };
});
