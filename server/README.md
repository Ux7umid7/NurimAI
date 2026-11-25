# NurimAI API serveri

Cloudflare Workers Free + SQLite Durable Object. Worker kiruvchi so‘rovni tekshiradi; Durable Object umumiy kunlik cheklovni atomik saqlaydi va Gemini → Groq avtomatik almashishini bajaradi. API kalitlari mijozga qaytmaydi.

## Bir marta sozlash

Loyiha ildizidan:

    npx wrangler login
    npx wrangler deploy --config server/wrangler.jsonc
    npx wrangler secret put GEMINI_API_KEY --config server/wrangler.jsonc
    npx wrangler secret put GROQ_API_KEY --config server/wrangler.jsonc
    npx wrangler secret put RATE_SALT --config server/wrangler.jsonc

RATE_SALT uchun kamida 32 baytli tasodifiy qiymat yarating. Kalitlarni terminalning maxfiy so‘roviga yoki Cloudflare Secrets oynasiga kiriting; buyruq argumenti, GitHub fayli yoki chatga joylamang. API kalitlari kiritilmaguncha /health ready=false qaytaradi.

GEMINI_FREE_TIER va GROQ_FREE_TIER true bo‘lsa xizmat ishlaydi. Bu sozlama operator tasdig‘i, hisob billingini avtomatik tekshirmaydi. Hisoblarni pullik tarifga o‘tkazmang.

Worker manzilini src/release-config.json uchun configure-release skriptiga va GitHub repository Variables ichidagi NURIMAI_GATEWAY_URL ga kiriting. URL faqat HTTPS origin bo‘lishi kerak, masalan https://nurimai-api.ACCOUNT.workers.dev. Bu misolni haqiqiy manzilingiz bilan almashtiring.

GitHub bilan Cloudflare avtomatik build ulansa: root papka loyiha ildizi, build npm ci, deploy npx wrangler deploy --config server/wrangler.jsonc. AI kalitlarini faqat Worker Settings → Variables and Secrets’da Secret sifatida saqlang.

## Tekshirish

    npx wrangler deploy --config server/wrangler.jsonc --dry-run
    npm test

/health ochiq bo‘lib faqat tayyorlikni qaytaradi; kalit yoki hisob ma’lumotlarini bermaydi. /chat JSON body: question, history (user/assistant juftlari), tasodifiy UUID deviceId va ixtiyoriy files (0.4.0+): 5 tagacha {kind:'text',name,text} yoki {kind:'image'|'pdf',name,mime,data(base64)}. So‘rov 14 MB dan oshsa 413, AI fayl/savolni rad etsa 422 qaytadi. Rasm va PDF faqat Gemini’ga boradi. files maydoni bo‘lmagan 0.3.0 mijozlar ham ishlayveradi, shuning uchun serverni ilova relizidan oldin deploy qilish xavfsiz. Worker real CF-Connecting-IP orqali cheklaydi. Browser Origin yuborgan so‘rovlar rad qilinadi. Bu desktop API uchun qo‘shimcha cheklov, autentifikatsiya emas.

Xato sababini ko‘rish: npx wrangler tail --config server/wrangler.jsonc. Worker faqat AI xizmati qaytargan HTTP kod va xato matnini yozadi; savol, suhbat va kalitlar yozilmaydi. Observability o‘chiq, shuning uchun bu log saqlanmaydi.

workers.dev URL, xabar matnlari va maxfiy kalitlar GitHub Actions logiga chiqarilmasin. Ommaviy relizdan oldin /health hamda bitta qisqa jonli chat sinovini bajaring.

## AI qavatlari (0.8.7)

Model va ko‘rsatmadan tashqari har bir savol shu qavatlardan o‘tadi (kod: src/router.cjs, src/shared/guard.js, src/rag.cjs):

