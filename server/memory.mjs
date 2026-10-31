// The Telegram bot's memory commands; the memory itself is src/shared/memory.js (the router adds it to each question).
import memoryModule from '../src/shared/memory.js';
export const { MAX_FACTS, MEMORY_ASK, memoryNote, withMemory, splitMemory, mergeFacts, cleanFacts } = memoryModule;
export const MEMORY_TEXTS = Object.freeze({
  list: facts => facts.length ? `🧠 <b>Siz haqingizda eslab qolganlarim</b>\n${facts.map(f => `• ${f.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`).join('\n')}\n\nO‘chirish: /unut` : 'Hali siz haqingizda hech narsa eslab qolmadim. O‘zingiz haqingizda aytsangiz (masalan: «Men 8-sinfda o‘qiyman, matematikani yaxshi ko‘raman»), keyingi javoblarda hisobga olaman.',
  forgot: '🧹 Xotira tozalandi: siz haqingizda eslab qolganlarimni o‘chirdim.'
});
