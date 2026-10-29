const { UserError } = require('./router.cjs');
function validateGateway(value) {
  if(!value) return '';
  const url = new URL(value);
  if(url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Gateway must be an HTTPS origin');
  return url.origin;
}
// long: a referat or presentation plan (a longer reply, so a longer wait).
async function askGateway({ url, deviceId, history, question, signal, files = [], voice = false, long = false, fetcher = fetch }) {
  const origin = validateGateway(url);
  if(!origin) throw new UserError('NurimAI serveri hali ulanmagan. Yangi versiya tayyor bo‘lishini kuting.');
  const recent=[];let count=0;for(let i=history.length-2;i>=0&&recent.length<12;i-=2){const a=history[i],b=history[i+1];if(a.role!=='user'||b.role!=='assistant')continue;count+=a.text.length+b.text.length;if(count>12000)break;recent.unshift(a,b);}
  const response = await fetcher(`${origin}/chat`,{ method:'POST',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(files.length || long ? 120000 : 90000)]),headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,history:recent,question,...(files.length ? { files } : {}),...(long ? { long: true } : {})}) });
  let data;try{data = await response.json();}catch{throw new UserError('Server javobi o‘qilmadi.');}
  if(!response.ok) throw new UserError({ 429: 'Bepul foydalanish limiti tugadi. Keyinroq qayta urinib ko‘ring.', 413: 'Fayllar juda katta. Keraksizini olib tashlang yoki kichikroq fayl yuboring.', 422: files.length ? 'AI bu fayl yoki savolni qabul qilmadi. Faylni olib tashlang yoki boshqasini yuboring.' : 'AI bu savolni qabul qilmadi. Matnni qisqartiring yoki yangi suhbat boshlang.', 400: voice ? 'Ovozli savolni NurimAI serveri hali qabul qilmayapti (server yangilanishi kerak). Hozircha savolni yozib yuboring.' : files.length ? 'Server bu faylni qabul qilmadi. NurimAI’ni yangilang yoki boshqa fayl yuboring.' : 'So‘rov noto‘g‘ri. NurimAI’ni yangilang.' }[response.status] || 'AI serveri hozir javob bera olmadi. Keyinroq urinib ko‘ring.');
  if(typeof data.text !== 'string' || !data.text.trim() || data.text.length > 40000) throw new UserError('Server javobi o‘qilmadi.');
  return { text:data.text, incomplete:data.incomplete === true, provider:'NurimAI',model:'' };
}
// Voice answer for a piece of text; the server keeps a separate daily limit for it.
async function speakGateway({ url, deviceId, text, signal, fetcher = fetch }) {
  const origin = validateGateway(url);
  if(!origin) throw new UserError('NurimAI serveri hali ulanmagan.');
  const response = await fetcher(`${origin}/speak`,{ method:'POST',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(70000)]),headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,text}) });
  let data;try{data = await response.json();}catch{throw new UserError('Ovozli javob o‘qilmadi.');}
  if(!response.ok) throw new UserError({ 404: 'Ovozli javob uchun NurimAI serveri hali yangilanmagan.', 429: 'Bugungi ovozli javoblar limiti tugadi. Ertaga yana tinglay olasiz.' }[response.status] || 'Ovozli javob hozir ishlamayapti. Keyinroq urinib ko‘ring.');
  if(typeof data.audio !== 'string' || !data.audio || data.audio.length > 16 * 1024 * 1024 || !/^audio\/[a-z0-9.+-]+(;.*)?$/i.test(String(data.mime))) throw new UserError('Ovozli javob o‘qilmadi.');
  return { mime: data.mime, audio: data.audio };
}
module.exports = { askGateway, speakGateway, validateGateway };