- **Himoya** — telefon, karta, pasport, JSHSHIR, e-mail va parol AI xizmatiga yuborilmasdan yashiriladi; “ko‘rsatmalaringni unut” kabi buyruqqa server AI’dan so‘ramay o‘zi javob beradi; fayl va sahifa ichidagi yashirin buyruq belgilanadi; xavf ostidagi bolaga javob har doim 103 va ishongan kattani eslatadi.
- **Kesh** — ilova `cache: true` deb yuborgan birinchi chat savoliga javob Durable Object xotirasida 3 kun saqlanadi va bir xil savolga AI’dan qayta so‘ralmaydi. Davomli suhbat, fayl, yangilik/kurs/ob-havo, shaxsiy ma’lumot, xotiradagi faktlar bilan berilgan javob hech qachon saqlanmaydi. Eskirganlari cron tick’da o‘chiriladi.
- **Arzon/kuchli model** — salom-alik avval Groq’ga, matematika va kod avval GPT-OSS’ga, qolganlari odatdagi tartibda (Gemini birinchi).
- **Treys** — `npx wrangler tail --config server/wrangler.jsonc` har javob uchun bitta qator ko‘rsatadi: `chat: odatiy savol → Gemini ✗ → GPT ✓ · 1240 ms`. Savol matni yozilmaydi.
- **Evallar** — `npm run eval` evals/cases.json’dagi ~24 savolni serverga beradi va javoblarni tekshiradi (bilim, matematika, format, til, halollik, himoya). Ko‘rsatma, model yoki yo‘nalish o‘zgarganda deploy’dan keyin ishga tushiring; har savol kunlik bepul limitdan bittadan oladi.

## Kunlik hisobot (bot egasiga)

@NurimAI_bot har kuni Toshkent vaqti 09:00 da faqat bot egasiga kechagi hisobotni yuboradi. `/hisobot` buyrug'i bugungi holatni istalgan vaqtda ko'rsatadi (faqat egasiga). Hisobotdagi bo'limlar:

- **API kalitlardan qancha qolgani.** Gemini bepul kalitining qoldig'ini Google bermaydi, shuning uchun server Gemini'ga yuborgan har bir so'rovni o'zi sanaydi. Sanoq model bo'yicha (chat, ovoz, jonli suhbat) va Tinch okeani yarim tunidan (Toshkent 12:00/13:00) boshlanadi. Kunlik limit `GEMINI_DAILY_LIMIT` dan olinadi (AI Studio'dagi rate limit sahifasidagi RPD soni). U berilmasa, Google'ning birinchi "kunlik limit tugadi" (429) javobidan avtomatik aniqlanadi. Groq qoldig'i Groq'ning o'z sarlavhalaridan olinadi.
- **NurimAI'ning o'z kunlik limitlari** (ilovalar, bot, guruhlar, ovoz, jonli suhbat): necha foizi ishlatilgani, nechta qurilma yoki kishi kirgani va kimlar limitga yetgani.
- **AI xizmatlari:** qaysi biri nechta javob bergani, limit (429) va xatolar.
- **Kesh, himoya va o'rtacha javob vaqti.**

Ogohlantirishlar darhol keladi (kuniga bir martadan): Gemini limitining 90% ishlatilganda va limit tugaganda.

Sozlash:

1. Deploy qiling.
2. Botga `/id` yozing — u Telegram ID raqamingizni aytadi.
3. ID'ni `OWNER_TELEGRAM_ID` maxfiy kaliti sifatida kiriting.
4. Ixtiyoriy: `GEMINI_DAILY_LIMIT` ni ham kiriting.

Faqat sonlar saqlanadi: savol, javob yoki shaxsiy ma'lumot saqlanmaydi. Ma'lumotlar 15 kundan keyin o'chiriladi.

## O'qituvchi roli (guruhlarda vazifa)

Guruh admini (o'qituvchi) guruhda `/vazifa Matn` yozadi. Bot vazifani "✍️ Javob yuborish" tugmasi bilan joylaydi.

- O'quvchi tugmani bosganda bot bilan shaxsiy chat ochiladi. Javob shu yerda yoziladi va sinfdoshlarga ko'rinmaydi.
- Har bir javobga AI taxminiy baho (0–10) va bitta izoh beradi; bu guruhning AI limitidan oladi.
- Natijalar faqat o'qituvchiga shaxsiy xabarda keladi:
  - muddat tugaganda (24 soat);
  - guruhda `/yopish` yozilganda;
  - istalgan vaqtda `/natijalar` bilan.
- Guruhga baho chiqmaydi, o'quvchilar ham baholarni ko'rmaydi.
- O'qituvchi natijalarni olishi uchun botga shaxsiy xabarda bir marta /start yozgan bo'lishi kerak. Yozmagan bo'lsa, bot buni guruhda eslatadi.
- Har guruhda oxirgi 5 ta vazifa saqlanadi.

Deploy'dan keyin admin buyruqlari menyusini yangilash uchun `/telegram/setup` ni qayta oching.
