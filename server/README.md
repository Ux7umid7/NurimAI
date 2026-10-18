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

/health ochiq bo‘lib faqat tayyorlikni qaytaradi; kalit yoki hisob ma’lumotlarini bermaydi. /chat JSON body: question, history (user/assistant juftlari), tasodifiy UUID deviceId. Worker real CF-Connecting-IP orqali cheklaydi. Browser Origin yuborgan so‘rovlar rad qilinadi. Bu desktop API uchun qo‘shimcha cheklov, autentifikatsiya emas.

Xato sababini ko‘rish: npx wrangler tail --config server/wrangler.jsonc. Worker faqat AI xizmati qaytargan HTTP kod va xato matnini yozadi; savol, suhbat va kalitlar yozilmaydi. Observability o‘chiq, shuning uchun bu log saqlanmaydi.

workers.dev URL, xabar matnlari va maxfiy kalitlar GitHub Actions logiga chiqarilmasin. Ommaviy relizdan oldin /health hamda bitta qisqa jonli chat sinovini bajaring.
