# Rasmlar va animatsiyalar manbasi

## Qahramon (0.6.0 dan)

Manba: foydalanuvchi bergan `personaj_1v.glb` modeli va ikkita konsept rasm (momiq tuxumsimon qahramon, oltinrang qosh, nur sochuvchi tutam). Ishlov `claude big papka/ustozimnurim icons 3d` loyihasida bajariladi, foydalanuvchining asl `.blend` fayllari o‘zgartirilmaydi:

- `scripts/pufak_app.py` — modelni `Nur_shogirt_mascot.blend` sahnasiga (yorug‘lik, kamera, jun) olib kiradi, rangini konseptga moslaydi, tutamga nur beradi → `Pufak_app.blend`.
- `scripts/pufak_rig.py` — skelet (tana, qo‘llar, ko‘zlar, qoshlar, tutam), ko‘z qovoqlari va og‘iz qatlami (asl tabassum ustidan xafa, yumuq, “hmm” va gapiruvchi og‘iz chiziladi).
- `scripts/pufak_anim.py` — 9 ta animatsiya (uyqudagi “z” harflari va uchib keladigan varaq ham shu yerda), render, kadr tozalash va WebM.

Fayllar:

- `nur/idle.webm`, `think.webm`, `happy.webm`, `wave.webm`, `sleep.webm`, `sad.webm`, `catch.webm`, `talk.webm`, `listen.webm` — 360×450, 24 fps, shaffof fonli WebM (VP9 + alfa). Kadrlar `pufak_anim.py -- render`, video `-- encode` bilan olinadi (soya ushlagich izi va nurning butun kadrga yoyilgan xira qatlami tozalanadi).
- `nur/still.png` — kutish animatsiyasining 1-kadri (video yuklanguncha va “kamroq harakat” rejimida ko‘rinadi).
- `nur/avatar.png` — `pufak_anim.py -- hero` (1080×1350) renderidan bosh qismi, 160×160.
- `mascot.png` — o‘sha renderdan to‘liq qomat. Sayt rasmlari (`docs/mascot.webp`, `docs/og.jpg`) `npm run icons` bilan shundan yasaladi.

0.5.0 dagi kitobli Nur (`Nur_mascot.blend`, `scripts/nur_app_anim.py`) git tarixida qoladi.

## Ilova belgisi

`icon.svg` — foydalanuvchi bergan `icon-source.jpg` dan vektorga o‘girilgan U+N belgisi (asl rasmdan 0,13% pikselda farq qiladi, faqat chegaralarda). `Nuri.ico`, `icon-mac.png`, `trayTemplate*.png` va sayt belgilari `npm run icons` bilan shundan yasaladi.
