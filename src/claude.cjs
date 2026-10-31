// Claude with the user's own (paid) Anthropic key: an extra route for the router (router.cjs), desktop only.
// The SDK is loaded on the first question, so the app starts as fast as before.
const { INSTRUCTION, RouteError, conversation } = require('./router.cjs');
const MODEL = 'claude-opus-5-5';
const IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const REFUSAL = 'Bu so‘rovga javob bera olmayman. Boshqa savol bilan yordam beraman.';
const sdk = () => require('@anthropic-ai/sdk').default;
// Media goes with the last question: images as image blocks, PDFs as document blocks.
function request(history, question, files = [], long = false) {
  const { turns, media } = conversation(history, question, files);
  const block = f => f.kind === 'pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } } : { type: 'image', source: { type: 'base64', media_type: f.mime, data: f.data } };
  const messages = turns.map((t, i) => ({ role: t.role, content: i === turns.length - 1 && media.length ? [...media.map(block), { type: 'text', text: t.text }] : t.text }));
  // Opus 5.5 always thinks (adaptive); effort sets how much. Streaming keeps long answers clear of request timeouts.
  return { model: MODEL, max_tokens: long ? 32000 : 16000, system: INSTRUCTION, messages, output_config: { effort: long ? 'medium' : 'low' } };
}
function reply(message) {
  if (message.stop_reason === 'refusal') return { text: REFUSAL, incomplete: false, model: message.model };
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) throw new RouteError('Matnli javob o‘qilmadi', 30000);
  return { text, incomplete: message.stop_reason === 'max_tokens', model: message.model };
}
// A failed request becomes a RouteError, so the router goes on to the free routes.
function routeError(error) {
  const Anthropic = sdk();
  if (error instanceof Anthropic.APIUserAbortError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return new RouteError('Kalit yoki ruxsatni tekshiring', 0, true);
  if (error instanceof Anthropic.NotFoundError) return new RouteError('Model topilmadi (404)', 0, true);
  if (error instanceof Anthropic.RateLimitError) return new RouteError('Limit yoki balans tugagan', 60000);
  if (error instanceof Anthropic.BadRequestError) return new RouteError('So‘rov qabul qilinmadi (400)', 300000); // also a used-up credit balance
  if (error instanceof Anthropic.APIConnectionError) return new RouteError('Tarmoq xatosi', 30000);
  if (error instanceof Anthropic.APIError) return new RouteError('Xizmat vaqtincha ishlamayapti', 30000);
  return error;
}
// client(key) is for tests; the router gives its own signal (the user's stop button and the route timeout).
function claude({ client = key => { const Anthropic = sdk(); return new Anthropic({ apiKey: key, maxRetries: 1 }); } } = {}) {
  const clients = new Map();
  return {
    model: MODEL,
    accepts: f => f.kind === 'text' || f.kind === 'pdf' || (f.kind === 'image' && IMAGES.includes(f.mime)),
    async ask({ key, history, question, files, long, signal }) {
      if (!clients.has(key)) { clients.clear(); clients.set(key, client(key)); }
      try { return reply(await clients.get(key).messages.stream(request(history, question, files, long), { signal }).finalMessage()); }
      catch (error) { throw routeError(error); }
    }
  };
}
module.exports = { claude, request, reply, MODEL };
