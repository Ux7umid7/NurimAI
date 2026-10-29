// NurimAI's own Telegram bot: Telegram sends each update to POST /telegram (webhook), the AiGateway Durable Object answers it
// with the same router, persona and free-tier keys as the apps. Text, photos of problems, PDFs and voice messages are understood.
import mathModule from '../src/shared/math-text.js';
const { plainMath } = mathModule;

export const SITE = 'https://ux7umid7.github.io/NurimAI/';
export const VOICE_QUESTION = 'Bu ovozli xabar. Uni diqqat bilan tingla. Birinchi qatorda eshitganingni so‘zma-so‘z «Savolingiz: …» deb yoz, keyingi qatordan javob ber. Ovoz eshitilmasa yoki tushunarsiz bo‘lsa, shuni ayt.';
const HEARD = /^\s*\**\s*Savolingiz\s*:?\s*\**\s*[«"]?(.+?)[»"]?\s*\**\s*$/i;
export const TEXTS = Object.freeze({
  description: 'Salom! Men NurimAI — o‘zbekcha gapiradigan AI ustoz. Savolingizni yozing, masalani rasmga olib yuboring yoki ovozli xabar qoldiring: mavzuni oddiy tilda, qadamma-qadam tushuntirib beraman. Bepul.',
  short: 'O‘zbekcha AI ustoz: savol, rasm va ovozli xabarga javob beradi.',
  hello: '<b>Salom! Men NurimAI</b> — o‘zbekcha gapiradigan AI ustozingiz.\n\nMenga:\n• savolingizni <b>yozing</b>;\n• masala yoki matnni <b>rasmga olib</b> yuboring;\n• <b>ovozli xabar</b> qoldiring;\n• PDF yoki <b>stiker</b> yuboring.\n\nJavobni oddiy tilda, qadamma-qadam tushuntiraman. /referat va /taqdimot — Word va PowerPoint fayl, /yangiliklar — bugungi yangiliklar, /yangi — yangi suhbat, /yordam — yordam.',
  help: '<b>NurimAI nima qila oladi</b>\n\n• Istalgan mavzuni misollar bilan tushuntiradi.\n• Rasmdagi masalani yechish yo‘lini ko‘rsatadi.\n• Ovozli xabarni tinglab, javob beradi.\n• PDF hujjatni qisqacha tushuntiradi.\n• Stikeringizni ko‘rib, unga javob qaytaradi.\n• <b>Referat</b> (Word) va <b>taqdimot</b> (PowerPoint) tayyorlab, faylni yuboradi: /referat Fotosintez, /taqdimot Quyosh tizimi.\n• Yangilik, valyuta kursi, ob-havo va sport savollarida internetdan (Kun.uz, Gazeta.uz, Daryo.uz, BBC, Markaziy bank, Open-Meteo) ma’lumot olib, manbalarini ko‘rsatadi. /yangiliklar — bugungi asosiy yangiliklar.\n• Suhbat davomini eslab qoladi: /yangi bilan yangisini boshlang.\n• <b>Guruhga qo‘shing</b>: har kuni tanlangan mavzuda (masalan, Tarix 8-sinf yoki JavaScript) savol beraman, javoblarni tekshiraman va reyting yuritaman.\n\nTest, kartochkalar, kunlik mashq va ovozli javoblar NurimAI ilovasida: ' + SITE,
  fresh: 'Yangi suhbat boshlandi. Savolingizni yozing 🙂',
  unsupported: 'Hozircha matn, rasm, stiker, PDF va ovozli xabarni tushunaman. Word, Excel va boshqa fayllar uchun NurimAI ilovasidan foydalaning: ' + SITE,
  limit: 'Bugungi bepul savollar tugadi. Ertaga yana yozing yoki NurimAI ilovasidan foydalaning: ' + SITE,
  slow: 'Juda tez yozyapsiz 🙂 Bir daqiqadan keyin yana yuboring.',
  busy: 'Hozir juda ko‘p savol kelyapti. Bir ozdan keyin qayta yuboring.',
  failed: 'Hozir javob bera olmadim. Bir ozdan keyin qayta urinib ko‘ring.',
  big: 'Fayl juda katta. 5 MB gacha rasm yoki PDF yuboring.',
  long: 'Ovozli xabar 1 daqiqadan oshmasin.',
  rejected: 'Bu savolga javob bera olmayman. Boshqa savol bilan yordam beraman.',
  docUsage: { referat: 'Mavzuni ham yozing, masalan: /referat Fotosintez (yoki: /referat Amir Temur, 5 bet)', taqdimot: 'Mavzuni ham yozing, masalan: /taqdimot Quyosh tizimi (yoki: /taqdimot Suv aylanishi, 8 slayd)' },
  docFailed: 'Faylni tayyorlay olmadim. Bir ozdan keyin qayta urinib ko‘ring yoki mavzuni boshqacha yozing.'
});
export const MAX_FILE = 5 * 1024 * 1024;
export const NEWS_QUESTION = 'Bugungi eng muhim yangiliklarni internetdan qidirib, qisqacha aytib ber: avval O‘zbekiston, keyin dunyo. Har biri 1–2 gap, sanasi bilan.';

