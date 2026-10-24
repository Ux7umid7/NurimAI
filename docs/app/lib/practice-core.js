(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.NurimPractice = factory(); })(typeof self !== 'undefined' ? self : this, function () {
// Shared by the desktop app (Node, practice.json) and the phone app (browser, localStorage): storage is injected.
let UserError = class extends Error {}; // the desktop app swaps in its own UserError so messages reach the user
const configure = ({ ErrorClass }) => { if (ErrorClass) UserError = ErrorClass; };
const randomUUID = () => globalThis.crypto.randomUUID();
// Ustoz rejimi: AI tuzgan testlar, kartochkalar (Leitner qutilari bilan takrorlash), kunlik mashq seriyasi va eslatmalar.
// Hammasi shu qurilmada turadi; serverga faqat test yoki kartochka tuzish so'rovi boradi.
const BOX_DAYS = [0, 1, 2, 4, 8, 16, 32]; // quti raqami -> keyingi takrorlashgacha kun
const LIMITS = Object.freeze({ decks: 60, cards: 400, quizzes: 60, reminders: 30, text: 600, title: 80, questions: 20 });
const MISTAKES = 'Xatolar ustida ishlash';
const pad = n => String(n).padStart(2, '0');
const dayOf = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return dayOf(new Date(y, m - 1, d + n)); };
const clean = (value, max) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// AI javobidan JSON: ```json ... ``` bloki yoki birinchi { dan oxirgi } gacha.
function extractJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try { return JSON.parse(raw); } catch { throw new UserError('AI javobini o‘qib bo‘lmadi. Qayta urinib ko‘ring.'); }
}
function parseQuiz(text) {
  const data = extractJson(text);
  const questions = (Array.isArray(data?.questions) ? data.questions : []).slice(0, LIMITS.questions).map(q => {
    const options = Array.isArray(q?.options) ? q.options.map(o => clean(String(o ?? ''), 300)).filter(Boolean) : [];
    const answer = Number(q?.answer);
    if (!clean(q?.q, LIMITS.text) || options.length < 2 || options.length > 6 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
    return { q: clean(q.q, LIMITS.text), options, answer, explain: clean(q.explain, LIMITS.text) };
  }).filter(Boolean);
  if (!questions.length) throw new UserError('AI test savollarini to‘g‘ri tuzmadi. Mavzuni aniqroq yozib, qayta urinib ko‘ring.');
  return { title: clean(data.title, LIMITS.title) || 'Test', questions };
}
function parseCards(text) {
  const data = extractJson(text);
  const cards = (Array.isArray(data?.cards) ? data.cards : []).slice(0, 40).map(c => ({ front: clean(c?.front, LIMITS.text), back: clean(c?.back, LIMITS.text) })).filter(c => c.front && c.back);
  if (!cards.length) throw new UserError('AI kartochkalarni to‘g‘ri tuzmadi. Mavzuni aniqroq yozib, qayta urinib ko‘ring.');
  return { title: clean(data.title, LIMITS.title) || 'Kartochkalar', cards };
}
const LEVELS = { oson: 'oson (boshlang‘ich)', orta: 'o‘rtacha', qiyin: 'qiyin (chuqur tushunishni tekshiradi)' };
function quizPrompt({ topic, count, level, fromChat }) {
  return `${fromChat ? 'Yuqoridagi suhbat va biriktirilgan fayllar asosida' : `Mavzu: ${topic}.`} ${count} ta test savoli tuz, darajasi: ${LEVELS[level] || LEVELS.orta}. `
    + 'Har savolda 4 ta javob varianti, faqat bittasi to‘g‘ri; to‘g‘ri javob o‘rni savoldan savolga har xil bo‘lsin. Har savolga to‘g‘ri javob nega to‘g‘riligini 1–2 gapda tushuntir. '
    + 'Savollar o‘zbek tilida bo‘lsin (mavzu chet tilini o‘rganish bo‘lsa, o‘sha til so‘zlari ishlatilsin). '
    + 'Faqat JSON qaytar, boshqa hech narsa yozma: {"title":"qisqa sarlavha","questions":[{"q":"savol","options":["A","B","C","D"],"answer":0,"explain":"izoh"}]}';
}
function cardsPrompt({ topic, count, fromChat }) {
  return `${fromChat ? 'Yuqoridagi suhbat va biriktirilgan fayllar asosida' : `Mavzu: ${topic}.`} yodlash uchun ${count} ta kartochka tuz: oldi tomonida savol, atama yoki so‘z, orqasida qisqa javob, ta’rif yoki tarjima (1–2 gap). `
    + 'O‘zbek tilida yoz (mavzu chet tili bo‘lsa, old tomonda o‘sha tildagi so‘z). '
    + 'Faqat JSON qaytar, boshqa hech narsa yozma: {"title":"qisqa sarlavha","cards":[{"front":"...","back":"..."}]}';
}
// QA rejimi uchun tayyor javoblar (jonli AI emas).
function sample(kind, count = 3) {
  if (kind === 'quiz') return JSON.stringify({ title: 'Sinov testi', questions: Array.from({ length: count }, (_, i) => ({ q: `${i + 2} + ${i + 2} nechaga teng?`, options: [String(2 * i + 3), String(2 * i + 4), String(2 * i + 5), String(2 * i + 6)], answer: 1, explain: `${i + 2} ni ikki marta qo‘shsak ${2 * i + 4} bo‘ladi.` })) });
  return '```json\n' + JSON.stringify({ title: 'Sinov kartochkalari', cards: Array.from({ length: count }, (_, i) => ({ front: `apple ${i + 1}`, back: `olma ${i + 1}` })) }) + '\n```';
}

function cleanCard(c) {
  if (!c || typeof c.id !== 'string') return null;
  const front = clean(c.front, LIMITS.text), back = clean(c.back, LIMITS.text);
  if (!front || !back) return null;
  return { id: c.id, front, back, box: Math.min(BOX_DAYS.length - 1, Math.max(0, Number(c.box) | 0)), due: isDay(c.due) ? c.due : dayOf(), right: Number(c.right) | 0, wrong: Number(c.wrong) | 0 };
}
function empty() { return { decks: [], quizzes: [], streak: { count: 0, last: '' }, day: { date: '', reviewed: 0, quizzes: 0 }, reminders: [], practiceReminder: { on: false, time: '19:00', last: '' }, teacher: false }; }
class Practice {
  // read() -> saved JSON text or null; write(text) stores it.
  constructor({ read, write }) { this.read = read; this.write = write; this.state = empty(); this.warning = ''; }
  load() {
    this.state = empty(); this.warning = '';
    const raw = this.read(); if (raw == null) return;
    try {
      const d = JSON.parse(raw), s = this.state;
      s.decks = (Array.isArray(d.decks) ? d.decks : []).slice(0, LIMITS.decks).map(k => typeof k?.id === 'string' && clean(k.title, LIMITS.title) ? { id: k.id, title: clean(k.title, LIMITS.title), created: Number(k.created) || Date.now(), cards: (Array.isArray(k.cards) ? k.cards : []).slice(0, LIMITS.cards).map(cleanCard).filter(Boolean) } : null).filter(Boolean);
      s.quizzes = (Array.isArray(d.quizzes) ? d.quizzes : []).slice(-LIMITS.quizzes).filter(q => isDay(q?.date) && Number.isInteger(q.score) && Number.isInteger(q.total)).map(q => ({ title: clean(q.title, LIMITS.title) || 'Test', date: q.date, score: q.score, total: q.total }));
      if (Number.isInteger(d.streak?.count) && (d.streak.last === '' || isDay(d.streak.last))) s.streak = { count: Math.max(0, d.streak.count), last: d.streak.last };
      if (isDay(d.day?.date)) s.day = { date: d.day.date, reviewed: Number(d.day.reviewed) | 0, quizzes: Number(d.day.quizzes) | 0 };
      s.reminders = (Array.isArray(d.reminders) ? d.reminders : []).slice(0, LIMITS.reminders).filter(r => typeof r?.id === 'string' && clean(r.text, 200) && isTime(r.time) && ['daily', 'once'].includes(r.repeat)).map(r => ({ id: r.id, text: clean(r.text, 200), time: r.time, repeat: r.repeat, date: isDay(r.date) ? r.date : '', last: isDay(r.last) ? r.last : '' }));
      if (isTime(d.practiceReminder?.time)) s.practiceReminder = { on: d.practiceReminder.on === true, time: d.practiceReminder.time, last: isDay(d.practiceReminder.last) ? d.practiceReminder.last : '' };
      s.teacher = d.teacher === true;
    } catch { this.warning = 'Mashq ma’lumotlarini o‘qib bo‘lmadi.'; }
  }
  save() { this.write(JSON.stringify(this.state)); }
  // Bugun nimadir mashq qilinsa seriya davom etadi; bir kun o'tkazib yuborilsa qaytadan boshlanadi.
  active(now = new Date()) {
    const today = dayOf(now), s = this.state;
    if (s.day.date !== today) s.day = { date: today, reviewed: 0, quizzes: 0 };
    if (s.streak.last !== today) s.streak = { count: s.streak.last === addDays(today, -1) ? s.streak.count + 1 : 1, last: today };
  }
  streak(now = new Date()) { const today = dayOf(now), s = this.state.streak; return s.last === today || s.last === addDays(today, -1) ? s.count : 0; }
  addDeck(title, cards, now = new Date()) {
    const s = this.state;
    if (s.decks.length >= LIMITS.decks) throw new UserError(`Ko‘pi bilan ${LIMITS.decks} ta to‘plam saqlanadi. Keraksizini o‘chiring.`);
    const deck = { id: randomUUID(), title: clean(title, LIMITS.title) || 'Kartochkalar', created: now.getTime(), cards: [] };
    s.decks.unshift(deck); this.addCards(deck.id, cards, now); return deck;
  }
  addCards(deckId, cards, now = new Date()) {
    const deck = this.state.decks.find(d => d.id === deckId); if (!deck) throw new UserError('To‘plam topilmadi.');
    for (const c of cards) { const card = cleanCard({ ...c, id: randomUUID(), box: 0, due: dayOf(now) }); if (card && deck.cards.length < LIMITS.cards && !deck.cards.some(x => x.front === card.front)) deck.cards.push(card); }
    this.save(); return deck;
  }
  removeDeck(id) { this.state.decks = this.state.decks.filter(d => d.id !== id); this.save(); }
  due(now = new Date(), deckId = '') {
    const today = dayOf(now);
    return this.state.decks.filter(d => !deckId || d.id === deckId).flatMap(d => d.cards.filter(c => c.due <= today).map(c => ({ deck: d.id, deckTitle: d.title, ...c }))).sort((a, b) => a.box - b.box).slice(0, 40);
  }
  // Bilardim -> keyingi quti (oraliq ikki baravar), Qiyin -> shu quti ertaga, Bilmadim -> 0-quti, bugun yana.
  review(deckId, cardId, grade, now = new Date()) {
    const card = this.state.decks.find(d => d.id === deckId)?.cards.find(c => c.id === cardId);
    if (!card || !['know', 'hard', 'again'].includes(grade)) throw new UserError('Kartochka topilmadi.');
    const today = dayOf(now);
    if (grade === 'know') { card.box = Math.min(BOX_DAYS.length - 1, card.box + 1); card.right++; }
    else if (grade === 'again') { card.box = 0; card.wrong++; }
    card.due = grade === 'again' ? today : addDays(today, grade === 'hard' ? 1 : BOX_DAYS[card.box]);
    this.active(now); this.state.day.reviewed++; this.save();
  }
  finishQuiz({ title, score, total, mistakes = [] }, now = new Date()) {
    if (!Number.isInteger(score) || !Number.isInteger(total) || total < 1 || total > LIMITS.questions || score < 0 || score > total) throw new UserError('Test natijasi noto‘g‘ri.');
    const s = this.state;
    s.quizzes.push({ title: clean(title, LIMITS.title) || 'Test', date: dayOf(now), score, total }); s.quizzes = s.quizzes.slice(-LIMITS.quizzes);
    const cards = (Array.isArray(mistakes) ? mistakes : []).slice(0, LIMITS.questions).map(m => ({ front: m?.q, back: [clean(m?.answer, 300), clean(m?.explain, 400)].filter(Boolean).join(' — ') }));
    if (cards.length) { let deck = s.decks.find(d => d.title === MISTAKES); if (!deck) deck = this.addDeck(MISTAKES, [], now); this.addCards(deck.id, cards, now); }
    this.active(now); s.day.quizzes++; this.save();
  }
  setOptions({ teacher, practiceReminder } = {}) {
    const s = this.state;
    if (typeof teacher === 'boolean') s.teacher = teacher;
    if (practiceReminder && typeof practiceReminder.on === 'boolean') { if (!isTime(practiceReminder.time)) throw new UserError('Vaqtni SS:DD ko‘rinishida kiriting.'); s.practiceReminder = { ...s.practiceReminder, on: practiceReminder.on, time: practiceReminder.time }; }
    this.save();
  }
  addReminder({ text, time, repeat, date }, now = new Date()) {
    const s = this.state;
    if (!clean(text, 200)) throw new UserError('Eslatma matnini yozing.');
    if (!isTime(time)) throw new UserError('Vaqtni SS:DD ko‘rinishida kiriting.');
    if (s.reminders.length >= LIMITS.reminders) throw new UserError(`Ko‘pi bilan ${LIMITS.reminders} ta eslatma.`);
    const once = repeat === 'once';
    const day = once ? (isDay(date) ? date : (time > `${pad(now.getHours())}:${pad(now.getMinutes())}` ? dayOf(now) : addDays(dayOf(now), 1))) : ''; // vaqti o'tgan bo'lsa - ertaga
    s.reminders.push({ id: randomUUID(), text: clean(text, 200), time, repeat: once ? 'once' : 'daily', date: day, last: '' }); this.save();
  }
  removeReminder(id) { this.state.reminders = this.state.reminders.filter(r => r.id !== id); this.save(); }
  // Vaqti kelgan eslatmalar (ilova kech ochilsa ham 3 soat ichida bir marta chiqadi).
  dueReminders(now = new Date()) {
    const today = dayOf(now), clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`, s = this.state, out = [];
    const late = time => { const [h, m] = time.split(':').map(Number); const mins = now.getHours() * 60 + now.getMinutes() - (h * 60 + m); return mins >= 0 && mins < 180; };
    for (const r of s.reminders) if (r.last !== today && clock >= r.time && late(r.time) && (r.repeat === 'daily' || r.date === today)) { r.last = today; out.push({ kind: 'reminder', text: r.text }); }
    s.reminders = s.reminders.filter(r => !(r.repeat === 'once' && (r.last === r.date || (r.date && r.date < today))));
    const p = s.practiceReminder;
    if (p.on && p.last !== today && clock >= p.time && late(p.time)) { p.last = today; out.push({ kind: 'practice', text: `Kunlik mashq vaqti! ${this.due(now).length ? `${this.due(now).length} ta kartochka sizni kutmoqda.` : 'Bugun kichik test ishlab ko‘ramizmi?'}${this.streak(now) ? ` 🔥 ${this.streak(now)} kun ketma-ket.` : ''}` }); }
    if (out.length) this.save();
    return out;
  }
  view(now = new Date()) {
    const s = this.state, today = dayOf(now);
    return { decks: s.decks.map(d => ({ id: d.id, title: d.title, count: d.cards.length, due: d.cards.filter(c => c.due <= today).length, learned: d.cards.filter(c => c.box >= 3).length })),
      due: this.due(now).length, streak: this.streak(now), today: s.day.date === today ? { reviewed: s.day.reviewed, quizzes: s.day.quizzes } : { reviewed: 0, quizzes: 0 },
      quizzes: s.quizzes.slice(-8).reverse(), reminders: s.reminders.map(({ id, text, time, repeat, date }) => ({ id, text, time, repeat, date })), practiceReminder: { on: s.practiceReminder.on, time: s.practiceReminder.time }, teacher: s.teacher, warning: this.warning };
  }
}
const TEACHER = 'Ustoz uslubida javob ber: tayyor javobni darhol aytib qo‘yma, fikrni qadamma-qadam tushuntir, o‘quvchini o‘ylashga undab, oxirida bitta qisqa tekshiruv savoli ber.';
return { configure, Practice, parseQuiz, parseCards, quizPrompt, cardsPrompt, extractJson, sample, dayOf, addDays, BOX_DAYS, LIMITS, MISTAKES, TEACHER };
});
