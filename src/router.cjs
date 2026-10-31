const { fresh } = require('./web.cjs');
const { withMemory, splitMemory } = require('./shared/memory.js');
const MODELS = Object.freeze({ Gemini: 'gemini-3.5-flash-lite', GPT: 'openai/gpt-oss-120b', Groq: 'qwen/qwen3.8-27b', OpenRouter: 'openrouter/free', Cloudflare: '@cf/google/gemma-4-26b-a4b-it', ChatGPT: 'gpt-6.1-sol' });
// Cloudflare Workers AI has no URL or key: the gateway answers this address through its AI binding (server/worker.mjs).
// GPT is OpenAI's open gpt-oss model served by Groq: the Groq key and free tier, with limits of its own.
const URLS = Object.freeze({ Gemini: `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.Gemini}:generateContent`, GPT: 'https://api.groq.com/openai/v1/chat/completions', Groq: 'https://api.groq.com/openai/v1/chat/completions', OpenRouter: 'https://openrouter.ai/api/v1/chat/completions', Cloudflare: 'https://workers-ai.binding/run', ChatGPT: 'https://api.openai.com/v1/responses' });
// ORDER is the free keys the apps' settings show; PAID are the user's own paid keys (desktop only), tried before the free ones.
// Claude has no URL here: the desktop adds it as an extra route (claude.cjs, the Anthropic SDK). The gateway falls back to Workers AI last.
const ORDER = ['Gemini', 'Groq', 'OpenRouter'];
const PAID = ['Claude', 'ChatGPT'];
const KEY_OF = Object.freeze({ GPT: 'Groq' });
const ROUTES = [...PAID, 'Gemini', 'GPT', 'Groq', 'OpenRouter', 'Cloudflare'];
// Attachments other than text each route reads (an extra route says so itself with accepts()).
const MEDIA = Object.freeze({ Gemini: ['image', 'pdf', 'audio'], ChatGPT: ['image', 'pdf'] });
const INSTRUCTION = "Sen NurimAI — ekran chetida yashaydigan momiq qahramon, foydalanuvchining mehribon ustozi va do‘sti. Foydalanuvchi tilida, odatda o‘zbek lotin yozuvida qisqa va tushunarli javob ber. Savollar, o‘qish, yozish, tarjima va rejalashda yordam ber. Faqat javob berib qo‘ymay, tushunishga yordam ber: kerak bo‘lsa misollar bilan tushuntir, murakkab mavzuda keyingi qadamni taklif qil. Iliq, samimiy ohangda yoz, lekin ortiqcha maqtov va uzun kirish so‘zlarisiz. Oddiy matn, qisqa ro‘yxat, kerak bo‘lsa **qalin** so‘z va kod bloki ishlat. Matematikani LaTeX’siz, oddiy belgilar bilan yoz: 1/2, x², √9, 3 × 4, 90°; $ belgisi va LaTeX buyruqlarini ishlatma. Bilmagan narsangni ayt, manbalarni to‘qima. Foydalanuvchi o‘zi biriktirgan rasm, skrinshot, fayl, stiker va ovozli xabarlarni ko‘ra va eshita olasan: ularni diqqat bilan o‘qib, javobni shularga tayanib ber. Savolga «Internetdan olingan ma’lumot» biriktirilgan bo‘lsa, uni NurimAI hozirgina yangilik saytlari, Markaziy bank va ob-havo xizmatidan olgan: yangilik, kurs yoki ob-havo haqida shunga tayan, eng muhimini qisqa ayt, manba nomi va sanasini ko‘rsat, unda yo‘q narsani to‘qima; savolga aloqasi bo‘lmasa, e’tibor berma. Bunday ma’lumot berilmagan bo‘lsa, eng so‘nggi yangilik va kurslarni bilmasligingni ochiq ayt. Boshqa fayllar, ekran yoki kompyuterga o‘zing kira olmaysan; kirayotganingni aytma. Faqat NurimAI dasturi «kompyuter fayllari asboblari»ni biriktirgan bo‘lsa, foydalanuvchi ruxsat bergan papkalar bilan o‘sha asboblar orqali ishlaysan.";
// Questions about fresh facts (news, rates, weather, results) get what NurimAI reads from the internet (web.cjs); homework does not.
const FRESH = /yangilik|news|новост|ob-?havo|havo (qanday|necha|issiq|sovuq)|weather|погод|valyuta|(dollar|evro|yevro|rubl) kursi|(dollar|evro|yevro|rubl) (qancha|necha)|kurs(i)? (qancha|necha|qanday)|курс (доллар|валют|рубл|евро)|bugun(gi)? nima (gap|bo)|hozir(gi)? (nima gap|vaziyat|holat)|dunyoda nima|so['‘’`]?nggi (yangilik|voqea|xabar|natija)|oxirgi (yangilik|voqea|xabar|natija)|kim yutdi|hisob(i)? qanday|internet(dan|da)|qidirib (ber|top)|today|latest|this week|current news|сегодня|последн(ие|яя) (новост|событ)/i;
function needsSearch(question) { return FRESH.test(String(question || '')); }
class UserError extends Error { constructor(message, code = 'user') { super(message); this.code = code; } }
// Thrown by an extra route when it cannot answer now: the router notes the status and tries the next route.
class RouteError extends Error { constructor(message, delay = 30000, disabled = false) { super(message); this.delay = delay; this.disabled = disabled; } }
function context(history, question) {
  const turns = []; let length = question.length;
  for (let i = history.length - 2; i >= 0 && turns.length < 24; i -= 2) {
    const a = history[i], b = history[i + 1];
    if (a.role !== 'user' || b.role !== 'assistant') continue;
    length += a.text.length + b.text.length; if (length > 48000) break;
    turns.unshift({ role: a.role, text: a.text }, { role: b.role, text: b.text });
  }
  return [...turns, { role: 'user', text: question }];
}
// files: [{kind:'text',name,text}] are inlined as text for every provider; [{kind:'image'|'pdf'|'audio',name,mime,data}] go to Gemini only.
const hasMedia = files => files.some(f => f.kind !== 'text');
// The turns to send: text files are inlined into the last question; media is returned for the provider to attach to it.
function conversation(history, question, files = []) {
  const turns = context(history, question);
  const media = files.filter(f => f.kind !== 'text');
  const prompt = [...files.filter(f => f.kind === 'text').map(f => `Biriktirilgan fayl: ${f.name}\n"""\n${f.text}\n"""`), ...(media.length ? [`Biriktirilgan: ${media.map(f => f.name).join(', ')}`] : []), question].join('\n\n');
  turns[turns.length - 1] = { role: 'user', text: prompt };
  return { turns, media };
}
// long: a referat or presentation plan, so the reply may be several times longer than a chat answer.
function body(provider, history, question, files = [], long = false) {
  const { turns, media } = conversation(history, question, files);
  if (provider === 'Gemini') return { systemInstruction: { parts: [{ text: INSTRUCTION }] }, contents: turns.map((t, i) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [...(i === turns.length - 1 ? media.map(f => ({ inlineData: { mimeType: f.mime, data: f.data } })) : []), { text: t.text }] })), generationConfig: { maxOutputTokens: long ? 8192 : 3200 } };
  // OpenAI Responses API; reasoning tokens count against max_output_tokens, so it is roomy.
  if (provider === 'ChatGPT') return { model: MODELS.ChatGPT, instructions: INSTRUCTION, input: turns.map((t, i) => i === turns.length - 1 && media.length ? { role: 'user', content: [...media.map(f => f.kind === 'pdf' ? { type: 'input_file', filename: f.name, file_data: `data:${f.mime};base64,${f.data}` } : { type: 'input_image', image_url: `data:${f.mime};base64,${f.data}` }), { type: 'input_text', text: t.text }] } : { role: t.role, content: t.text }), max_output_tokens: long ? 32000 : 16000, reasoning: { effort: long ? 'medium' : 'low' }, store: false };
  const common = { model: MODELS[provider], messages: [{ role: 'system', content: INSTRUCTION }, ...turns.map(t => ({ role: t.role, content: t.text }))], stream: false };
  // gpt-oss always reasons a little (effort low) and takes no reasoning_format; its reasoning counts against max_completion_tokens.
  if (provider === 'GPT') return { ...common, max_completion_tokens: long ? 8000 : 3000, reasoning_effort: 'low', include_reasoning: false };
  if (provider === 'Groq') return { ...common, max_completion_tokens: long ? 6000 : 2400, reasoning_effort: 'none', reasoning_format: 'hidden' };
  if (provider === 'OpenRouter') return { ...common, max_tokens: long ? 8000 : 3200, provider: { max_price: { prompt: 0, completion: 0, request: 0 } } };
  if (provider === 'Cloudflare') return { ...common, max_completion_tokens: long ? 6000 : 2400, chat_template_kwargs: { enable_thinking: false } }; // thinking made answers slow and long
  throw new Error('Unknown provider');
}
function parse(provider, data) {
  let text = '', incomplete = false; const refusal = 'Bu so‘rovga javob bera olmayman. Boshqa savol bilan yordam beraman.';
  if (provider === 'Gemini') {
    const candidate = data.candidates?.[0];
    if (data.promptFeedback?.blockReason || ['SAFETY','RECITATION','PROHIBITED_CONTENT','BLOCKLIST','SPII','IMAGE_SAFETY'].includes(candidate?.finishReason)) text = refusal;
    else { text = (candidate?.content?.parts || []).filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('\n'); incomplete = candidate?.finishReason === 'MAX_TOKENS'; }
  } else if (provider === 'ChatGPT') {
    const parts = (Array.isArray(data.output) ? data.output : []).filter(o => o?.type === 'message').flatMap(o => Array.isArray(o.content) ? o.content : []);
    const refused = parts.find(p => p?.type === 'refusal');
    if (refused || data.incomplete_details?.reason === 'content_filter') text = typeof refused?.refusal === 'string' && refused.refusal.trim() ? refused.refusal : refusal;
    else { text = parts.filter(p => p?.type === 'output_text' && typeof p.text === 'string').map(p => p.text).join('\n'); incomplete = data.status === 'incomplete'; }
  } else {
    const choice = data.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') text = choice.message?.refusal || refusal;
    else { const content = choice?.message?.content; text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(p => p.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n') : ''; incomplete = choice?.finish_reason === 'length'; }
  }
  if (typeof text !== 'string' || !text.trim()) throw new Error('Empty reply');
  return { text: text.trim(), incomplete, provider, model: typeof data.model === 'string' ? data.model.slice(0,160) : MODELS[provider] };
}
// Plain-text footer with the sources, for the apps (their answers are plain text, not links).
function withSources(reply) {
  if (!reply.sources?.length) return reply.text;
  return `${reply.text}\n\n🔎 Manbalar: ${reply.sources.map(s => s.title).join(' · ')}`;
}
function retryDelay(response, data, now) {
  let delay = [429,402].includes(response.status) ? 60000 : 30000;
  const header = response.headers.get('retry-after');
  if (header) { const parsed = /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now; if (Number.isFinite(parsed)) delay = Math.max(delay, parsed); }
  for (const detail of data?.error?.details || []) { const value = String(detail.retryDelay || ''); if (/^\d+(\.\d+)?s$/.test(value)) delay = Math.max(delay, parseFloat(value) * 1000); }
  return Math.min(delay, 365 * 86400000);
}
const keyOf = (settings, provider) => settings.keys[KEY_OF[provider] || provider];
// Paid routes need only the key; free ones need the user to confirm the free tier (OpenRouter is free by its model choice).
function ready(settings, provider) { const owner = KEY_OF[provider] || provider; return Boolean(settings.keys[owner] && (PAID.includes(provider) || owner === 'OpenRouter' || settings.free?.[owner])); }
class Router {
  // Workers reject fetch called as a method ("Illegal invocation"), so the default must not bind `this`.
  // extra: routes the desktop adds by name, e.g. { Claude: claude() } — { model, accepts(file), ask({ key, history, question, files, long, signal }) → { text, incomplete, model } }.
  constructor({ fetcher = (...args) => fetch(...args), now = Date.now, timeout = 40000, extra = {} } = {}) { this.fetcher = fetcher; this.now = now; this.timeout = timeout; this.extra = extra; this.states = {}; this.last = null; this.web = new Map(); }
  reset(provider) { for (const p of ROUTES) if (p === provider || KEY_OF[p] === provider) delete this.states[p]; }
  usable(settings, provider) { return ready(settings, provider) && Boolean(URLS[provider] || this.extra[provider]); }
  reads(provider, file) { return file.kind === 'text' || (this.extra[provider] ? this.extra[provider].accepts(file) : (MEDIA[provider] || []).includes(file.kind)); }
  diagnostics(settings) { return ROUTES.filter(p => p !== 'Cloudflare' && (!PAID.includes(p) || this.usable(settings, p))).map(provider => ({ provider, model: this.extra[provider]?.model || MODELS[provider], ready: this.usable(settings, provider), status: !this.usable(settings, provider) ? 'Ulanmagan' : (this.states[provider]?.status || 'Hali sinalmagan'), retrySeconds: Math.max(0, Math.ceil(((this.states[provider]?.retryAt || 0) - this.now()) / 1000)) })); }
  async ask(settings, history, question, signal = new AbortController().signal, files = [], options = {}) {
    signal.throwIfAborted();
    let routes = ROUTES.filter(p => this.usable(settings, p));
    if (!routes.length) throw new UserError('Sozlamalarda kamida bitta bepul AI xizmatini ulang.');
    // Fresh facts go with the question as a text attachment, so every provider (not only Gemini) can use them.
    // options.search: true/false overrides the guess; a string is what to look up when the question itself is an instruction.
    const search = options.search ?? needsSearch(question);
    const web = search ? await fresh(typeof search === 'string' ? search : question, { fetcher: this.fetcher, signal, now: this.now, cache: this.web }) : null;
    // options.memory: facts the user told before (shared/memory.js) go with the question; new ones come back as reply.facts.
    const remembering = Array.isArray(options.memory), asked = remembering ? withMemory(question, options.memory) : question;
    if (web) files = [...files, web.file];
    if (hasMedia(files)) { routes = routes.filter(p => files.every(f => this.reads(p, f))); if (!routes.length) throw new UserError('Rasm, PDF va ovozni faqat Gemini o‘qiydi. Sozlamalarda Gemini kalitini ulang.'); }
    if (!settings.autoFallback) routes = routes.slice(0,1);
    for (const provider of routes) {
      signal.throwIfAborted(); const state = this.states[provider];
      if (state?.disabled || state?.retryAt > this.now()) continue;
      const paid = PAID.includes(provider); // paid models think longer before answering; PDFs, images and long documents take longer too
      const attempt = new AbortController(); const timer = setTimeout(() => attempt.abort(), paid ? Math.max(this.timeout, 120000) : hasMedia(files) || options.long ? Math.max(this.timeout, 75000) : this.timeout);
      const combined = AbortSignal.any([signal, attempt.signal]);
      const mark = (status, delay = 0, disabled = false) => { this.states[provider] = { status, retryAt: this.now() + delay, disabled }; };
      try {
        let reply;
        if (this.extra[provider]) reply = { ...(await this.extra[provider].ask({ key: keyOf(settings, provider), history, question: asked, files, long: options.long === true, signal: combined })), provider };
        else {
          const headers = { 'Content-Type': 'application/json', 'User-Agent': 'NurimAI/0.6' };
          if (provider === 'Gemini') headers['x-goog-api-key'] = keyOf(settings, provider); else headers.Authorization = `Bearer ${keyOf(settings, provider)}`;
          // 'manual' never follows a redirect (keys stay on the provider host) and works in Workers, unlike 'error'; a 3xx is handled as a failed route.
          const response = await this.fetcher(URLS[provider], { method: 'POST', headers, body: JSON.stringify(body(provider, history, asked, files, options.long === true)), signal: combined, redirect: 'manual' });
          const raw = await response.text(); signal.throwIfAborted();
          let data; try { if(raw.length > 4 * 1024 * 1024) throw new Error(); data = JSON.parse(raw); } catch { data = {}; }
          if (!response.ok) {
            const invalidKey = /API_KEY_INVALID|API key not valid/i.test(raw);
            // A paid route that rejects a request steps aside for the free ones instead of failing the question.
            if (paid && response.status === 400) { mark('So‘rov qabul qilinmadi (400)', 300000); continue; }
            if ((response.status === 400 && !invalidKey) || response.status === 413) throw new UserError(files.length ? 'Savol yoki fayl qabul qilinmadi. Faylni olib tashlang yoki boshqasini yuboring.' : 'Savol qabul qilinmadi. Matnni qisqartiring yoki yangi suhbat boshlang.', 'input');
            if ([400,401,403,404].includes(response.status)) { mark(`Kalit, ruxsat yoki modelni tekshiring (${response.status})`,0,true); continue; }
            mark([429,402].includes(response.status) ? paid ? 'Limit yoki balans tugagan' : 'Bepul limit cheklovi' : 'Xizmat vaqtincha ishlamayapti',retryDelay(response,data,this.now())); continue;
          }
          try { reply = parse(provider,data); } catch { mark('Matnli javob o‘qilmadi',30000); continue; }
        }
        mark('Ishlayapti'); this.last = { provider, model: reply.model };
        const noted = remembering ? splitMemory(reply.text) : { text: reply.text, facts: [] };
        return { ...reply, text: noted.text, facts: noted.facts, sources: web?.sources || [], queries: web?.queries || [] };
      } catch(error) {
        signal.throwIfAborted(); if (error instanceof UserError) throw error;
        if (error instanceof RouteError) mark(error.message, error.delay, error.disabled);
        else mark(attempt.signal.aborted ? 'Kutish vaqti tugadi' : 'Tarmoq xatosi',30000);
      } finally { clearTimeout(timer); }
    }
    signal.throwIfAborted(); throw new UserError(hasMedia(files) ? 'Rasm, PDF yoki ovozli savolga hozir javob berib bo‘lmadi: Gemini limiti tugagan yoki internet uzilgan. Birozdan keyin qayta urinib ko‘ring.' : 'Ulangan AI xizmatlari hozir javob bera olmadi. Limit, internet yoki kalitni tekshiring. Tafsilotlar Sozlamalarda.');
  }
}
// Text to speech (Gemini TTS, Interactions API): one request returns a 24 kHz mono WAV. Uzbek is supported by the 3.8 TTS models.
const SPEECH = Object.freeze({ model: 'gemini-3.8-flash-lite-tts', voice: 'Sulafat', url: 'https://generativelanguage.googleapis.com/v1beta/interactions', maxChars: 1200 });
function speechBody(text) {
  return { model: SPEECH.model, input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: 'iliq, mehribon va xotirjam; tabiiy o‘zbekcha talaffuz' }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: SPEECH.voice }] } };
}
// Raw 16-bit PCM (audio/L16;rate=24000) gets a WAV header so any player can open it.
function toWav({ mime, data }) {
  if (!/^audio\/l16/i.test(mime)) return { mime: mime.split(';')[0], data };
  const pcm = Buffer.from(data, 'base64'), rate = Number(/rate=(\d+)/i.exec(mime)?.[1]) || 24000, h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return { mime: 'audio/wav', data: Buffer.concat([h, pcm]).toString('base64') };
}
function speechAudio(data) {
  const audio = (data?.steps || []).filter(s => s?.type === 'model_output').flatMap(s => s.content || []).filter(c => c?.type === 'audio' && typeof c.data === 'string').at(-1);
  if (audio) return toWav({ mime: audio.mime_type || 'audio/wav', data: audio.data });
  const part = (data?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data); // generateContent shape, in case the API answers with it
  if (part) return toWav({ mime: part.inlineData.mimeType || 'audio/wav', data: part.inlineData.data });
  throw new Error('No audio');
}
async function speak({ key, text, signal, fetcher = (...args) => fetch(...args) }) {
  if (typeof text !== 'string' || !text.trim() || text.length > SPEECH.maxChars) throw new UserError('Ovoz uchun matn noto‘g‘ri.');
  const response = await fetcher(SPEECH.url, { method: 'POST', redirect: 'manual', signal, headers: { 'Content-Type': 'application/json', 'User-Agent': 'NurimAI/0.6', 'x-goog-api-key': key }, body: JSON.stringify(speechBody(text.trim())) });
  const raw = await response.text();
  if (!response.ok) throw new UserError([429, 402].includes(response.status) ? 'Ovozli javob limiti tugadi. Keyinroq urinib ko‘ring.' : 'Ovozli javob hozir ishlamayapti.', response.status === 429 ? 'limit' : 'speech');
  let data; try { if (raw.length > 12 * 1024 * 1024) throw new Error(); data = JSON.parse(raw); } catch { throw new UserError('Ovozli javob o‘qilmadi.', 'speech'); }
  try { return speechAudio(data); } catch { throw new UserError('Ovozli javob o‘qilmadi.', 'speech'); }
}
module.exports = { Router, UserError, RouteError, MODELS, ORDER, PAID, URLS, INSTRUCTION, ready, conversation, body, parse, retryDelay, needsSearch, withSources, SPEECH, speechBody, speechAudio, speak };
