const fs = require('node:fs');
const path = require('node:path');
const { mergeFacts, MAX_FACTS, MAX_LENGTH } = require('./shared/memory.js');
// Xotira: foydalanuvchi o‘zi haqida aytgan qisqa faktlar (ism, sinf, qiziqishlar), faqat shu kompyuterda, tizim shifrlashi bilan.
// Shifrlash bo‘lmasa, xotira faqat dastur ochiq turganda ishlaydi va diskka yozilmaydi.
class Memory {
  constructor(directory, crypto) { this.file = path.join(directory, 'memory.bin'); this.directory = directory; this.crypto = crypto; this.enabled = true; this.facts = []; }
  get available() { return this.crypto.isEncryptionAvailable(); }
  load() {
    if (!fs.existsSync(this.file) || !this.available) return;
    try {
      const data = JSON.parse(this.crypto.decryptString(fs.readFileSync(this.file)));
      this.enabled = data.enabled !== false;
      this.facts = (Array.isArray(data.facts) ? data.facts : []).filter(f => typeof f?.text === 'string' && f.text.trim()).map(f => ({ text: f.text.slice(0, MAX_LENGTH), at: Number(f.at) || 0 })).slice(-MAX_FACTS);
    } catch {} // an unreadable memory starts empty: it is a convenience, never a reason not to answer
  }
  save() {
    if (!this.available) return;
    fs.mkdirSync(this.directory, { recursive: true });
    const temp = this.file + '.tmp'; fs.writeFileSync(temp, this.crypto.encryptString(JSON.stringify({ enabled: this.enabled, facts: this.facts })), { mode: 0o600 }); fs.renameSync(temp, this.file);
  }
  // What goes with a question: the facts as text, or undefined when memory is off (then the AI is not asked to note anything).
  forQuestion() { return this.enabled ? this.facts.map(f => f.text) : undefined; }
  add(texts, now = Date.now()) { if (!this.enabled || !texts?.length) return; this.facts = mergeFacts(this.facts, texts, now); this.save(); }
  remove(index) { if (Number.isInteger(index) && index >= 0 && index < this.facts.length) { this.facts.splice(index, 1); this.save(); } }
  clear() { this.facts = []; this.save(); }
  setEnabled(on) { this.enabled = on === true; this.save(); }
  view() { return { enabled: this.enabled, facts: this.facts.map(f => f.text), persistent: this.available }; }
}
module.exports = { Memory };
