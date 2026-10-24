'use strict';
// Tugmalar va ishga tushirish (app.js, voice.js va ustoz.js yuklangandan keyin).
$('composer').onsubmit = event => { event.preventDefault(); askText($('question').value.trim()); };
$('question').oninput = grow;
$('question').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && finePointer) { event.preventDefault(); $('composer').requestSubmit(); } };
$('stop').onclick = () => window.nurim.stop();
$('new').onclick = newChat; $('drawer-new').onclick = () => { closeDrawer(); newChat(); };
$('menu').onclick = openDrawer; $('scrim').onclick = closeDrawer;
$('history-search').oninput = renderHistory;
$('ustoz').addEventListener('click', closeDrawer); // ustoz.js o'zi Ustoz sahifasini ochadi
$('settings').onclick = () => { closeDrawer(); $('auto-speak').checked = state.settings.autoSpeak !== false; $('save-history').checked = state.settings.saveHistory !== false; $('version').textContent = `NurimAI ${state.version} · ${NATIVE ? 'Android ilova' : 'veb-ilova'}`; $('settings-dialog').showModal(); };
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
  if (NATIVE) {
    const App = window.capacitorApp?.App;
    App?.addListener('backButton', () => { const open = document.querySelector('dialog[open]'); if (open) open.close(); else if (!$('drawer').hidden) closeDrawer(); else if (recorder) stopRecording(false); else App.minimizeApp(); });
    App?.addListener('appStateChange', ({ isActive }) => { if (isActive) greet(); });
    Notify?.addListener('localNotificationActionPerformed', ({ notification }) => { if (notification?.extra?.panel === 'ustoz') openUstoz(); });
    scheduleReminders();
  } else if ('serviceWorker' in navigator && location.protocol === 'https:' && !QA) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
