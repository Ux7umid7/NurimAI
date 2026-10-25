// Light or dark: the user's choice in Settings (Tizim / Yorug‘ / Qorong‘i), kept on this device; "Tizim" follows the system.
// Loaded in <head> before the styles, so the first frame already has the right colours. Shared by the desktop and phone apps.
(function (root) {
  'use strict';
  const KEY = 'nurim.theme', CHOICES = ['system', 'light', 'dark'];
  const media = typeof root.matchMedia === 'function' ? root.matchMedia('(prefers-color-scheme: light)') : null;
  function get() { try { const value = root.localStorage.getItem(KEY); return CHOICES.includes(value) ? value : 'system'; } catch { return 'system'; } }
  function apply(choice = get()) {
    const light = choice === 'light' || (choice === 'system' && Boolean(media && media.matches));
    root.document.documentElement.dataset.theme = light ? 'light' : 'dark';
    // The phone's status bar follows theme-color; both tags get the chosen colour, whatever the system says.
    for (const meta of root.document.querySelectorAll('meta[name="theme-color"]')) meta.content = light ? '#F6F1E7' : '#121317';
    return light ? 'light' : 'dark';
  }
  function set(choice) {
    if (!CHOICES.includes(choice)) return get();
    try { root.localStorage.setItem(KEY, choice); } catch {}
    apply(choice); return choice;
  }
  // Settings: the radio buttons named "theme" inside `group` show the current choice and apply a new one at once.
  function bind(group) {
    for (const input of group.querySelectorAll('input[name="theme"]')) { input.checked = input.value === get(); input.onchange = () => { if (input.checked) set(input.value); }; }
  }
  if (media && media.addEventListener) media.addEventListener('change', () => apply());
  root.NurimTheme = { get, set, apply, bind, CHOICES };
  apply();
})(window);
