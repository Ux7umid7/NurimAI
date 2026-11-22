// RAG (answers from the user's own documents): with 📁 on, NurimAI looks through the PDF, Word, PowerPoint, Excel and text files in
// the folders the user chose (their textbooks, notes, tasks), finds the passages that match the question and sends them with
// it, so the AI answers from those documents and names them. It runs on the computer: the files themselves never leave it,
// only the few passages that match. Search is BM25 over words with common Uzbek endings removed (fotosintezning → fotosintez).
const fs = require('node:fs'); const fsp = fs.promises; const path = require('node:path');
const { fullText, LIMITS } = require('./attachments.cjs');
const EXT = new Set(['pdf', 'docx', 'pptx', 'xlsx', 'txt', 'md', 'csv', 'html', 'htm']);
const SKIP = new Set(['node_modules', '$recycle.bin', 'system volume information']);
const LIMIT = Object.freeze({ files: 400, scanned: 20000, chunk: 900, overlap: 150, top: 4, chars: 7000, indexMs: 8000 });
const NAME = 'Hujjatlaringizdan parchalar';
// Uzbek grammar endings, longest first; a word keeps at least three letters.
const ENDINGS = ['laringizning', 'laringizdan', 'laringizni', 'laringizda', 'laringizga', 'larimizning', 'larining', 'laridagi', 'laridan', 'larning', 'larini', 'larida', 'lariga', 'larimiz', 'laring', 'larim', 'lardan', 'lardagi', 'larni', 'larda', 'larga', 'lari', 'lar', 'ingizning', 'ingizni', 'ingiz', 'imizning', 'imiz', 'ning', 'dagi', 'dan', 'ni', 'da', 'ga', 'ka', 'qa', 'ing', 'im', 'si', 'i'];
const STOP = new Set(['va', 'bu', 'u', 'shu', 'bilan', 'uchun', 'ham', 'nima', 'qanday', 'qaysi', 'qachon', 'qayerda', 'nega', 'necha', 'men', 'sen', 'biz', 'siz', 'ular', 'bir', 'deb', 'esa', 'yoki', 'lekin', 'emas', 'bor', 'yo\'q', 'kerak', 'haqida', 'ayt', 'aytib', 'ber', 'tushuntir', 'yozib', 'menga', 'iltimos', 'the', 'and', 'what', 'is', 'of', 'to', 'in', 'a', 'и', 'в', 'что', 'это', 'на', 'как']);
function stem(word) {
  for (const end of ENDINGS) if (word.length - end.length >= 3 && word.endsWith(end)) return word.slice(0, -end.length);
  return word;
}
function words(text) {
  return String(text).toLowerCase().replace(/[‘’`ʻʼ]/g, "'").split(/[^\p{L}\p{N}']+/u)
    .map(w => w.replace(/^'+|'+$/g, '')).filter(w => w.length >= 2 && !STOP.has(w)).map(stem);
}
// Passages of about LIMIT.chunk characters that overlap a little, cut at a paragraph or sentence where possible.
function chunks(text) {
  const clean = String(text).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim(), out = [];
  for (let at = 0; at < clean.length;) {
    let end = Math.min(clean.length, at + LIMIT.chunk);
    if (end < clean.length) { const cut = Math.max(clean.lastIndexOf('\n', end), clean.lastIndexOf('. ', end)); if (cut > at + LIMIT.chunk / 2) end = cut + 1; }
    out.push(clean.slice(at, end).trim());
    if (end >= clean.length) break;
    at = Math.max(at + 1, end - LIMIT.overlap);
  }
  return out.filter(Boolean);
}
// Read files are kept by path, size and date, so a second question does not read them again.
const known = new Map();
// The index is kept on the computer (indexFile, in the app's own data folder) so textbooks are read once, not at each launch:
// the passages' text by file path, size and date. Files that left the folders leave the index on the next save.
const loaded = new Set();
async function loadIndex(file) {
  if (!file || loaded.has(file)) return; loaded.add(file);
  try { const saved = JSON.parse(await fsp.readFile(file, 'utf8')); if (saved?.v === 1) for (const [id, texts] of Object.entries(saved.files || {})) if (!known.has(id) && Array.isArray(texts)) known.set(id, texts.map(t => ({ text: String(t), terms: words(t) }))); } catch { /* no index yet, or a broken one: it is rebuilt */ }
}
async function saveIndex(file, ids) {
  if (!file) return;
  const files = {}; for (const id of ids) if (known.has(id)) files[id] = known.get(id).map(p => p.text);
  const temp = `${file}.tmp`; await fsp.mkdir(path.dirname(file), { recursive: true }); await fsp.writeFile(temp, JSON.stringify({ v: 1, files })); await fsp.rename(temp, file);
}
// PDFs: textbooks are big, so a larger size is allowed; the text is read by PDF.js (pdf-text.cjs).
const PDF_BYTES = 80 * 1024 * 1024;
async function readText(full, bytes) {
  if (/\.pdf$/i.test(full)) { const { pdfText } = require('./pdf-text.cjs'); return pdfText(bytes); }
  return fullText(full, bytes);
}
class Library {
  // roots: [{ name, path }] (folders.cjs named()); read(full) → bytes; indexFile: where the index is kept (none in tests).
  constructor({ roots = [], read = full => fsp.readFile(full), now = Date.now, indexFile = null } = {}) { this.roots = roots; this.read = read; this.now = now; this.indexFile = indexFile; }
  async files() {
    const found = []; let scanned = 0;
    for (const root of this.roots) {
      const queue = [root.path];
      while (queue.length && found.length < LIMIT.files && scanned < LIMIT.scanned) {
        let entries; const dir = queue.shift(); try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
          if (++scanned > LIMIT.scanned || found.length >= LIMIT.files) break;
          if (e.name.startsWith('.') || e.name.startsWith('~$') || SKIP.has(e.name.toLowerCase()) || e.isSymbolicLink()) continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) queue.push(full);
          else if (EXT.has(path.extname(e.name).slice(1).toLowerCase())) found.push({ full, shown: `${root.name}/${path.relative(root.path, full).split(path.sep).join('/')}` });
        }
      }
    }
    return found;
  }
  // Every passage of every readable file; files read before are not read again. Stops after LIMIT.indexMs (the rest next time).
  async passages() {
    await loadIndex(this.indexFile);
    const started = this.now(), out = [], ids = []; let added = 0;
    for (const file of await this.files()) {
      let stat; try { stat = await fsp.stat(file.full); } catch { continue; }
      if (stat.size > (/\.pdf$/i.test(file.full) ? PDF_BYTES : LIMITS.inputBytes)) continue;
      const id = `${file.full}|${stat.size}|${stat.mtimeMs}`; let parts = known.get(id); ids.push(id);
      if (!parts) {
        if (this.now() - started > LIMIT.indexMs) continue;
        let text = null; try { text = await readText(file.full, await this.read(file.full)); } catch { text = null; }
        parts = text?.trim() ? chunks(text).map(t => ({ text: t, terms: words(t) })) : [];
        if (known.size > 3000) known.clear();
        known.set(id, parts); added++;
      }
      for (const p of parts) out.push({ ...p, shown: file.shown });
    }
    if (added) await saveIndex(this.indexFile, ids).catch(() => {});
    return out;
  }
  // → { file: a text attachment with the best passages, sources: [file names] } or null when nothing fits the question.
  async find(question) {
    const query = [...new Set(words(question))];
    if (!query.length || !this.roots.length) return null;
    const all = await this.passages(); if (!all.length) return null;
    const df = new Map(); let total = 0;
    for (const p of all) { total += p.terms.length; for (const t of new Set(p.terms)) df.set(t, (df.get(t) || 0) + 1); }
    const avg = total / all.length, k1 = 1.2, b = 0.75, need = Math.min(2, query.length);
    const scored = [];
    for (const p of all) {
      const tf = new Map(); for (const t of p.terms) if (query.includes(t)) tf.set(t, (tf.get(t) || 0) + 1);
      if (tf.size < need) continue;
      let score = 0;
      for (const [t, f] of tf) { const idf = Math.log(1 + (all.length - df.get(t) + 0.5) / (df.get(t) + 0.5)); score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * p.terms.length / avg)); }
      scored.push({ ...p, score });
    }
    if (!scored.length) return null;
    scored.sort((x, y) => y.score - x.score);
    const picked = []; let chars = 0;
    for (const p of scored) { if (picked.length >= LIMIT.top || chars + p.text.length > LIMIT.chars) break; picked.push(p); chars += p.text.length; }
    const sources = [...new Set(picked.map(p => p.shown))];
    const text = ['Foydalanuvchi ruxsat bergan papkalardagi hujjatlardan savolga eng mos parchalar:', ...picked.map(p => `[${sources.indexOf(p.shown) + 1}] ${p.shown}\n"""\n${p.text}\n"""`)].join('\n\n');
    return { file: { kind: 'text', name: NAME, text }, sources };
  }
}
module.exports = { Library, words, stem, chunks, LIMIT, NAME };
