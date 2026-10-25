// Fresh facts for questions about today. Gemini's free tier has no Google Search, so NurimAI reads public sources itself:
// the news sites' own RSS feeds, the Central Bank of Uzbekistan's rates and Open-Meteo's forecast. Nothing about the user is sent.
const FEEDS = Object.freeze([
  { name: 'Kun.uz', url: 'https://kun.uz/news/rss', home: 'https://kun.uz/' },
  { name: 'Gazeta.uz', url: 'https://www.gazeta.uz/oz/rss/', home: 'https://www.gazeta.uz/oz/' },
  { name: 'Daryo.uz', url: 'https://daryo.uz/feed/', home: 'https://daryo.uz/' },
  { name: 'BBC O‘zbek', url: 'https://feeds.bbci.co.uk/uzbek/rss.xml', home: 'https://www.bbc.com/uzbek' },
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', home: 'https://www.bbc.com/news/world' },
  // Sport feeds answer sport questions and topic searches ("Real Madrid kim yutdi?"), not the general headlines.
  { name: 'Sports.uz', url: 'https://sports.uz/rss', home: 'https://sports.uz/', sport: true },
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', home: 'https://www.bbc.com/sport', sport: true },
]);
const RATES = Object.freeze({ name: 'Markaziy bank', url: 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/', home: 'https://cbu.uz/uz/arkhiv-kursov-valyut/' });
// cbu.uz does not always answer requests from abroad (the gateway runs on Cloudflare), so a market rate stands in, said to be unofficial.
const MARKET = Object.freeze({ name: 'ExchangeRate-API', url: 'https://open.er-api.com/v6/latest/USD', home: 'https://www.exchangerate-api.com' });
const WEATHER = Object.freeze({ name: 'Open-Meteo', home: 'https://open-meteo.com/' });
const AGENT = 'NurimAI/0.8 (+https://ux7umid7.github.io/NurimAI/)';
const MINUTE = 60000;
// Regional centres; the question names one ("Samarqandda ob-havo"), otherwise Toshkent.
const CITIES = Object.freeze({
  toshkent: [41.3111, 69.2797, 'Toshkent'], samarqand: [39.6542, 66.9597, 'Samarqand'], buxoro: [39.7747, 64.4286, 'Buxoro'],
  andijon: [40.7821, 72.3442, 'Andijon'], namangan: [40.9983, 71.6726, 'Namangan'], fargona: [40.3864, 71.7864, 'Farg‘ona'],
  qoqon: [40.5286, 70.9425, 'Qo‘qon'], margilon: [40.4711, 71.7247, 'Marg‘ilon'], qarshi: [38.8606, 65.7891, 'Qarshi'],
  termiz: [37.2242, 67.2783, 'Termiz'], jizzax: [40.1158, 67.8422, 'Jizzax'], guliston: [40.4897, 68.7842, 'Guliston'],
  navoiy: [40.0844, 65.3792, 'Navoiy'], urganch: [41.55, 60.6333, 'Urganch'], xiva: [41.3783, 60.3639, 'Xiva'],
  nukus: [42.4531, 59.6103, 'Nukus'], chirchiq: [41.4689, 69.5822, 'Chirchiq'], olmaliq: [40.8447, 69.5983, 'Olmaliq'],
  angren: [41.0167, 70.1436, 'Angren'], shahrisabz: [39.0578, 66.8342, 'Shahrisabz'],
});
// Matching is done on a plain Latin form: no apostrophes, Cyrillic (Uzbek and Russian) spelled in Latin, Kun.uz's ğ/ö/ş letters folded.
const LATIN = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h', ğ: 'g', ö: 'o', ş: 'sh', ç: 'ch', ı: 'i' };
const normalize = s => String(s || '').toLowerCase().replace(/[‘’'`ʻʼ]/g, '').replace(/[а-яёўқғҳğöşçı]/g, c => LATIN[c] ?? c);
const RATE = /kurs|valyuta|dollar|evro|yevro|rubl|tenge|yuan|exchange/;
const SKY = /ob-?havo|obhavo|havo (qanday|necha|issiq|sovuq)|harorat|yomgir|qor yog|weather|forecast|pogod/;
const NEWS = /yangilik|xabar|voqea|news|novost|sobyt|yutdi|natija|hisob|nima (gap|boldi|bolyapti)/;
const SPORT = /sport|futbol|football|match|chempionat|liga|boks|olimpiada|yutdi|hisob/;
// Words that say "news, today, tell me" rather than what the news is about.
const STOP = new Set(('yangilik yangiliklar yangiliklarni yangiliklari yangiligi bugun bugungi hozir hozirgi songgi oxirgi eng muhim asosiy nima nimalar '
  + 'qanday qanaqa qaysi kim kimlar qancha necha haqida ayt aytib aytchi ber bering berchi qidir qidirib top topib internet internetdan internetda google '
  + 'qisqacha qisqa xabar xabarlar voqea voqealar dunyo dunyoda jahon jahonda ozbekiston ozbekistonda uzbekistan mamlakat mamlakatda gap boldi bolyapti bor bormi '
  + 'yangi kun kecha kechagi ertaga hafta haftalik ham va bilan uchun men menga sen bizga iltimos yutdi yutgan hisob hisobi natija natijasi natijalari ob-havo obhavo havo '
  + 'sport sporti futbol futboli football match oyin oyini oyinda oyinlari news latest today this week what whats happening about the and new world '
  + 'новости новостей сегодня последние что про какие узбекистан узбекистана узбекистане мире мира').split(' ').map(normalize));
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' };
const char = n => Number.isInteger(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
function clean(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? char(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m)
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function feedItems(xml, feed) {
  const list = [];
  for (const [block] of String(xml).matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const field = name => { const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`)); return m ? clean(m[1]) : ''; };
    const title = field('title'), link = field('link'), time = Date.parse(field('pubDate'));
    if (!title || !/^https:\/\//.test(link)) continue;
    list.push({ source: feed.name, title: title.slice(0, 200), text: field('description').replace(/[.\s]+$/, '').slice(0, 220), link: link.slice(0, 500), time: Number.isFinite(time) ? time : 0 });
    if (list.length >= 25) break;
  }
  return list;
}
const parts = (time, options) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour12: false, ...options }).formatToParts(new Date(time)).map(p => [p.type, p.value]));
function when(time) { const p = parts(time, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); return `${p.day}.${p.month} ${p.hour}:${p.minute}`; }
function stamp(time) { const p = parts(time, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`; }

const PICK = ['USD', 'EUR', 'RUB', 'KZT', 'CNY', 'GBP', 'TRY'];
function rateLine(list) {
  const rows = (Array.isArray(list) ? list : []).filter(r => PICK.includes(r?.Ccy) && /^\d+(\.\d+)?$/.test(String(r.Rate))).sort((a, b) => PICK.indexOf(a.Ccy) - PICK.indexOf(b.Ccy));
  if (!rows.length) return null;
  return `Markaziy bankning rasmiy kursi (${String(rows[0].Date).slice(0, 10)} dan): ${rows.map(r => `${r.Nominal || 1} ${r.Ccy} (${String(r.CcyNm_UZ || '').slice(0, 30)}) = ${r.Rate} so‘m${r.Diff ? `, o‘zgarish ${r.Diff}` : ''}`).join('; ')}.`;
}
function marketLine(data) {
  const r = data?.rates; if (data?.result !== 'success' || !(r?.UZS > 0)) return null;
  const rows = PICK.filter(c => c === 'USD' || r[c] > 0).map(c => `1 ${c} ≈ ${(r.UZS / (c === 'USD' ? 1 : r[c])).toFixed(2)} so‘m`);
  const date = Number.isFinite(data.time_last_update_unix) ? stamp(data.time_last_update_unix * 1000).slice(0, 10) : 'sana yo‘q';
  return `Markaziy bank sayti hozir ochilmadi. Xalqaro bozor kursi (ExchangeRate-API, ${date} holati; rasmiy kurs emas, biroz farq qilishi mumkin): ${rows.join('; ')}.`;
}
const dmy = s => /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}${s.slice(10).replace('T', ' ')}` : s;
function sky(code) { const c = Number(code); return c === 0 ? 'ochiq osmon' : c <= 2 ? 'qisman bulutli' : c === 3 ? 'bulutli' : c <= 48 ? 'tuman' : c <= 57 ? 'mayda yomg‘ir' : c <= 67 ? 'yomg‘ir' : c <= 77 ? 'qor' : c <= 82 ? 'jala' : c <= 86 ? 'qor yog‘ishi' : 'momaqaldiroq'; }
function weatherLine(data, city) {
  const now = data?.current, day = data?.daily;
  if (!now || !Array.isArray(day?.time)) return null;
  const days = day.time.slice(0, 3).map((date, i) => `${['bugun', 'ertaga', 'indinga'][i]} (${dmy(String(date))}): ${Math.round(day.temperature_2m_min[i])}…${Math.round(day.temperature_2m_max[i])}°C, ${sky(day.weather_code[i])}${day.precipitation_probability_max?.[i] != null ? `, yog‘ingarchilik ehtimoli ${day.precipitation_probability_max[i]}%` : ''}`);
  return `Ob-havo, ${city} (Open-Meteo, ${dmy(String(now.time))}): hozir ${Math.round(now.temperature_2m)}°C (his qilinishi ${Math.round(now.apparent_temperature)}°C), ${sky(now.weather_code)}, shamol ${Math.round(now.wind_speed_10m)} km/soat. ${days.join('; ')}.`;
}

// A source that failed is left alone for an hour: cbu.uz never answers the gateway, and each try would cost a 7-second wait.
async function load(url, read, ttl, { fetcher, signal, now, cache }) {
  const hit = cache.get(url); if (hit && now() - hit.at < (hit.value ? ttl : 60 * MINUTE)) return hit.value;
  try {
    const response = await fetcher(url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = read((await response.text()).slice(0, 1500000)) || null;
    cache.set(url, { at: now(), value }); return value;
  } catch (error) {
    if (signal.aborted) throw error;
    cache.set(url, { at: now(), value: null }); console.log(`web ${new URL(url).host} ${error.name === 'TimeoutError' ? 'timeout' : String(error.message).slice(0, 120)}`); // seen in `wrangler tail`
    throw error;
  }
}
// Returns null when nothing could be read; otherwise a text file for the question's last turn, plus sources to show under the answer.
async function fresh(question, { fetcher = (...args) => fetch(...args), signal = new AbortController().signal, now = Date.now, cache = new Map() } = {}) {
  const q = normalize(question), rates = RATE.test(q), weather = SKY.test(q), news = NEWS.test(q) || (!rates && !weather);
  const key = Object.keys(CITIES).find(k => q.includes(k)) || 'toshkent', [lat, lon, city] = CITIES[key];
  const get = (url, read, ttl) => load(url, read, ttl, { fetcher, signal, now, cache }).catch(() => null);
  const json = text => { try { return JSON.parse(text); } catch { return null; } };
  const [rateText, weatherText, feeds] = await Promise.all([
    rates ? get(RATES.url, text => rateLine(json(text)), 30 * MINUTE).then(line => line ? { line, source: RATES } : get(MARKET.url, text => marketLine(json(text)), 60 * MINUTE).then(line => line && { line, source: MARKET })) : null,
    weather ? get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTashkent&forecast_days=3`, text => weatherLine(json(text), city), 15 * MINUTE) : null,
    news ? Promise.all(FEEDS.map(feed => get(feed.url, xml => feedItems(xml, feed), 10 * MINUTE))) : [],
  ]);
  signal.throwIfAborted();
  const lines = [], sources = [], queries = [];
  if (rateText) { lines.push(rateText.line); sources.push({ title: rateText.source.name, uri: rateText.source.home }); }
  if (weatherText) { lines.push(weatherText); sources.push({ title: WEATHER.name, uri: WEATHER.home }); }
  const read = feeds.filter(list => list?.length);
  if (read.length) {
    const unique = list => { const seen = new Set(); return list.sort((a, b) => b.time - a.time).filter(i => { const t = normalize(i.title); return !seen.has(t) && seen.add(t); }); };
    const all = unique(read.flat());
    const words = [...new Set(q.split(/[^\p{L}\p{N}-]+/u).filter(w => w.length >= 3 && !STOP.has(w)))].slice(0, 6);
    // Uzbek words take suffixes (Madridning, Toshkentdagi), so a long word is matched by its start; two words must both match.
    const stems = words.map(w => w.length > 5 ? w.slice(0, Math.max(5, w.length - 4)) : w), need = stems.length <= 2 ? stems.length : Math.ceil(stems.length * 0.6);
    const found = stems.length ? all.filter(i => { const t = normalize(`${i.title} ${i.text}`); return stems.filter(s => t.includes(s)).length >= need; }).slice(0, 8) : [];
    // Without a topic (or with nothing on it), the newest few from every site, so one busy site does not fill the list.
    const sport = SPORT.test(q), general = read.filter(list => Boolean(FEEDS.find(f => f.name === list[0].source).sport) === sport);
    const chosen = found.length ? found : unique((general.length ? general : read).flatMap(list => list.slice(0, 4)));
    if (words.length) queries.push(words.join(' '));
    if (words.length && !found.length) lines.push(`«${words.join(' ')}» haqida bu saytlarda alohida xabar topilmadi; quyida eng so‘nggi umumiy yangiliklar.`);
    lines.push(`Yangiliklar (${[...new Set(chosen.map(i => i.source))].join(', ')}):`, ...chosen.map(i => `- [${i.source}, ${i.time ? when(i.time) : 'sana yo‘q'}] ${i.title}${i.text && i.text !== i.title ? ` — ${i.text}` : ''}`));
    if (found.length) sources.push(...found.slice(0, 5).map(i => ({ title: `${i.source}: ${i.title}`.slice(0, 80), uri: i.link })));
    else for (const feed of FEEDS) if (chosen.some(i => i.source === feed.name)) sources.push({ title: feed.name, uri: feed.home });
  }
  if (!lines.length) return null;
  return { file: { kind: 'text', name: `Internetdan olingan ma’lumot (${stamp(now())}, Toshkent vaqti)`, text: lines.join('\n') }, sources, queries };
}

module.exports = { fresh, feedItems, clean, normalize, rateLine, marketLine, weatherLine, FEEDS, RATES, MARKET, CITIES };
