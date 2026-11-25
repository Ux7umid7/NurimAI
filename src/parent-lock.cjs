// Ota-ona nazorati: with a parent's PIN set, a child cannot change Settings (API keys, the AI's folders, server and update
// options). The check runs here in the main process, not only in the window, so it cannot be skipped from the page. The PIN
// itself is never kept: only a scrypt hash with its own salt. The right PIN opens Settings for ten minutes; after five wrong
// tries the next one waits a minute. A forgotten PIN: remove parent-lock.json from the app's data folder (an adult's job).
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const { UserError } = require('./router.cjs');
const OPEN_MS = 10 * 60000, WAIT_MS = 60000, TRIES = 5;
const valid = pin => typeof pin === 'string' && /^\d{4,8}$/.test(pin);
const hash = (pin, salt) => crypto.scryptSync(pin, Buffer.from(salt, 'base64'), 32).toString('base64');
class ParentLock {
  constructor({ file, now = Date.now }) { this.file = file; this.now = now; this.openUntil = 0; this.wrong = 0; this.waitUntil = 0; this.saved = this.load(); }
  load() { try { const s = JSON.parse(fs.readFileSync(this.file, 'utf8')); return s?.v === 1 && s.salt && s.hash ? s : null; } catch { return null; } }
  get enabled() { return Boolean(this.saved); }
  get open() { return !this.enabled || this.now() < this.openUntil; }
  status() { return { enabled: this.enabled, open: this.open, minutes: this.enabled && this.open ? Math.max(1, Math.ceil((this.openUntil - this.now()) / 60000)) : 0, waitSeconds: Math.max(0, Math.ceil((this.waitUntil - this.now()) / 1000)) }; }
  // Throws when Settings are locked: called first by every protected IPC handler.
  check() { if (!this.open) throw new UserError('🔒 Sozlamalar ota-ona PIN-kodi bilan qulflangan. O‘zgartirish uchun PIN kiriting.'); }
  matches(pin) {
    if (this.now() < this.waitUntil) throw new UserError(`Juda ko‘p noto‘g‘ri urinish. ${Math.ceil((this.waitUntil - this.now()) / 1000)} soniyadan keyin qayta kiriting.`);
    const ok = valid(pin) && crypto.timingSafeEqual(Buffer.from(hash(pin, this.saved.salt), 'base64'), Buffer.from(this.saved.hash, 'base64'));
    if (ok) { this.wrong = 0; return true; }
    if (++this.wrong >= TRIES) { this.wrong = 0; this.waitUntil = this.now() + WAIT_MS; }
    return false;
  }
  unlock(pin) { if (!this.enabled) return this.status(); if (!this.matches(pin)) throw new UserError('PIN noto‘g‘ri.'); this.openUntil = this.now() + OPEN_MS; return this.status(); }
  lock() { this.openUntil = 0; return this.status(); }
  // A new PIN (4–8 digits, typed twice); changing it needs Settings open (the old PIN given within ten minutes).
  set(pin, again) {
    this.check();
    if (!valid(pin)) throw new UserError('PIN 4–8 ta raqamdan iborat bo‘lsin.');
    if (pin !== again) throw new UserError('Ikkala PIN bir xil emas.');
    const salt = crypto.randomBytes(16).toString('base64'), saved = { v: 1, salt, hash: hash(pin, salt) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true }); const temp = `${this.file}.tmp`; fs.writeFileSync(temp, JSON.stringify(saved)); fs.renameSync(temp, this.file);
    this.saved = saved; this.openUntil = this.now() + OPEN_MS; return this.status();
  }
  remove() { this.check(); fs.rmSync(this.file, { force: true }); this.saved = null; this.openUntil = 0; return this.status(); }
}
module.exports = { ParentLock, OPEN_MS, TRIES };
