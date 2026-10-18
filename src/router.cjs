const MODELS = Object.freeze({ Gemini: 'gemini-3.5-flash-lite', Groq: 'qwen/qwen3.8-27b', OpenRouter: 'openrouter/free' });
const URLS = Object.freeze({ Gemini: `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.Gemini}:generateContent`, Groq: 'https://api.groq.com/openai/v1/chat/completions', OpenRouter: 'https://openrouter.ai/api/v1/chat/completions' });
const ORDER = Object.keys(MODELS);
const INSTRUCTION = "Sen NurimAI, do‘stona AI yordamchisan. Foydalanuvchi tilida, odatda o‘zbek lotin yozuvida qisqa va tushunarli javob ber. Savollar, o‘qish, yozish, tarjima va rejalashda yordam ber. Kerak bo‘lsa misollar bilan tushuntir. Oddiy matn va qisqa ro‘yxat ishlat. Bilmagan narsangni ayt, manbalarni to‘qima. Ekran, veb, fayl, mikrofon yoki kompyuter boshqaruvi vositalaring yo‘q; ularga kirayotganingni aytma.";
class UserError extends Error {}
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
function body(provider, history, question) {
  const turns = context(history, question);
  if (provider === 'Gemini') return { systemInstruction: { parts: [{ text: INSTRUCTION }] }, contents: turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })), generationConfig: { maxOutputTokens: 3200 } };
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
  return { text: text.trim(), incomplete, provider, model: typeof data.model === 'string' ? data.model.slice(0,160) : MODELS[provider] };
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
  async ask(settings, history, question, signal = new AbortController().signal) {
    signal.throwIfAborted();
    let routes = ORDER.filter(p => ready(settings,p));
    if (!routes.length) throw new UserError('Sozlamalarda kamida bitta bepul AI xizmatini ulang.');
    if (!settings.autoFallback) routes = routes.slice(0,1);
    for (const provider of routes) {
      signal.throwIfAborted(); const state = this.states[provider];
      if (state?.disabled || state?.retryAt > this.now()) continue;
      const attempt = new AbortController(); const timer = setTimeout(() => attempt.abort(), this.timeout);
      const combined = AbortSignal.any([signal, attempt.signal]);
      const mark = (status, delay = 0, disabled = false) => { this.states[provider] = { status, retryAt: this.now() + delay, disabled }; };
      try {
        const headers = { 'Content-Type': 'application/json', 'User-Agent': 'NurimAI/0.3' };
        if (provider === 'Gemini') headers['x-goog-api-key'] = settings.keys[provider]; else headers.Authorization = `Bearer ${settings.keys[provider]}`;
        // 'manual' never follows a redirect (keys stay on the provider host) and works in Workers, unlike 'error'; a 3xx is handled as a failed route.
        const response = await this.fetcher(URLS[provider], { method: 'POST', headers, body: JSON.stringify(body(provider, history, question)), signal: combined, redirect: 'manual' });
        const raw = await response.text(); signal.throwIfAborted();
        let data; try { if(raw.length > 4 * 1024 * 1024) throw new Error(); data = JSON.parse(raw); } catch { data = {}; }
        if (!response.ok) {
          const invalidKey = /API_KEY_INVALID|API key not valid/i.test(raw);
          if ((response.status === 400 && !invalidKey) || response.status === 413) throw new UserError('Savol qabul qilinmadi. Matnni qisqartiring yoki yangi suhbat boshlang.');
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
    signal.throwIfAborted(); throw new UserError('Ulangan AI xizmatlari hozir javob bera olmadi. Limit, internet yoki kalitni tekshiring. Tafsilotlar Sozlamalarda.');
  }
}
module.exports = { Router, UserError, MODELS, ORDER, URLS, ready, body, parse, retryDelay };
