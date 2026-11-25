'use strict';
// Tugmalar va ishga tushirish (app.js, voice.js va ustoz.js yuklangandan keyin).
$('composer').onsubmit = event => { event.preventDefault(); askText($('question').value.trim()); };
$('question').oninput = grow;
window.addEventListener('resize', grow); // telefon burilsa yoki oyna o'zgarsa, yozish maydoni balandligi qayta hisoblanadi
$('question').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && finePointer) { event.preventDefault(); $('composer').requestSubmit(); } };
$('stop').onclick = () => window.nurim.stop();
$('new').onclick = newChat; $('drawer-new').onclick = () => { closeDrawer(); newChat(); };
$('menu').onclick = openDrawer; $('scrim').onclick = closeDrawer;
$('history-search').oninput = renderHistory;
$('ustoz').addEventListener('click', closeDrawer); // ustoz.js o'zi Ustoz sahifasini ochadi
$('settings').onclick = () => { closeDrawer(); $('auto-speak').checked = state.settings.autoSpeak !== false; $('save-history').checked = state.settings.saveHistory !== false; $('version').textContent = `NurimAI ${state.version} · ${NATIVE ? 'Android ilova' : 'veb-ilova'}`; NurimTheme.bind($('theme-choice')); NurimCharacter.bind($('character-choice'), c => { NurimCharacter.apply(); heroIdle(); notice(`${c.name} endi siz bilan 🙂`); }); renderMemory(); renderOwnKey(); renderParent(); $('settings-dialog').showModal(); };
// Birinchi kirish: bepul (NurimAI serveri) yoki o'z Gemini kaliti; Sozlamalarda kalitni almashtirish yoki o'chirish.
function openOnboard(own = false) {
  $('onboard-form').elements.mode.value = own ? 'own' : 'free'; onboardMode(); $('onboard-error').textContent = ''; $('own-key-input').value = '';
  NurimCharacter.apply(); $('onboard-sheet').showModal(); if (own) $('own-key-input').focus();
}
function onboardMode() { const own = $('onboard-form').elements.mode.value === 'own'; $('own-key').hidden = !own; $('onboard-go').textContent = own ? 'Saqlash va boshlash' : 'Bepul boshlash'; $('onboard-error').textContent = ''; }
for (const radio of $('onboard-form').elements.mode) radio.onchange = () => { onboardMode(); if ($('onboard-form').elements.mode.value === 'own') $('own-key-input').focus(); };
$('onboard-sheet').oncancel = event => { if (!saved.get('onboarded', false)) event.preventDefault(); }; // birinchi marta tanlov kerak; "Bepul" - odatiy
$('onboard-form').onsubmit = async event => {
  event.preventDefault(); $('onboard-error').textContent = '';
  const own = $('onboard-form').elements.mode.value === 'own', key = $('own-key-input').value.trim();
  if (own) {
    if (!key) { $('onboard-error').textContent = 'Gemini kalitini qo‘ying yoki «Bepul»ni tanlang.'; return; }
    if (/\s/.test(key) || key.length < 20) { $('onboard-error').textContent = 'Bu Gemini kalitiga o‘xshamaydi. Google AI Studio’dan to‘liq nusxa oling.'; return; }
    $('onboard-go').disabled = true;
    try { if (!QA) await checkOwnKey(key); } catch (e) { $('onboard-error').textContent = e.message; return; } finally { $('onboard-go').disabled = false; }
    ownKey.set(key);
  }
  saved.set('onboarded', true); $('own-key-input').value = ''; $('onboard-sheet').close(); renderOwnKey();
  notice(own ? 'Kalit saqlandi: savollar endi to‘g‘ridan-to‘g‘ri Google Gemini’ga boradi.' : 'Bepul rejim: savollarga NurimAI serveri orqali javob beraman 🙂');
};
function renderOwnKey() {
  const key = ownKey.get();
  $('own-key-status').textContent = key ? `Kalit saqlangan (…${key.slice(-4)}). Savollar to‘g‘ridan-to‘g‘ri Google Gemini’ga boradi; ishlamasa — NurimAI bepul serveri.` : 'Kalit kiritilmagan: NurimAI bepul server orqali ishlaydi.';
  $('own-key-set').textContent = key ? 'Kalitni almashtirish' : 'Kalit kiritish'; $('own-key-remove').hidden = !key;
}
$('own-key-set').onclick = () => { if (!parentPin.open()) return; $('settings-dialog').close(); openOnboard(true); };
$('own-key-remove').onclick = () => { if (!parentPin.open()) return; if (!confirm('Gemini kaliti shu telefondan o‘chirilsinmi? NurimAI bepul server orqali ishlaydi.')) return; ownKey.set(''); renderOwnKey(); notice('Kalit o‘chirildi: bepul server orqali ishlayman.'); };
// Ota-ona PIN-kodi: with it set, the own Gemini key cannot be changed or removed without the PIN, which opens it for ten
// minutes; five wrong tries make the next one wait a minute. Kept on this phone only, as a salted PBKDF2 hash.
const parentPin = {
  openUntil: 0, wrong: 0, waitUntil: 0,
  saved: () => saved.get('parent', null),
  open() { return !this.saved() || Date.now() < this.openUntil; },
  async hash(pin, salt) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), c => c.charCodeAt(0)), iterations: 150000 }, key, 256);
    return btoa(String.fromCharCode(...new Uint8Array(bits)));
  }
};
function renderParent() {
  const on = Boolean(parentPin.saved()), locked = on && !parentPin.open();
  $('parent-status').textContent = !on ? 'PIN o‘rnatsangiz, bola o‘z Gemini kalitini o‘zgartira yoki o‘chira olmaydi.' : locked ? '🔒 Kalit sozlamasi qulflangan. O‘zgartirish uchun PIN kiriting.' : `🔓 ${Math.max(1, Math.ceil((parentPin.openUntil - Date.now()) / 60000))} daqiqaga ochiq.`;
  $('parent-pin2').hidden = on; $('parent-pin').hidden = on && !locked; $('parent-go').textContent = !on ? 'PIN o‘rnatish' : locked ? 'Ochish' : 'Qulflash';
  $('parent-off').hidden = !on || locked; $('own-key-set').disabled = $('own-key-remove').disabled = locked; $('parent-pin').value = $('parent-pin2').value = ''; $('parent-error').textContent = '';
}
$('parent-go').onclick = async () => {
  const pin = $('parent-pin').value, p = parentPin.saved(), fail = text => { renderParent(); $('parent-error').textContent = text; };
  if (!p) {
    if (!/^\d{4,8}$/.test(pin)) return fail('PIN 4–8 ta raqamdan iborat bo‘lsin.');
    if (pin !== $('parent-pin2').value) return fail('Ikkala PIN bir xil emas.');
    const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    saved.set('parent', { salt, hash: await parentPin.hash(pin, salt) }); parentPin.openUntil = Date.now() + 600000; renderParent(); notice('PIN o‘rnatildi.'); return;
  }
  if (parentPin.open()) { parentPin.openUntil = 0; renderParent(); return; }
  if (Date.now() < parentPin.waitUntil) return fail(`Juda ko‘p noto‘g‘ri urinish. ${Math.ceil((parentPin.waitUntil - Date.now()) / 1000)} soniyadan keyin qayta kiriting.`);
  if (/^\d{4,8}$/.test(pin) && await parentPin.hash(pin, p.salt) === p.hash) { parentPin.wrong = 0; parentPin.openUntil = Date.now() + 600000; renderParent(); return; }
  if (++parentPin.wrong >= 5) { parentPin.wrong = 0; parentPin.waitUntil = Date.now() + 60000; }
  fail('PIN noto‘g‘ri.');
};
$('parent-off').onclick = () => { if (!parentPin.open()) return; saved.set('parent', null); parentPin.openUntil = 0; renderParent(); notice('PIN o‘chirildi.'); };
// Enter in a PIN field sets or opens it; it must not close the Settings page (its form is method="dialog").
for (const id of ['parent-pin', 'parent-pin2']) $(id).onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); $('parent-go').click(); } };
// Xotira: yoqish/o'chirish, eslab qolinganlar ro'yxati (har birini unutish mumkin).
function renderMemory() {
  const m = memory.get(); $('memory-on').checked = m.enabled; $('memory-empty').hidden = m.facts.length > 0; $('memory-clear').hidden = !m.facts.length;
  $('memory-list').replaceChildren(...m.facts.map((f, i) => { const li = document.createElement('li'), span = document.createElement('span'), x = document.createElement('button'); span.textContent = f.text; x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', `«${f.text}» ni unutish`); x.onclick = () => { const now = memory.get(); now.facts.splice(i, 1); memory.set(now); renderMemory(); }; li.append(span, x); return li; }));
}
$('memory-on').onchange = () => { memory.set({ ...memory.get(), enabled: $('memory-on').checked }); renderMemory(); };
$('memory-clear').onclick = () => { memory.set({ ...memory.get(), facts: [] }); renderMemory(); };
for (const id of ['auto-speak', 'save-history']) $(id).onchange = () => { state.settings = { ...state.settings, autoSpeak: $('auto-speak').checked, saveHistory: $('save-history').checked }; saved.set('settings', state.settings); renderHistory(); };
$('clear-data').onclick = () => {
  if (!confirm('Suhbatlar tarixi, kartochkalar, natijalar va eslatmalar shu telefondan o‘chirilsinmi? Buni qaytarib bo‘lmaydi.')) return;
  try { for (const key of Object.keys(localStorage)) if (key.startsWith('nurim.') && key !== 'nurim.device') localStorage.removeItem(key); } catch {}
  location.reload();
};
for (const button of document.querySelectorAll('[data-prompt]')) button.onclick = () => { $('question').value = button.dataset.prompt; grow(); $('question').focus(); };
for (const button of document.querySelectorAll('[data-file-prompt]')) button.onclick = () => askText(button.dataset.filePrompt);
document.querySelector('[data-action=camera]').onclick = () => $('pick-camera').click();
document.querySelector('[data-action=quiz]').onclick = () => openUstoz('quiz');
$('streak-chip').addEventListener('click', closeDrawer);
$('attach').onclick = () => $('attach-sheet').showModal(); $('attach-close').onclick = () => $('attach-sheet').close();
$('attach-sheet').onclick = event => { if (event.target === $('attach-sheet')) $('attach-sheet').close(); }; // fonga bosilsa yopiladi
for (const button of document.querySelectorAll('[data-pick]')) button.onclick = () => { $('attach-sheet').close(); $(`pick-${button.dataset.pick}`).click(); };
for (const id of ['pick-camera', 'pick-image', 'pick-file']) $(id).onchange = async event => { const list = [...event.target.files]; event.target.value = ''; if (list.length) await addFiles(list); };
document.addEventListener('paste', event => { const list = event.clipboardData?.files; if (list?.length && !busy) { event.preventDefault(); addFiles(list); } });
$('whats-new-close').onclick = () => { $('whats-new').hidden = true; };
document.addEventListener('visibilitychange', () => { if (document.hidden) heroStop(); else { heroIdle(); checkDueReminders(); greet(); } });
// Bosh ekrandagi pastki menyu: tarix, ovozli savol, Ustoz va sozlamalar bir bosishda.
$('tab-home').onclick = () => { $('chat-area').scrollTop = 0; };
$('tab-chats').onclick = openDrawer;
$('tab-voice').onclick = () => $('mic').click();
$('tab-ustoz').onclick = () => openUstoz();
$('tab-settings').onclick = () => $('settings').click();

// O'rnatish: Android Chrome taklif oynasi; iPhone'da Safari orqali "Bosh ekranga qo'shish".
let installPrompt = null;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install').hidden = false; });
$('install').onclick = async () => { closeDrawer(); if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; $('install').hidden = true; };
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
$('install-text').textContent = NATIVE || standalone ? 'NurimAI allaqachon ilova sifatida o‘rnatilgan.' : IOS ? 'Safari’da pastdagi “Ulashish” (⬆︎) tugmasini bosing, so‘ng “Bosh ekranga qo‘shish” (Add to Home Screen) ni tanlang. NurimAI oddiy ilovadek ochiladi.' : 'Android’da brauzer menyusidan “Ilovani o‘rnatish” ni tanlang yoki saytdan NurimAI APK ni yuklab oling.';

async function start() {
  greet(); renderFiles(); renderHistory(); composerState();
  const last = saved.get('lastVersion', '');
  if (last && last !== state.version && CONFIG.whatsNew?.length) { $('whats-new-title').textContent = `NurimAI ${state.version} — nima yangi`; $('whats-new-list').replaceChildren(...CONFIG.whatsNew.map(t => { const li = document.createElement('li'); li.textContent = t; return li; })); $('whats-new').hidden = false; }
  saved.set('lastVersion', state.version);
  mood('wave'); checkDueReminders();
  if (!saved.get('onboarded', false) && (!QA || new URLSearchParams(location.search).has('onboard'))) openOnboard();
  if (NATIVE) {
    const App = window.capacitorApp?.App;
    App?.addListener('backButton', () => { const open = document.querySelector('dialog[open]'); if (open) open.close(); else if (!$('drawer').hidden) closeDrawer(); else if (recorder) stopRecording(false); else App.minimizeApp(); });
    App?.addListener('appStateChange', ({ isActive }) => { if (isActive) greet(); });
    Notify?.addListener('localNotificationActionPerformed', ({ notification }) => { if (notification?.extra?.panel === 'ustoz') openUstoz(); });
    scheduleReminders();
  } else if ('serviceWorker' in navigator && location.protocol === 'https:' && !QA) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