// The webhook's secret is derived from the bot token, so only one secret (TELEGRAM_TOKEN) has to be configured.
export async function webhookSecret(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nurimai-telegram-webhook:${token}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

export const displayName = from => String([from?.first_name, from?.last_name].filter(Boolean).join(' ') || (from?.username ? `@${from.username}` : 'Ishtirokchi')).slice(0, 40);
const GROUPS = new Set(['group', 'supergroup']);
// One incoming update -> what NurimAI has to do. Unknown updates return null and are ignored.
export function parseUpdate(update) {
  if (!update || !Number.isSafeInteger(update.update_id)) return null;
  const callback = update.callback_query;
  if (callback?.message?.chat && callback.from) return { kind: 'callback', updateId: update.update_id, id: callback.id, chatId: callback.message.chat.id, userId: callback.from.id, data: String(callback.data || '') };
  // The bot was added to a group or removed from it.
  const member = update.my_chat_member;
  if (member?.chat && GROUPS.has(member.chat.type)) {
    const was = member.old_chat_member?.status, now = member.new_chat_member?.status, out = s => !s || s === 'left' || s === 'kicked';
    if (out(was) !== out(now)) return { kind: out(now) ? 'left' : 'joined', updateId: update.update_id, chatId: member.chat.id, userId: member.from?.id || 0, title: String(member.chat.title || ''), private: false, group: true };
    return null;
  }
  const m = update.message;
  // An anonymous group admin writes as the group itself (from = GroupAnonymousBot); other bots and channel reposts are ignored.
  const anonymousAdmin = Boolean(m?.sender_chat && m.sender_chat.id === m.chat?.id);
  if (!m?.chat || !m.from || (m.from.is_bot && !anonymousAdmin) || m.is_automatic_forward) return null;
  const group = GROUPS.has(m.chat.type);
  if (group && m.migrate_to_chat_id) return { kind: 'migrated', updateId: update.update_id, chatId: m.chat.id, to: m.migrate_to_chat_id, private: false, group };
  const base = { updateId: update.update_id, chatId: m.chat.id, userId: m.from.id, private: m.chat.type === 'private', caption: typeof m.caption === 'string' ? m.caption.slice(0, 1000) : '',
    ...(group ? { group, title: String(m.chat.title || '').slice(0, 80), messageId: m.message_id, name: anonymousAdmin ? 'Admin' : displayName(m.from), replyTo: m.reply_to_message?.message_id || 0, replyToBot: Boolean(m.reply_to_message?.from?.is_bot), anonymousAdmin } : {}) };
  if (typeof m.text === 'string') {
    const command = /^\/(\w+)(?:@(\w+))?(?:\s|$)/.exec(m.text);
    if (command) return { ...base, kind: 'command', command: command[1].toLowerCase(), target: command[2] || '', args: m.text.slice(command[0].length).trim().slice(0, 200) };
    return { ...base, kind: 'text', text: m.text.slice(0, 4000) };
  }
  if (Array.isArray(m.photo) && m.photo.length) { const best = m.photo.filter(p => !p.file_size || p.file_size <= MAX_FILE).sort((a, b) => b.width * b.height - a.width * a.height)[0]; return best ? { ...base, kind: 'photo', fileId: best.file_id, mime: 'image/jpeg' } : { ...base, kind: 'too-big' }; }
  if (m.voice || m.audio) { const v = m.voice || m.audio; if ((v.duration || 0) > 60) return { ...base, kind: 'too-long' }; if (v.file_size > MAX_FILE) return { ...base, kind: 'too-big' }; return { ...base, kind: 'voice', fileId: v.file_id, mime: /^audio\/(ogg|mpeg|mp4|x-m4a|wav|aac)$/.test(v.mime_type || '') ? v.mime_type : 'audio/ogg' }; }
  if (m.document) {
    const d = m.document, mime = String(d.mime_type || '');
    if (mime !== 'application/pdf' && !/^image\/(png|jpeg|webp)$/.test(mime)) return { ...base, kind: 'unsupported' };
    if (d.file_size > MAX_FILE) return { ...base, kind: 'too-big' };
    return { ...base, kind: mime === 'application/pdf' ? 'pdf' : 'photo', fileId: d.file_id, mime, name: String(d.file_name || 'fayl').slice(0, 120) };
  }
  // A sticker is looked at as a picture: a still one directly, an animated or video one by its thumbnail; the emoji helps either way.
  if (m.sticker) { const s = m.sticker, still = !s.is_animated && !s.is_video; return { ...base, kind: 'sticker', emoji: String(s.emoji || '').slice(0, 8), fileId: still ? s.file_id : s.thumbnail?.file_id || '', mime: still ? 'image/webp' : 'image/jpeg' }; }
  if (m.video || m.video_note || m.animation || m.contact || m.location) return { ...base, kind: 'unsupported' };
  return null;
}

// The question NurimAI is asked, plus how the user's turn is remembered in the chat history.
export function questionFor(item) {
  if (item.kind === 'text') return { question: item.text, remember: item.text };
  if (item.kind === 'voice') return { question: VOICE_QUESTION, remember: '🎤 Ovozli savol' };
  if (item.kind === 'news') return { question: NEWS_QUESTION, remember: '📰 Bugungi yangiliklar' };
  if (item.kind === 'sticker') return { question: `Foydalanuvchi ${item.emoji ? `${item.emoji} emojili ` : ''}stiker yubordi${item.fileId ? '' : ' (rasmi yo‘q, faqat emoji)'}. Stikerdagi tasvir va kayfiyatni tushun, so‘ng unga qisqa (1–2 gap), iliq va o‘rinli javob qaytar; suhbat davom etayotgan bo‘lsa, shunga mos javob ber.`, remember: `🎭 Stiker ${item.emoji}`.trim() };
  if (item.kind === 'photo') return { question: item.caption || 'Rasmdagi masala yoki matnni qadamma-qadam tushuntirib ber.', remember: `🖼 Rasm${item.caption ? `: ${item.caption}` : ''}` };
  return { question: item.caption || 'Shu hujjatning qisqacha mazmunini yozib, asosiy fikrlarini tushuntirib ber.', remember: `📄 ${item.name || 'PDF'}${item.caption ? `: ${item.caption}` : ''}` };
}
// A voice answer starts with what was heard ("Savolingiz: ..."); it becomes the remembered question and an italic first line.
export function splitHeard(text) {
  const lines = text.split('\n'); const heard = HEARD.exec(lines[0] || '');
  return heard ? { heard: heard[1].trim().slice(0, 600), text: lines.slice(1).join('\n').trim() || text } : { heard: '', text };
}

export const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(line) { let out = '', last = 0; for (const m of line.matchAll(/\*\*([^*\n]+)\*\*|`([^`\n]+)`/g)) { out += escape(line.slice(last, m.index)) + (m[1] !== undefined ? `<b>${escape(m[1])}</b>` : `<code>${escape(m[2])}</code>`); last = m.index + m[0].length; } return out + escape(line.slice(last)); }
// The answer's light Markdown (as the apps render it) -> Telegram HTML; math LaTeX becomes plain text first.
export function toTelegramHtml(text) {
  const out = []; let code = null;
  for (const line of plainMath(text).split('\n')) {
    if (code !== null) { if (/^\s*```/.test(line)) { out.push(`<pre>${escape(code.join('\n'))}</pre>`); code = null; } else code.push(line); continue; }
    if (/^\s*```/.test(line)) { code = []; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { out.push('──────────'); continue; }
    const head = /^\s*#{1,4}\s+(.*)$/.exec(line); if (head) { out.push(`<b>${inline(head[1].replace(/\*\*/g, ''))}</b>`); continue; }
    const bullet = /^(\s*)[-*•]\s+(.*)$/.exec(line); if (bullet) { out.push(`${bullet[1]}• ${inline(bullet[2])}`); continue; }
    out.push(inline(line));
  }
  if (code !== null) out.push(`<pre>${escape(code.join('\n'))}</pre>`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Telegram allows 4096 characters per message: split the source between paragraphs/lines, never inside a code block.
export function splitAnswer(text, max = 3500) {
  const parts = []; let current = [], size = 0, fence = false;
  const flush = () => { if (!current.length) return; if (fence) current.push('```'); const part = current.join('\n').trim(); if (part && part !== '```\n```') parts.push(part); current = fence ? ['```'] : []; size = current.join('\n').length; };
  for (let line of text.split('\n')) {
    while (line.length > max) { flush(); current.push(line.slice(0, max)); size = max; flush(); line = line.slice(max); } // one overlong line
    if (size + line.length + 1 > max) flush();
    current.push(line); size += line.length + 1;
    if (/^\s*```/.test(line)) fence = !fence; // a code block split across messages is closed and reopened
  }
  fence = false; flush();
  return parts;
}
export const KEYBOARD = { inline_keyboard: [[{ text: '🆕 Yangi suhbat', callback_data: 'new' }, { text: '📱 NurimAI ilovasi', url: SITE }]] };
export const GROUP_LINK = 'https://t.me/NurimAI_bot?startgroup=quiz';
export const HELP_KEYBOARD = { inline_keyboard: [[{ text: '👥 Guruhga qo‘shish', url: GROUP_LINK }], ...KEYBOARD.inline_keyboard] };
// Answers built from the internet end with their sources as links; when the question had a topic, a button opens it on Google too.
export function sourcesHtml(reply) { return reply.sources?.length ? `\n\n<b>🔎 Manbalar:</b> ${reply.sources.map(s => `<a href="${escape(s.uri).replace(/"/g, '&quot;')}">${escape(s.title)}</a>`).join(' · ')}` : ''; }
export function keyboardFor(reply) { const query = reply.sources?.length && reply.queries?.[0]; return query ? { inline_keyboard: [[{ text: `🔎 Google: ${query.slice(0, 40)}`, url: `https://www.google.com/search?q=${encodeURIComponent(query)}` }], ...KEYBOARD.inline_keyboard] } : KEYBOARD; }

