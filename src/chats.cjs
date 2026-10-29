const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { UserError } = require('./router.cjs');
// Suhbatlar tarixi: faqat shu kompyuterda, tizim shifrlashi (safeStorage) bilan. Fayl matnlari saqlanmaydi, faqat nomlari.
const LIMITS = Object.freeze({ chats: 100, messages: 300, text: 30000, title: 70 });
const APOSTROPHES = /[‘’ʻʼ`´]/;
const norm = text => [...text].map(c => APOSTROPHES.test(c) ? "'" : c.toLowerCase().length === 1 ? c.toLowerCase() : c).join(''); // har belgi bitta belgi bo'lib qoladi: topilgan joy asl matnga mos keladi
const oneLine = text => String(text).replace(/\s+/g, ' ').trim();
function cleanMessage(m) {
  if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string') return null;
  const out = { role: m.role, text: m.text.slice(0, LIMITS.text) };
  if (Array.isArray(m.files) && m.files.length) out.files = m.files.slice(0, 5).filter(f => typeof f?.name === 'string').map(f => ({ name: f.name.slice(0, 120), ext: String(f.ext || '').slice(0, 8), kind: String(f.kind || '').slice(0, 8) }));
  if (m.error === true) out.error = true;
  // A referat or presentation NurimAI made: only its name and where it was saved (Documents\NurimAI), never its content.
  if (m.doc && typeof m.doc.name === 'string' && typeof m.doc.path === 'string' && /^(docx|pptx)$/.test(m.doc.kind)) out.doc = { name: m.doc.name.slice(0, 160), path: m.doc.path.slice(0, 600), kind: m.doc.kind };
  return out;
}
function cleanChat(c) {
  if (!c || typeof c.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(c.id) || !Array.isArray(c.messages)) return null;
  const messages = c.messages.map(cleanMessage).filter(Boolean).slice(-LIMITS.messages);
  if (!messages.length) return null;
  const first = messages.find(m => m.role === 'user');
  return { id: c.id, title: oneLine(first?.text || 'Suhbat').slice(0, LIMITS.title), created: Number(c.created) || Date.now(), updated: Number(c.updated) || Date.now(), messages };
}
function snippet(text, at, length) {
  const start = Math.max(0, at - 30);
  return (start ? '…' : '') + oneLine(text.slice(start, at + length + 60)) + (at + length + 60 < text.length ? '…' : '');
}
class Chats {
  constructor(directory, crypto) { this.file = path.join(directory, 'chats.bin'); this.directory = directory; this.crypto = crypto; this.list = []; this.warning = ''; }
  get available() { return this.crypto.isEncryptionAvailable(); }
  load() {
    this.list = []; this.warning = '';
    if (!fs.existsSync(this.file)) return;
    if (!this.available) { this.warning = 'Tizim shifrlashi mavjud emas, suhbatlar tarixi ochilmadi.'; return; }
    try {
      const data = JSON.parse(this.crypto.decryptString(fs.readFileSync(this.file)));
      this.list = (Array.isArray(data) ? data : []).map(cleanChat).filter(Boolean).sort((a, b) => b.updated - a.updated).slice(0, LIMITS.chats);
    } catch { this.warning = 'Suhbatlar tarixini o‘qib bo‘lmadi.'; }
  }
  save() {
    if (!this.available) throw new UserError('Tizim shifrlashi mavjud emas, suhbatlar tarixi saqlanmadi.');
    fs.mkdirSync(this.directory, { recursive: true });
    if (!this.list.length) { fs.rmSync(this.file, { force: true }); return; }
    const temp = this.file + '.tmp'; fs.writeFileSync(temp, this.crypto.encryptString(JSON.stringify(this.list)), { mode: 0o600 }); fs.renameSync(temp, this.file);
  }
  static newId() { return randomUUID(); }
  upsert(id, messages, now = Date.now()) {
    const old = this.list.find(c => c.id === id);
    const chat = cleanChat({ id, messages, created: old?.created || now, updated: now });
    if (!chat) return;
    this.list = [chat, ...this.list.filter(c => c.id !== id)].slice(0, LIMITS.chats);
    this.save();
  }
  get(id) { return this.list.find(c => c.id === id) || null; }
  remove(id) { const before = this.list.length; this.list = this.list.filter(c => c.id !== id); if (this.list.length !== before) this.save(); }
  clear() { this.list = []; this.save(); }
  // Ro'yxat: sarlavha, sana, xabarlar soni va qisqa parcha (qidiruvda - topilgan joy atrofi).
  search(query = '') {
    const q = norm(oneLine(typeof query === 'string' ? query : '').slice(0, 100));
    const out = [];
    for (const c of this.list) {
      const answer = c.messages.find(m => m.role === 'assistant' && !m.error);
      let preview = answer ? snippet(answer.text, 0, 40) : '';
      if (q) {
        const titleHit = norm(c.title).includes(q);
        const hit = c.messages.find(m => norm(m.text).includes(q));
        if (!titleHit && !hit) continue;
        if (hit) preview = snippet(hit.text, norm(hit.text).indexOf(q), q.length);
      }
      out.push({ id: c.id, title: c.title, updated: c.updated, count: c.messages.length, preview: preview.slice(0, 160) });
    }
    return out;
  }
}
module.exports = { Chats, LIMITS, norm };
