// The hero the user picked in Settings: Pufak (the student, the default) or Nur (the teacher). Shared by the desktop and phone apps.
// Each hero's 2D art is in its own folder (assets/<art>/ on the desktop, <art>/ in the phone app); a mood without its own picture
// shows the hero's main one. Loaded in <head> after theme.js, so pictures are switched before they are seen.
(function (root) {
  'use strict';
  const KEY = 'nurim.character';
  // moods: the pictures the hero has (besides the main one); clips: the desktop pet's 3D clips folder ('' = the main picture only).
  const LIST = Object.freeze({
    pufak: Object.freeze({ id: 'pufak', name: 'Pufak', role: 'shogirt', art: 'pufak', hero: 'pufak', clips: 'nur',
      moods: Object.freeze(['avatar', 'catch', 'happy', 'idea', 'sad', 'sleep', 'talk', 'think', 'wave', 'wink']) }),
    ustoz: Object.freeze({ id: 'ustoz', name: 'Nur', role: 'ustoz', art: 'ustoz', hero: 'ustoz', clips: '',
      moods: Object.freeze(['avatar']) })
  });
  function get() { try { const id = root.localStorage.getItem(KEY); return Object.hasOwn(LIST, id) ? id : 'pufak'; } catch { return 'pufak'; } }
  function info(id = get()) { return LIST[id] || LIST.pufak; }
  // mood: a picture name (think, happy, avatar…) or 'hero'; base: where the art folders are ('../assets/' on the desktop, '' on the phone).
  function src(mood, base = '', id = get()) { const c = info(id); return `${base}${c.art}/${c.moods.includes(mood) ? mood : c.hero}.webp`; }
  // Pictures marked <img data-art="think"> and the CSS pictures (--char-avatar, --char-happy) follow the hero.
  function apply(base = '', doc = root.document) {
    const c = info(), html = doc.documentElement;
    html.dataset.character = c.id;
    for (const img of doc.querySelectorAll('img[data-art]')) { const next = src(img.dataset.art, base); if (img.getAttribute('src') !== next) img.src = next; }
    html.style.setProperty('--char-avatar', `url("${src('avatar', base)}")`);
    html.style.setProperty('--char-happy', `url("${src('happy', base)}")`);
    return c;
  }
  function set(id) {
    if (!Object.hasOwn(LIST, id)) return get();
    try { root.localStorage.setItem(KEY, id); } catch {}
    return id;
  }
  // Settings: the radio buttons named "character" inside `group` show the current hero and switch to a new one at once.
  function bind(group, onChange) {
    for (const input of group.querySelectorAll('input[name="character"]')) {
      input.checked = input.value === get();
      input.onchange = () => { if (input.checked) { set(input.value); if (onChange) onChange(info(input.value)); } };
    }
  }
  const api = { get, set, info, src, apply, bind, LIST, KEY };
  root.NurimCharacter = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
