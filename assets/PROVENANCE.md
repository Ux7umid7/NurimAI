# Rasmlar va animatsiyalar manbasi

## Qahramon Nur (0.5.0 dan)

Manba: foydalanuvchining Blender loyihasi `claude big papka/ustozimnurim icons 3d/Nur_mascot.blend` (Blender 5.1, Cycles, Geometry Nodes jun). Asl fayl o‘zgartirilmaydi; ilova uchun animatsiyalar `scripts/nur_app_anim.py` bilan `Nur_app.blend` nusxasida quriladi.

- `nur/idle.webm`, `nur/think.webm`, `nur/happy.webm` — 360×450, 24 fps, shaffof fonli WebM (VP9 + alfa). Kadrlar `nur_app_anim.py -- render`, video `-- encode` bilan olinadi.
- `nur/still.png` — kutish animatsiyasining 1-kadri (video yuklanguncha va “kamroq harakat” rejimida ko‘rinadi).
- `nur/avatar.png` — `output/Nur_kitob_4K_shaffof.png` dan bosh qismi, 160×160.
- `mascot.png` — o‘sha 4K shaffof renderdan qirqilgan to‘liq qomat (supa ostidagi soya chetlari silliqlangan). Sayt rasmlari (`docs/mascot.webp`, `docs/og.jpg`) `npm run icons` bilan shundan yasaladi.

## Ilova belgisi

`icon.svg` — foydalanuvchi bergan `icon-source.jpg` dan vektorga o‘girilgan U+N belgisi (asl rasmdan 0,13% pikselda farq qiladi, faqat chegaralarda). `Nuri.ico`, `icon-mac.png`, `trayTemplate*.png` va sayt belgilari `npm run icons` bilan shundan yasaladi.
