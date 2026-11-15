// What NurimAI tells the AI and how it asks Gemini: one copy for the router (desktop and the server) and for the phone app,
// which asks Gemini itself when the user gave their own key (docs/app/lib/prompt.js, copied by npm run mobile:sync).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.NurimPrompt = factory(); })(typeof self !== 'undefined' ? self : this, function () {
const INSTRUCTION = "Sen NurimAI — ekran chetida yashaydigan momiq qahramon, foydalanuvchining mehribon ustozi va do‘sti. Foydalanuvchi tilida, odatda o‘zbek lotin yozuvida qisqa va tushunarli javob ber. Savollar, o‘qish, yozish, tarjima va rejalashda yordam ber. Faqat javob berib qo‘ymay, tushunishga yordam ber: kerak bo‘lsa misollar bilan tushuntir, murakkab mavzuda keyingi qadamni taklif qil. Iliq, samimiy ohangda yoz, lekin ortiqcha maqtov va uzun kirish so‘zlarisiz. Oddiy matn, qisqa ro‘yxat, kerak bo‘lsa **qalin** so‘z va kod bloki ishlat. Matematikani LaTeX’siz, oddiy belgilar bilan yoz: 1/2, x², √9, 3 × 4, 90°; $ belgisi va LaTeX buyruqlarini ishlatma. Bilmagan narsangni ayt, manbalarni to‘qima. Foydalanuvchi o‘zi biriktirgan rasm, skrinshot, fayl, stiker va ovozli xabarlarni ko‘ra va eshita olasan: ularni diqqat bilan o‘qib, javobni shularga tayanib ber. Savolga «Internetdan olingan ma’lumot» biriktirilgan bo‘lsa, uni NurimAI hozirgina yangilik saytlari, Markaziy bank va ob-havo xizmatidan olgan: yangilik, kurs yoki ob-havo haqida shunga tayan, eng muhimini qisqa ayt, manba nomi va sanasini ko‘rsat, unda yo‘q narsani to‘qima; savolga aloqasi bo‘lmasa, e’tibor berma. Bunday ma’lumot berilmagan bo‘lsa, eng so‘nggi yangilik va kurslarni bilmasligingni ochiq ayt. Boshqa fayllar, ekran yoki kompyuterga o‘zing kira olmaysan; kirayotganingni aytma. Faqat NurimAI dasturi «kompyuter fayllari asboblari»ni biriktirgan bo‘lsa, foydalanuvchi ruxsat bergan papkalar bilan o‘sha asboblar orqali ishlaysan.";
// Questions about fresh facts (news, rates, weather, results) get what NurimAI reads from the internet (web.cjs); homework does not.
const FRESH = /yangilik|news|новост|ob-?havo|havo (qanday|necha|issiq|sovuq)|weather|погод|valyuta|(dollar|evro|yevro|rubl) kursi|(dollar|evro|yevro|rubl) (qancha|necha)|kurs(i)? (qancha|necha|qanday)|курс (доллар|валют|рубл|евро)|bugun(gi)? nima (gap|bo)|hozir(gi)? (nima gap|vaziyat|holat)|dunyoda nima|so['‘’`]?nggi (yangilik|voqea|xabar|natija)|oxirgi (yangilik|voqea|xabar|natija)|kim yutdi|hisob(i)? qanday|internet(dan|da)|qidirib (ber|top)|today|latest|this week|current news|сегодня|последн(ие|яя) (новост|событ)/i;
function needsSearch(question) { return FRESH.test(String(question || '')); }
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REFUSAL = 'Bu so‘rovga javob bera olmayman. Boshqa savol bilan yordam beraman.';
const BLOCKED = ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY'];
// files: [{kind:'text',name,text}] are inlined into the question; images, PDFs and audio come back as media for the provider.
function withAttachments(question, files = []) {
  const media = files.filter(f => f.kind !== 'text');
  const prompt = [...files.filter(f => f.kind === 'text').map(f => `Biriktirilgan fayl: ${f.name}\n"""\n${f.text}\n"""`), ...(media.length ? [`Biriktirilgan: ${media.map(f => f.name).join(', ')}`] : []), question].join('\n\n');
  return { prompt, media };
}
// turns: [{role:'user'|'assistant', text}], the last one the question; media goes with it. long: a referat or presentation plan.
function geminiBody(turns, media = [], long = false) {
  return { systemInstruction: { parts: [{ text: INSTRUCTION }] }, contents: turns.map((t, i) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [...(i === turns.length - 1 ? media.map(f => ({ inlineData: { mimeType: f.mime, data: f.data } })) : []), { text: t.text }] })), generationConfig: { maxOutputTokens: long ? 8192 : 3200 } };
}
// The answer's text without hidden thoughts; a blocked answer becomes a polite refusal. An empty text is the caller's to handle.
function geminiReply(data) {
  const candidate = data?.candidates?.[0];
  if (data?.promptFeedback?.blockReason || BLOCKED.includes(candidate?.finishReason)) return { text: REFUSAL, incomplete: false };
  return { text: (candidate?.content?.parts || []).filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('\n'), incomplete: candidate?.finishReason === 'MAX_TOKENS' };
}
return { INSTRUCTION, FRESH, needsSearch, GEMINI_MODEL, GEMINI_URL, REFUSAL, withAttachments, geminiBody, geminiReply };
});
