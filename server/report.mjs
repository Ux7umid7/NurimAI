// Kunlik hisobot: how much of NurimAI's free daily limits was used, which AI services answered, what the cache saved and
// what the protection did. @NurimAI_bot sends it every morning at 09:00 (Tashkent) to the bot's owner only (the
// OWNER_TELEGRAM_ID secret); /hisobot shows today so far. Only counts are kept: never a question, an answer or a person.

// The free daily limits (env overrides, clamped). A limit day is a UTC day: it resets at 05:00 in Tashkent.
export function limitsFor(env) {
  const n = (value, fallback, max) => Math.min(max, Math.max(1, Number(value) || fallback));
  const group = n(env.TG_GROUP_DAILY, 80, 500), user = n(env.TG_DAILY_USER, 20, 200), voice = n(env.TG_VOICE_USER, 30, 200);
  return {
    budget: { total: n(env.DAILY_TOTAL, 200, 1000), ip: n(env.DAILY_IP, 60, 100), device: n(env.DAILY_DEVICE, 30, 100), minute: 10 }, // ten a minute: a computer-files task takes several steps
    telegram: { total: n(env.TG_DAILY_TOTAL, 300, 3000), ip: user, device: user, minute: 4 },
    'tg-group': { total: n(env.TG_GROUP_TOTAL, 1000, 5000), ip: group, device: group, minute: 15 },
    'tg-voice': { total: n(env.TG_VOICE_TOTAL, 300, 3000), ip: voice, device: voice, minute: 6 },
    speech: { total: n(env.SPEAK_TOTAL, 400, 2000), ip: n(env.SPEAK_IP, 80, 200), device: n(env.SPEAK_DEVICE, 40, 200), minute: 10 },
    live: { total: n(env.LIVE_TOTAL, 100, 1000), ip: n(env.LIVE_IP, 20, 100), device: n(env.LIVE_DEVICE, 6, 50), minute: 3 }
  };
}
export const BUDGETS = Object.freeze({ budget: 'Ilovalar (kompyuter, telefon)', telegram: 'Telegram bot', 'tg-group': 'Telegram guruhlar', 'tg-voice': 'Bot ovozli javoblari', speech: 'Ilovalar ovozli javoblari', live: 'Jonli suhbat' });
const ROUTES = Object.freeze({ Gemini: 'Gemini', GPT: 'GPT-OSS (Groq)', Groq: 'Qwen (Groq)', OpenRouter: 'OpenRouter', Cloudflare: 'Workers AI', NurimAI: 'NurimAI himoyasi' });
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
export const dayOf = now => Math.floor(now / 86400000);
export const emptyStats = day => ({ day, answers: {}, failed: {}, rejected: {}, routes: {}, cache: { hit: 0, stored: 0 }, guard: { blocked: 0, masked: 0, crisis: 0, untrusted: 0 }, levels: { simple: 0, normal: 0, hard: 0 }, ms: { sum: 0, count: 0 }, quota: {} });
// One answer (or a question left without one) counted from its trace (src/router.cjs). kind: app, telegram, group.
export function count(stats, kind, trace, failed = false) {
  const s = stats || emptyStats(0);
  const bump = (o, k, by = 1) => { o[k] = (o[k] || 0) + by; };
  bump(failed || !trace || trace.error ? s.failed : s.answers, kind);
  for (const step of trace?.steps || []) {
    if (step.step === 'route') { const r = s.routes[step.route] ||= { ok: 0, limit: 0, fail: 0 }; if (step.ok) r.ok++; else if (step.skipped) continue; else if (/limit/i.test(step.status || '')) r.limit++; else r.fail++; }
    else if (step.step === 'cache') { if (step.hit) s.cache.hit++; if (step.stored) s.cache.stored++; }
    else if (step.step === 'level' && step.level in s.levels) s.levels[step.level]++;
    else if (step.step === 'guard') { if (step.blocked) s.guard.blocked++; if (step.masked) s.guard.masked++; if (step.crisis) s.guard.crisis++; if (step.untrusted) s.guard.untrusted++; }
  }
  if (!failed && Number.isFinite(trace?.ms) && !trace.steps?.some(x => x.hit || x.blocked)) { s.ms.sum += trace.ms; s.ms.count++; }
  return s;
}
// A daily budget's state (server/worker.mjs budget()): used, limit, percent, people, people who reached their own limit.
export function usage(data, limits, day) {
  const live = data?.day === day ? data : null, used = live?.total || 0;
  const people = live ? Math.max(Object.keys(live.ips || {}).length, Object.keys(live.devices || {}).length) : 0;
  const capped = live ? Object.values(live.ips || {}).filter(r => r.count >= limits.ip).length + Object.values(live.devices || {}).filter(c => c >= limits.device && limits.device < limits.ip).length : 0;
  return { used, limit: limits.total, pct: Math.round(used * 100 / limits.total), people, capped };
}
const bar = pct => '▓'.repeat(Math.min(10, Math.round(pct / 10))) + '░'.repeat(10 - Math.min(10, Math.round(pct / 10)));
const num = n => Number(n || 0).toLocaleString('ru-RU').replace(/ /g, ' ');
const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
export function dateLabel(day) { const d = new Date(day * 86400000); return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}`; }

// API kalitlar. Gemini tells no one how much of a free key is left, so the server counts every request it sends to Gemini.
// Google's free daily limits reset at midnight Pacific time (12:00 or 13:00 in Tashkent), so the count does too. The limit
// itself: GEMINI_DAILY_LIMIT (from AI Studio's rate-limit page), or learned from Google's first "per day" 429 (quotaValue).
export const ptDate = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
export function resetHour(now) { // Tashkent hour (UTC+5) when Pacific midnight comes: 13 in winter, 12 in summer
  const at = new Date(now), local = zone => new Date(at.toLocaleString('en-US', { timeZone: zone }));
  const offset = Math.round((local('America/Los_Angeles') - local('UTC')) / 3600000); // -8 in winter, -7 in summer
  return (5 - offset + 24) % 24;
}
// What a Gemini request was for, from its URL and body.
export function geminiUse(url, body) {
  const path = new URL(url).pathname;
  if (path.endsWith('/auth_tokens')) return 'live';
  const model = /\/models\/([^:/?]+)/.exec(path)?.[1] || (() => { try { return JSON.parse(body).model; } catch { return ''; } })();
  return model || 'gemini';
}
// Google's 429 names the quota it hit; a per-day one carries the day's limit.
export function dailyQuota(error) {
  for (const d of error?.details || []) for (const v of d?.violations || []) if (/PerDay/i.test(v?.quotaId || '') && Number(v?.quotaValue) > 0) return Number(v.quotaValue);
  return 0;
}
const USES = Object.freeze({ live: 'jonli suhbat (sessiya)' });
// gemini: { pt, models: { name: { n, limited } } }; learned: { name: limit }; groq: { model: { limit, left, at } }; stats: today's count().
export function keysText({ gemini, learned = {}, groq = {}, stats, env = {}, now = Date.now(), chatModel = '' }) {
  const lines = ['<b>🔑 API kalitlar — qancha qoldi</b>'], models = gemini?.models || {};
  const names = [...new Set([chatModel, ...Object.keys(models)])].filter(Boolean);
  lines.push(`<b>Gemini</b> (bepul kalit, yangilanishi Toshkent vaqti ${resetHour(now)}:00 da):`);
  for (const name of names) {
    const m = models[name] || { n: 0, limited: 0 }, limit = name === chatModel ? Number(env.GEMINI_DAILY_LIMIT) || learned[name] : learned[name];
    if (!m.n && name !== chatModel) continue;
    const label = USES[name] || name;
    if (limit) { const left = Math.max(0, limit - m.n), pct = Math.round(m.n * 100 / limit); lines.push(`${bar(pct)} ${label}: qoldi <b>${num(left)}</b> / ${num(limit)} (${pct}% ishlatildi)${m.limited ? ` · ${num(m.limited)} marta limit` : ''}`); }
    else lines.push(`• ${label}: ${num(m.n)} so‘rov ishlatildi${m.limited ? ` · ${num(m.limited)} marta limit (429)` : ''} — limit hali noma’lum`);
  }
  if (!names.length) lines.push('• bugun so‘rov bo‘lmadi');
  const groqNames = { 'openai/gpt-oss-120b': 'GPT-OSS', 'qwen/qwen3.8-27b': 'Qwen' };
  const g = Object.entries(groq);
  if (g.length) lines.push(`<b>Groq</b>: ${g.map(([model, q]) => `${groqNames[model] || model} qoldi <b>${num(q.left)}</b> / ${num(q.limit)}`).join(' · ')} (Groq’ning o‘z hisobi)`);
  else lines.push('<b>Groq</b>: bugun so‘rov bo‘lmadi');
  const tries = name => { const r = stats?.routes?.[name]; return r ? r.ok + r.limit + r.fail : 0; };
  if (env.OPENROUTER_API_KEY) lines.push(`<b>OpenRouter</b>: ${num(tries('OpenRouter'))} so‘rov`);
  lines.push(`<b>Workers AI</b>: ${num(tries('Cloudflare'))} so‘rov (Cloudflare bepul: kuniga 10 000 neyron)`);
  return lines.join('\n');
}
// The report as Telegram HTML. budgets: { key: usage() }; stats: count()'s object; env: for GEMINI_DAILY_LIMIT.
// keys: keysText() — what is left on each API key comes first.
export function reportText({ title, day, budgets, stats, env = {}, keys = '' }) {
  const s = stats || emptyStats(day), lines = [`📊 <b>${title}</b>`, dateLabel(day), ...(keys ? ['', keys] : []), '', '<b>NurimAI’ning o‘z kunlik limitlari</b> (Toshkent vaqti 05:00 da yangilanadi)'];
  const warn = [];
  for (const [key, label] of Object.entries(BUDGETS)) {
    const u = budgets?.[key]; if (!u) continue;
    if (!u.used && ['tg-voice', 'speech', 'live'].includes(key)) continue;
    lines.push(`${bar(u.pct)} ${u.pct}% · ${label}: ${num(u.used)} / ${num(u.limit)}`);
    if (u.pct >= 80) warn.push(`⚠️ ${label}: limitning ${u.pct}% ishlatildi — kerak bo‘lsa limitni oshiring.`);
  }
  if (!budgets) lines.push('Kecha uchun limit ma’lumoti saqlanmagan (server shu kuni yangilangan).');
  const people = [['Ilovalar', budgets?.budget?.people, 'qurilma'], ['Telegram', budgets?.telegram?.people, 'kishi'], ['guruhlarda', budgets?.['tg-group']?.people, 'kishi']].filter(([, n]) => n);
  if (people.length) lines.push(`👥 ${people.map(([where, n, who]) => `${where}: ${num(n)} ${who}`).join(' · ')}`);
  const capped = Object.entries(BUDGETS).map(([key, label]) => [label, budgets?.[key]?.capped || 0]).filter(([, n]) => n);
  const rejected = sum(s.rejected);
  if (capped.length || rejected) lines.push(`⛔ O‘z kunlik limitiga yetganlar: ${capped.length ? capped.map(([l, n]) => `${l} ${n}`).join(', ') : '0'}${rejected ? ` · rad etilgan so‘rovlar: ${num(rejected)}` : ''}`);
  lines.push('', '<b>AI xizmatlari</b>');
  const routes = Object.entries(s.routes).filter(([name]) => name !== 'NurimAI');
  if (!routes.length) lines.push('Bu kunda AI’ga savol bo‘lmadi.');
  for (const [name, r] of routes) {
    let line = `${ROUTES[name] || name}: ${num(r.ok)} javob${r.limit ? ` · ${num(r.limit)} marta limit (429)` : ''}${r.fail ? ` · ${num(r.fail)} xato` : ''}`;
    const model = { GPT: 'openai/gpt-oss-120b', Groq: 'qwen/qwen3.8-27b' }[name], q = model && s.quota?.[model];
    if (q?.limit) { const used = q.limit - q.left; line += ` — Groq kunlik limiti: ${Math.round(used * 100 / q.limit)}% (${num(used)} / ${num(q.limit)})`; }
    const gemini = name === 'Gemini' && Number(env.GEMINI_DAILY_LIMIT);
    if (gemini > 0) { const tries = r.ok + r.limit + r.fail; line += ` — kunlik limitning ${Math.round(tries * 100 / gemini)}% (${num(tries)} / ${num(gemini)})`; }
    if (r.limit) warn.push(`⚠️ ${ROUTES[name] || name} limitga yetdi: savollar keyingi xizmatlarga o‘tdi.`);
    lines.push(line);
  }
  const answered = sum(s.answers), failed = sum(s.failed);
  lines.push(`✅ Javoblar: ${num(answered)} (ilovalar ${num(s.answers.app)}, bot ${num(s.answers.telegram)}, guruhlar ${num(s.answers.group)})${failed ? ` · ❌ javobsiz: ${num(failed)}` : ''}`);
  const rated = (s.feedback?.good || 0) + (s.feedback?.bad || 0);
  if (rated) { const pct = Math.round(s.feedback.good * 100 / rated); lines.push(`⭐ Foydalanuvchilar bahosi: 👍 ${num(s.feedback.good)} · 👎 ${num(s.feedback.bad)} — ${pct}% mamnun`); if (rated >= 10 && pct < 70) warn.push(`⚠️ 👎 ko‘paydi (${100 - pct}%): evallarni ishga tushirib ko‘ring (npm run eval).`); }
  if (s.ms.count) lines.push(`⚡ O‘rtacha javob vaqti: ${(s.ms.sum / s.ms.count / 1000).toFixed(1)} s · savollar: oddiy ${num(s.levels.simple)}, odatiy ${num(s.levels.normal)}, qiyin ${num(s.levels.hard)}`);
  lines.push('', '<b>Tejash va himoya</b>');
  const asked = s.cache.hit + s.cache.stored;
  lines.push(`💾 Keshdan: ${num(s.cache.hit)} javob${answered ? ` (${Math.round(s.cache.hit * 100 / answered)}%)` : ''} — AI’ga shuncha so‘rov tejaldi${asked ? ` · keshga yozildi: ${num(s.cache.stored)}` : ''}`);
  lines.push(`🛡 Buyruq hujumi: ${num(s.guard.blocked)} · yashirilgan shaxsiy ma’lumot: ${num(s.guard.masked)} · fayldagi buyruq: ${num(s.guard.untrusted)} · yordam eslatmasi: ${num(s.guard.crisis)}`);
  if (warn.length) lines.push('', ...warn);
  return lines.join('\n');
}