// Thin Bot API client (fetcher = the worker's logged fetch). Errors throw with Telegram's description.
export class TelegramBot {
  constructor(token, fetcher = fetch) { this.token = token; this.fetcher = fetcher; }
  async call(method, params = {}) {
    const response = await this.fetcher(`https://api.telegram.org/bot${this.token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (!data.ok) throw Object.assign(new Error(`telegram ${method}: ${String(data.description || response.status).slice(0, 160)}`), { status: response.status });
    return data.result;
  }
  async download(fileId) {
    const file = await this.call('getFile', { file_id: fileId }); const ext = String(file?.file_path || '').split('.').pop().toLowerCase();
    if (!file?.file_path || file.file_size > MAX_FILE) throw Object.assign(new Error('file too big'), { code: 'big' });
    const response = await this.fetcher(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`telegram file ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > MAX_FILE) throw Object.assign(new Error('file too big'), { code: 'big' });
    let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { data: btoa(binary), mime: { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', oga: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', pdf: 'application/pdf' }[ext] || '' };
  }
  // A file (a referat or presentation made by NurimAI) as a multipart upload, with an HTML caption.
  async sendDocument(chatId, name, bytes, mime, caption = '', extra = {}) {
    const form = new FormData(); form.append('chat_id', String(chatId)); form.append('document', new Blob([bytes], { type: mime }), name);
    if (caption) { form.append('caption', caption.slice(0, 1024)); form.append('parse_mode', 'HTML'); }
    for (const [key, value] of Object.entries(extra)) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    const response = await this.fetcher(`https://api.telegram.org/bot${this.token}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
    const data = await response.json().catch(() => ({}));
    if (!data.ok) throw Object.assign(new Error(`telegram sendDocument: ${String(data.description || response.status).slice(0, 160)}`), { status: response.status });
    return data.result;
  }
  // HTML first; if Telegram cannot parse it, the same answer goes as plain text.
  async send(chatId, html, extra = {}) {
    try { return await this.call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra }); }
    catch (error) { if (error.status !== 400) throw error; return this.call('sendMessage', { chat_id: chatId, text: html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), link_preview_options: { is_disabled: true }, ...extra }); }
  }
}
