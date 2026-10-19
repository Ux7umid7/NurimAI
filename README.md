# NurimAI

Mac va Windows uchun ekran chetida turadigan AI yordamchi. Qahramonni bosing, savol yozing. Oddiy foydalanuvchidan API kaliti so‘ralmaydi: so‘rov NurimAI serveri orqali Gemini yoki Groq’ga yuboriladi.

📖 Loyiha haqida batafsil — nima uchun kerak, texnologiyalar, server va API, AI modellari: **[HAQIDA.md](HAQIDA.md)**

## Foydalanuvchi uchun

Yuklab olish sahifasi: https://ux7umid7.github.io/NurmiAI/ — Windows va Mac tugmalari hamda o‘rnatish ko‘rsatmasi shu yerda. Guruhga shu havolani bering.

Windows: Setup EXE bir bosishda o‘rnatiladi, yorliq qo‘yadi va dasturni ochadi. SmartScreen chiqsa More info → Run anyway. Eski portable ZIP o‘zini yangilay olmaydi; yangi Setup’ni bir marta o‘rnatish kerak.

Mac: universal DMG Intel va Apple Silicon uchun. App’ni Applications’ga ko‘chiring. Developer ID sertifikati bo‘lmasa ilova ad-hoc imzolanadi: birinchi ochishda System Settings → Privacy & Security → Open Anyway kerak. Mac avtomatik yangilanishi faqat Developer ID bilan imzolangan va notarizatsiya qilingan relizda ishlaydi; aks holda yangi versiya sahifadan qo‘lda yuklanadi.

Qahramonni sudrab chetga suring; bosing — chat ochiladi/yig‘iladi. Enter yuboradi, Shift+Enter yangi qator. Ctrl/Command+Alt+Space tez ochadi. Tray menyusidagi Chiqish dasturni to‘liq yopadi. Suhbat xotirada turadi: chiqishdan oldin kerakli matnni TXT qilib saqlang.

Fayllar (0.4.0+): 📎 tugmasi, oynaga sudrab tashlash yoki Ctrl+V bilan rasm, skrinshot, PDF (7 MB gacha), Word (.docx), Excel (.xlsx), PowerPoint (.pptx), matn/CSV yuboriladi; suhbatda 5 tagacha. Office va matn fayllari ilova ichida matnga aylantiriladi (src/attachments.cjs, tashqi kutubxonasiz), rasm va PDF Gemini’ga o‘zicha boradi. Ekran tugmasi NurimAI oynalarini yashirib, joriy monitorni suratga oladi (Mac’da Screen Recording ruxsati kerak). Dastur faqat foydalanuvchi bergan faylni o‘qiydi; papkalarni o‘zi ochmaydi.

Bepul AI limiti barcha foydalanuvchilar orasida umumiy. Standart server limiti: jami 200 so‘rov/kun, qurilmaga 30/kun, IP manzilga 60/kun va 4/minut. Limit tugasa kutish kerak. Shaxsiy API kalitlari ixtiyoriy qo‘shimcha sozlama; ular OS shifrlashi bilan saqlanadi.

## Reliz tartibi

1. GitHub Actions har push’da Mac/Windows testlari va paketlarini yig‘adi.
2. Server Cloudflare Workers’da (server/README.md); manzili GitHub repository variable NURIMAI_GATEWAY_URL’da.
3. Yangi versiya: package.json versiyasini oshiring, RELEASE-NOTES.md (“- ” bilan boshlangan qatorlar saytdagi “Nima yangi”ga chiqadi) va src/whats-new.json’ni yozing, commit qiling va mos vX.Y.Z tag yuboring. Barcha buildlar o‘tgach GitHub Release yaratiladi. Reliz job’i gateway manzilisiz ommaviy reliz chiqarmaydi. Server o‘zgargan bo‘lsa, relizdan oldin wrangler deploy qiling: eski ilovalar ham shu serverga ulanadi.
4. Releasega doimiy nomli NurimAI-Windows-Setup.exe va NurimAI-Mac.dmg ham qo‘shiladi, shuning uchun sahifadagi havolalar har doim eng yangi versiyani beradi.
5. Yuklab olish sahifasi docs/ papkasida, GitHub Pages (main, /docs) orqali chiqadi.

Ikonkalar assets/icon.svg’dan yaratiladi (asli: assets/icon-source.jpg): npm run icons Windows .ico, Mac ikonkasi, Mac menyu paneli shabloni va sayt rasmlarini qayta yasaydi.

Yangilanish boshlanishdan 30 soniya keyin va har 6 soatda tekshiriladi. Windows Setup versiyasi fonda yuklaydi va dasturdan to‘liq chiqishda o‘rnatadi. Ochiq suhbat majburan uzilmaydi. Sozlamalarda avtomatik yangilanishni o‘chirish, qo‘lda tekshirish va tayyor yangilanishni o‘rnatish mumkin. Oddiy oynani yig‘ishtirish dasturdan chiqish emas.

## Mahalliy ishlab chiqish

Node.js 24 talab qilinadi.

    npm ci
    npx install-electron --no
    npm test
    npm run test:ui
    npm start
    npm run dist:win

Mac’da: npm run dist:mac. Windows’da Mac build bajarilmaydi; GitHub’dagi macOS runner ishlatiladi. CI testlari haqiqiy Mac foydalanuvchisining Gatekeeper, Keychain va ko‘p monitorli desktop tekshiruvini to‘liq almashtirmaydi.

## Mac imzolash

Repo Secrets: MAC_CERTIFICATE (Developer ID Application .p12 base64), MAC_CERTIFICATE_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID. Kalit va sertifikatlarni repoga yoki chatga yozmang. Ular bo‘lmasa CI imzosiz paket yaratadi va dastur Mac auto-updater’ini yoqmaydi. Sertifikatlar mavjud bo‘lganda build imzolash/notarizatsiya xatosida to‘xtaydi; imzoni tekshirish chetlab o‘tilmaydi.

## Ma’lumotlar va xavfsizlik

- API kalitlari faqat Cloudflare Secrets’da; GitHub, frontend va o‘rnatish paketlariga kiritilmaydi.
- Savol, biriktirilgan fayllar va yaqin suhbat konteksti server va tanlangan AI xizmatiga yuboriladi. Server kodida suhbat yoki faylni saqlash/jurnalga yozish yo‘q. Cloudflare observability o‘chirilgan.
- Rate limiting uchun kunlik saltlangan IP/device xeshlari va hisoblagichlar saqlanadi; ertasi kuni yozuv almashtiriladi. Qurilma ID’si tasodifiy, qurilma fingerprinti emas.
- Login talab qilmaydigan ommaviy serverda suiiste’molni butunlay yo‘qotib bo‘lmaydi. Qattiq umumiy kunlik budjet va server tomonidagi tekshiruvlar qo‘yilgan; ilova ichida yashirin token yo‘q.
- Electron renderer’da Node o‘chirilgan, sandbox/context isolation/CSP yoqilgan; AI javobi HTML sifatida bajarilmaydi.
- O‘rnatuvchi va yangilanish HTTPS GitHub Releases’dan olinadi; electron-updater hashlarni va mavjud kod imzosini tekshiradi. Mac imzosi bo‘lmasa auto-install ishlatilmaydi.

Qahramon hozir 2D rasm. Mikrofon va kompyuterni boshqarish bu versiyaga kirmaydi.
