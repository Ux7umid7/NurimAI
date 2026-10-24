// Turns files the user explicitly shares (picker, drag-and-drop, paste, screen capture) into chat attachments.
// Images and PDFs are sent as-is to Gemini; Office and text files are converted to plain text locally.
const zlib = require('node:zlib');
const { UserError } = require('./router.cjs');
const { docxText, xlsxText, pptxText } = require('./shared/office-core.js'); // shared with the phone app

const LIMITS = Object.freeze({ files: 5, inputBytes: 15 * 1024 * 1024, pdfBytes: 7 * 1024 * 1024, imageBytes: 4 * 1024 * 1024, textChars: 60000, totalTextChars: 120000, totalBinaryBytes: 9 * 1024 * 1024, zipEntryBytes: 50 * 1024 * 1024 });
const IMAGE_MIME = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' });
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'css', 'sql', 'yaml', 'yml', 'ini', 'log', 'srt', 'php', 'go', 'rb', 'kt', 'swift']);
const OLD_OFFICE = Object.freeze({ doc: 'Word', xls: 'Excel', ppt: 'PowerPoint' });
const PICKER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'pdf', 'docx', 'xlsx', 'pptx', ...TEXT_EXT];

const extension = name => (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase();
const mb = bytes => `${Math.round(bytes / 1024 / 1024)} MB`;

// Minimal ZIP reader (no ZIP64) for .docx/.xlsx/.pptx; output size is capped against zip bombs.
function readZip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('zip');
  const count = buf.readUInt16LE(end + 10); let p = buf.readUInt32LE(end + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), offset = buf.readUInt32LE(p + 42);
    entries.set(buf.toString('utf8', p + 46, p + 46 + nameLen), { method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const read = name => {
    const e = entries.get(name); if (!e) return null;
    const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
    const data = buf.subarray(start, start + e.size);
    if (e.method === 0) return data;
    if (e.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: LIMITS.zipEntryBytes });
    throw new Error('zip');
  };
  return { names: [...entries.keys()], text: name => read(name)?.toString('utf8') ?? null };
}

function plainText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2);
  const utf8 = buf.toString('utf8').replace(/^﻿/, '');
  const broken = (utf8.match(/�/g) || []).length;
  return broken > 3 && broken > utf8.length / 200 ? new TextDecoder('windows-1251').decode(buf) : utf8; // CSV saved by Russian-locale Excel
}

// imageTool(bytes, mime) -> { mime, data: Buffer, thumb?: dataURL } re-encodes large images; injected so this module stays testable.
async function prepare({ name, bytes, imageTool = async (data, mime) => ({ mime, data }) }) {
  name = String(name || 'fayl').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'fayl';
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (!bytes.length) throw new UserError(`${name}: fayl bo‘sh.`);
  if (bytes.length > LIMITS.inputBytes) throw new UserError(`${name}: fayl juda katta (${mb(LIMITS.inputBytes)} gacha).`);
  const ext = extension(name);
  const magic = bytes.subarray(0, 12);
  const isPdf = magic.toString('latin1', 0, 5) === '%PDF-', isZip = bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50;
  const imageMime = magic[0] === 0x89 && magic.toString('latin1', 1, 4) === 'PNG' ? 'image/png' : magic[0] === 0xff && magic[1] === 0xd8 ? 'image/jpeg' : magic.toString('latin1', 0, 4) === 'RIFF' && magic.toString('latin1', 8, 12) === 'WEBP' ? 'image/webp' : IMAGE_MIME[ext] && ['heic', 'heif'].includes(ext) ? IMAGE_MIME[ext] : null;

  if (imageMime) {
    const image = await imageTool(bytes, imageMime);
    if (image.data.length > LIMITS.imageBytes) throw new UserError(`${name}: rasm juda katta. Kichikroq rasm yuboring.`);
    return { name, ext: ext || imageMime.split('/')[1], kind: 'image', mime: image.mime, data: image.data.toString('base64'), size: image.data.length, thumb: image.thumb || '' };
  }
  if (isPdf) {
    if (bytes.length > LIMITS.pdfBytes) throw new UserError(`${name}: PDF juda katta (${mb(LIMITS.pdfBytes)} gacha). Kerakli sahifalarni alohida PDF qilib yuboring.`);
    return { name, ext: 'pdf', kind: 'pdf', mime: 'application/pdf', data: bytes.toString('base64'), size: bytes.length };
  }
  if (OLD_OFFICE[ext]) throw new UserError(`${name}: eski .${ext} formatini o‘qiy olmayman. ${OLD_OFFICE[ext]}’da “Save as” orqali .${ext}x yoki PDF qilib saqlang.`);
  let text;
  try {
    if (isZip && ['docx', 'xlsx', 'pptx'].includes(ext)) { const zip = readZip(bytes); text = ext === 'docx' ? docxText(zip) : ext === 'xlsx' ? xlsxText(zip) : pptxText(zip); }
    else if (TEXT_EXT.has(ext) || (!isZip && !ext)) text = plainText(bytes);
  } catch { throw new UserError(`${name}: faylni o‘qib bo‘lmadi. U buzilgan yoki parol bilan himoyalangan bo‘lishi mumkin.`); }
  if (text === undefined) throw new UserError(`${name}: bu turdagi fayl qo‘llab-quvvatlanmaydi. Rasm, PDF, Word, Excel, PowerPoint yoki matn fayli yuboring.`);
  if (!text.trim()) throw new UserError(`${name}: faylda o‘qiladigan matn topilmadi.${ext === 'docx' || ext === 'pptx' ? ' Agar unda faqat rasmlar bo‘lsa, PDF qilib yuboring.' : ''}`);
  const cut = text.length > LIMITS.textChars;
  return { name, ext: ext || 'txt', kind: 'text', text: cut ? text.slice(0, LIMITS.textChars) : text, size: Math.min(text.length, LIMITS.textChars), note: cut ? `Faqat dastlabki ${LIMITS.textChars.toLocaleString('uz')} belgi olindi.` : '' };
}

// Checks a new attachment against the ones already in the conversation.
function checkFits(existing, next) {
  if (existing.length >= LIMITS.files) throw new UserError(`Bitta suhbatda ${LIMITS.files} tagacha fayl bo‘lishi mumkin. Keraksizini olib tashlang.`);
  const all = [...existing, next];
  if (all.reduce((n, f) => n + (f.kind === 'text' ? 0 : f.size), 0) > LIMITS.totalBinaryBytes) throw new UserError(`Rasm va PDF’lar jami ${mb(LIMITS.totalBinaryBytes)} dan oshmasin. Keraksizini olib tashlang.`);
  if (all.reduce((n, f) => n + (f.kind === 'text' ? f.text.length : 0), 0) > LIMITS.totalTextChars) throw new UserError('Hujjatlardagi matn juda ko‘p. Keraksiz faylni olib tashlang yoki kichikroq qismini yuboring.');
}

const forRequest = files => files.map(f => f.kind === 'text' ? { kind: 'text', name: f.name, text: f.text } : { kind: f.kind, name: f.name, mime: f.mime, data: f.data });
const forView = files => files.map(({ id, name, ext, kind, size, thumb, note }) => ({ id, name, ext, kind, size, thumb: thumb || '', note: note || '' }));

module.exports = { prepare, checkFits, forRequest, forView, readZip, LIMITS, PICKER_EXTENSIONS };
