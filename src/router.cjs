const MODELS = Object.freeze({ Gemini: 'gemini-3.5-flash-lite', Groq: 'qwen/qwen3.8-27b', OpenRouter: 'openrouter/free' });
const URLS = Object.freeze({ Gemini: `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.Gemini}:generateContent`, Groq: 'https://api.groq.com/openai/v1/chat/completions', OpenRouter: 'https://openrouter.ai/api/v1/chat/completions' });
const ORDER = Object.keys(MODELS);
const INSTRUCTION = "Sen NurimAI — ekran chetida yashaydigan momiq qahramon, foydalanuvchining mehribon ustozi va do‘sti. Foydalanuvchi tilida, odatda o‘zbek lotin yozuvida qisqa va tushunarli javob ber. Savollar, o‘qish, yozish, tarjima va rejalashda yordam ber. Faqat javob berib qo‘ymay, tushunishga yordam ber: kerak bo‘lsa misollar bilan tushuntir, murakkab mavzuda keyingi qadamni taklif qil. Iliq, samimiy ohangda yoz, lekin ortiqcha maqtov va uzun kirish so‘zlarisiz. Oddiy matn, qisqa ro‘yxat, kerak bo‘lsa **qalin** so‘z va kod bloki ishlat. Matematikani LaTeX’siz, oddiy belgilar bilan yoz: 1/2, x², √9, 3 × 4, 90°; $ belgisi va LaTeX buyruqlarini ishlatma. Bilmagan narsangni ayt, manbalarni to‘qima. Foydalanuvchi o‘zi biriktirgan rasm, skrinshot, fayl, stiker va ovozli xabarlarni ko‘ra va eshita olasan: ularni diqqat bilan o‘qib, javobni shularga tayanib ber. Yangiliklar, bugungi voqealar, narx, kurs yoki ob-havo so‘ralsa va senga Google qidiruvi berilgan bo‘lsa, undan foydalan: eng yangi ma’lumotni qisqa ayt va qachongi ekanini ko‘rsat. Qidiruv berilmagan bo‘lsa, eng so‘nggi ma’lumotni bilmasligingni ochiq ayt va to‘qima. Boshqa fayllar, ekran yoki kompyuterga o‘zing kira olmaysan; kirayotganingni aytma.";
// Questions about fresh facts (news, today, prices, weather, results) get Google Search grounding on Gemini; homework does not.
const FRESH = /yangilik|news|новост|ob-?havo|weather|погод|valyuta|dollar kursi|kursi (qancha|necha)|курс (доллар|валют|рубл)|bugun(gi)? (nima|qanday|qaysi|kim|qancha)|hozir(gi)? (nima|qanday|kim|qancha|holat)|so['‘’`]?nggi (yangilik|voqea|xabar|natija|versiya)|oxirgi (yangilik|voqea|xabar|natija)|kim yutdi|hisob(i)? qanday|narx(i)? qancha|internet(dan|da)|google|qidirib (ber|top)|today|latest|this week|current (price|news)|сегодня|последн(ие|яя) (новост|событ)/i;
function needsSearch(question) { return FRESH.test(String(question || '')); }
class UserError extends Error { constructor(message, code = 'user') { super(message); this.code = code; } }
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
function body(provider, history, question, files = [], search = false) {
  const turns = context(history, question);
  const media = files.filter(f => f.kind !== 'text');
  const prompt = [...files.filter(f => f.kind === 'text').map(f => `Biriktirilgan fayl: ${f.name}\n"""\n${f.text}\n"""`), ...(media.length ? [`Biriktirilgan: ${media.map(f => f.name).join(', ')}`] : []), question].join('\n\n');
  turns[turns.length - 1] = { role: 'user', text: prompt };
  if (provider === 'Gemini') return { systemInstruction: { parts: [{ text: INSTRUCTION }] }, contents: turns.map((t, i) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [...(i === turns.length - 1 ? media.map(f => ({ inlineData: { mimeType: f.mime, data: f.data } })) : []), { text: t.text }] })), generationConfig: { maxOutputTokens: 3200 }, ...(search ? { tools: [{ google_search: {} }] } : {}) };
  const common = { model: MODELS[provider], messages: [{ role: 'system', content: INSTRUCTION }, ...turns.map(t => ({ role: t.role, content: t.text }))], stream: false };
  if (provider === 'Groq') return { ...common, max_completion_tokens: 2400, reasoning_effort: 'none', reasoning_format: 'hidden' };
  if (provider === 'OpenRouter') return { ...common, max_tokens: 3200, provider: { max_price: { prompt: 0, completion: 0, request: 0 } } };
  throw new Error('Unknown provider');
}
function parse(provider, data) {
  let text = '', incomplete = false; const refusal = 'Bu so‘rovga javob bera olmayman. Boshqa savol bilan yordam beraman.';
  if (provider === 'Gemini') {
    const candidate = data.candidates?.[0];
    if (data.promptFeedback?.blockReason || ['SAFETY','RECITATION','PROHIBITED_CONTENT','BLOCKLIST','SPII','IMAGE_SAFETY'].includes(candidate?.finishReason)) text = refusal;
    else { text = (candidate?.content?.parts || []).filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('\n'); incomplete = candidate?.finishReason === 'MAX_TOKENS'; }
  } else {
    const choice = data.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') text = choice.message?.refusal || refusal;
    else { const content = choice?.message?.content; text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(p => p.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n') : ''; incomplete = choice?.finish_reason === 'length'; }
  }
  if (typeof text !== 'string' || !text.trim()) throw new Error('Empty reply');
  // Google Search grounding: the pages Gemini used and the queries it ran (shown under the answer).
  const grounding = provider === 'Gemini' ? data.candidates?.[0]?.groundingMetadata : null, sources = [];
  for (const chunk of grounding?.groundingChunks || []) { const web = chunk?.web; if (typeof web?.uri === 'string' && /^https:\/\//.test(web.uri) && !sources.some(s => s.title === web.title) && sources.length < 5) sources.push({ title: String(web.title || new URL(web.uri).hostname).slice(0, 80), uri: web.uri.slice(0, 2000) }); }
  const queries = (grounding?.webSearchQueries || []).filter(q => typeof q === 'string' && q.trim()).slice(0, 3).map(q => q.slice(0, 200));
  return { text: text.trim(), incomplete, provider, model: typeof data.model === 'string' ? data.model.slice(0,160) : MODELS[provider], sources, queries };
}
// Plain-text footer with the sources, for the apps (their answers are plain text, not links).
function withSources(reply) {
  if (!reply.sources?.length) return reply.text;
  return `${reply.text}\n\n🔎 Manbalar: ${reply.sources.map(s => s.title).join(' · ')}${reply.queries?.length ? `\nGoogle qidiruvi: «${reply.queries[0]}»` : ''}`;
}
function retryDelay(response, data, now) {
  let delay = [429,402].includes(response.status) ? 60000 : 30000;
  const header = response.headers.get('retry-after');
  if (header) { const parsed = /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now; if (Number.isFinite(parsed)) delay = Math.max(delay, parsed); }
  for (const detail of data?.error?.details || []) { const value = String(detail.retryDelay || ''); if (/^\d+(\.\d+)?s$/.test(value)) delay = Math.max(delay, parseFloat(value) * 1000); }
  return Math.min(delay, 365 * 86400000);
}
function ready(settings, provider) { return Boolean(settings.keys[provider] && (provider === 'OpenRouter' || settings.free[provider])); }
class Router {
  // Workers reject fetch called as a method ("Illegal invocation"), so the default must not bind `this`.
  constructor({ fetcher = (...args) => fetch(...args), now = Date.now, timeout = 40000 } = {}) { this.fetcher = fetcher; this.now = now; this.timeout = timeout; this.states = {}; this.last = null; }
  reset(provider) { delete this.states[provider]; }
  diagnostics(settings) { return ORDER.map(provider => ({ provider, model: MODELS[provider], ready: ready(settings, provider), status: !ready(settings, provider) ? 'Ulanmagan' : (this.states[provider]?.status || 'Hali sinalmagan'), retrySeconds: Math.max(0, Math.ceil(((this.states[provider]?.retryAt || 0) - this.now()) / 1000)) })); }
  async ask(settings, history, question, signal = new AbortController().signal, files = [], options = {}) {
    signal.throwIfAborted();
    const search = options.search ?? needsSearch(question);
    let routes = ORDER.filter(p => ready(settings,p));
    if (!routes.length) throw new UserError('Sozlamalarda kamida bitta bepul AI xizmatini ulang.');
    if (hasMedia(files)) { routes = routes.filter(p => p === 'Gemini'); if (!routes.length) throw new UserError('Rasm, PDF va ovozni faqat Gemini o‘qiydi. Sozlamalarda Gemini kalitini ulang.'); }
    if (!settings.autoFallback) routes = routes.slice(0,1);
    for (const provider of routes) {
      signal.throwIfAborted(); const state = this.states[provider];
      if (state?.disabled || state?.retryAt > this.now()) continue;
      const attempt = new AbortController(); const timer = setTimeout(() => attempt.abort(), hasMedia(files) ? Math.max(this.timeout, 75000) : this.timeout); // PDFs and images take Gemini longer
      const combined = AbortSignal.any([signal, attempt.signal]);
      const mark = (status, delay = 0, disabled = false) => { this.states[provider] = { status, retryAt: this.now() + delay, disabled }; };
      try {
        const headers = { 'Content-Type': 'application/json', 'User-Agent': 'NurimAI/0.6' };
        if (provider === 'Gemini') headers['x-goog-api-key'] = settings.keys[provider]; else headers.Authorization = `Bearer ${settings.keys[provider]}`;
        // 'manual' never follows a redirect (keys stay on the provider host) and works in Workers, unlike 'error'; a 3xx is handled as a failed route.
        const searching = search && provider === 'Gemini';
        const response = await this.fetcher(URLS[provider], { method: 'POST', headers, body: JSON.stringify(body(provider, history, question, files, searching)), signal: combined, redirect: 'manual' });
        const raw = await response.text(); signal.throwIfAborted();
        let data; try { if(raw.length > 4 * 1024 * 1024) throw new Error(); data = JSON.parse(raw); } catch { data = {}; }
        if (!response.ok) {
          const invalidKey = /API_KEY_INVALID|API key not valid/i.test(raw);
          // Search quota used up or not offered for this model: the same question goes again without search.
          if (searching && [400, 429].includes(response.status) && !invalidKey) return this.ask(settings, history, question, signal, files, { ...options, search: false });
          if ((response.status === 400 && !invalidKey) || response.status === 413) throw new UserError(files.length ? 'Savol yoki fayl qabul qilinmadi. Faylni olib tashlang yoki boshqasini yuboring.' : 'Savol qabul qilinmadi. Matnni qisqartiring yoki yangi suhbat boshlang.', 'input');
          if ([400,401,403,404].includes(response.status)) { mark(`Kalit, ruxsat yoki modelni tekshiring (${response.status})`,0,true); continue; }
          mark([429,402].includes(response.status) ? 'Bepul limit cheklovi' : 'Xizmat vaqtincha ishlamayapti',retryDelay(response,data,this.now())); continue;
        }
        let reply; try { reply = parse(provider,data); } catch { mark('Matnli javob o‘qilmadi',30000); continue; }
        mark('Ishlayapti'); this.last = { provider, model: reply.model }; return reply;
      } catch(error) {
        signal.throwIfAborted(); if (error instanceof UserError) throw error;
        mark(attempt.signal.aborted ? 'Kutish vaqti tugadi' : 'Tarmoq xatosi',30000);
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
module.exports = { Router, UserError, MODELS, ORDER, URLS, ready, body, parse, retryDelay, needsSearch, withSources, SPEECH, speechBody, speechAudio, speak };
