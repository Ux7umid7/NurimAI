const fs = require('node:fs');
const path = require('node:path');
const { ORDER, UserError } = require('./router.cjs');
const defaults = () => ({ keys: { Gemini:'',Groq:'',OpenRouter:'' }, free: { Gemini:false,Groq:false }, autoFallback:true, topmost:true, autoUpdate:true, remember:true, usePersonalKeys:false, saveHistory:true, autoSpeak:true, petPosition:null, lastVersion:'', deviceId:require('node:crypto').randomUUID() });
class Store {
  constructor(directory, crypto) { this.directory = directory; this.file = path.join(directory,'settings.json'); this.crypto = crypto; this.value = defaults(); this.warning = ''; }
  load() {
    if (!fs.existsSync(this.file)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.file,'utf8'));
      for (const field of ['autoFallback','topmost','autoUpdate','remember','usePersonalKeys','saveHistory','autoSpeak']) if(typeof data[field] === 'boolean') this.value[field] = data[field];
      if(typeof data.lastVersion === 'string' && /^\d+\.\d+\.\d+$/.test(data.lastVersion)) this.value.lastVersion = data.lastVersion;
      if(typeof data.deviceId === 'string' && /^[a-f0-9-]{36}$/i.test(data.deviceId)) this.value.deviceId = data.deviceId;
      for(const p of ['Gemini','Groq']) this.value.free[p] = data.free?.[p] === true;
      if (Number.isFinite(data.petPosition?.x) && Number.isFinite(data.petPosition?.y)) this.value.petPosition = data.petPosition;
      for(const p of ORDER) if(typeof data.encryptedKeys?.[p] === 'string') {
        try { this.value.keys[p] = this.crypto.decryptString(Buffer.from(data.encryptedKeys[p],'base64')); }
        catch { this.warning = 'Saqlangan kalitni ochib bo‘lmadi. Sozlamalarda qayta kiriting.'; }
      }
    } catch { this.warning = 'Sozlamalar fayli o‘qilmadi. Kalitlarni Sozlamalarda qayta kiriting.'; }
  }
  public() { const { keys, ...value } = this.value; return { ...value, configured: Object.fromEntries(ORDER.map(p => [p,Boolean(keys[p])])), warning: this.warning }; }
  save(candidate = this.value) {
    const encryptedKeys = {};
    if (candidate.remember && ORDER.some(p => candidate.keys[p])) {
      if (!this.crypto.isEncryptionAvailable()) throw new UserError('Tizimning kalit shifrlashi mavjud emas. Kalitlarni eslab qolishni o‘chiring.');
      for(const p of ORDER) if(candidate.keys[p]) encryptedKeys[p] = this.crypto.encryptString(candidate.keys[p]).toString('base64');
    }
    const { keys, ...persisted } = candidate;
    fs.mkdirSync(this.directory,{recursive:true});
    const temp = this.file + '.tmp'; fs.writeFileSync(temp,JSON.stringify({...persisted,encryptedKeys}),{mode:0o600}); fs.renameSync(temp,this.file);
    this.value = candidate;
  }
  update(input) {
    if(!input || typeof input !== 'object') throw new UserError('Sozlamalar noto‘g‘ri.');
    const next = { ...this.value, keys:{...this.value.keys}, free:{...this.value.free} };
    for(const field of ['autoFallback','topmost','autoUpdate','remember','usePersonalKeys','saveHistory','autoSpeak']) if(typeof input[field] === 'boolean') next[field] = input[field];
    for(const p of ORDER) {
      if(input.clear?.[p] === true) next.keys[p] = '';
      const key = input.keys?.[p];
      if(key !== undefined && typeof key !== 'string') throw new UserError('Kalit noto‘g‘ri.');
      if(key?.trim()) { if(key.trim().length > 512 || /\s/.test(key.trim())) throw new UserError('Kalitda bo‘sh joy bo‘lmasligi kerak.'); next.keys[p] = key.trim(); }
      if(p !== 'OpenRouter') { if(typeof input.free?.[p] === 'boolean') next.free[p] = input.free[p]; if(next.keys[p] && !next.free[p]) throw new UserError(`${p} uchun bepul tarifni tasdiqlang.`); }
    }
    this.save(next); this.warning = ''; return this.public();
  }
}
module.exports = { Store, defaults };
