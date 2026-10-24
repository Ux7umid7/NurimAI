// Copies what the phone app shares with the desktop app into docs/app (served by GitHub Pages and packed into the Android app).
// Run after changing src/shared, src/voice.js, src/ustoz.js or the mascot clips: npm run mobile:sync
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = path.join(root, 'docs', 'app');
const copies = [
  ['src/shared/practice-core.js', 'lib/practice-core.js'], ['src/shared/office-core.js', 'lib/office-core.js'],
  ['src/voice.js', 'lib/voice.js'], ['src/ustoz.js', 'lib/ustoz.js'],
  ...fs.readdirSync(path.join(root, 'assets/nur')).filter(f => f.endsWith('.webm')).map(f => [`assets/nur/${f}`, `nur/${f}`]),
  ...fs.readdirSync(path.join(root, 'assets/mobile/moods')).filter(f => f.endsWith('.png')).map(f => [`assets/mobile/moods/${f}`, `nur/still/${f}`]),
  ['assets/nur/avatar.png', 'nur/avatar.png'],
  // Capacitor's browser bundles (IIFE globals: capacitorExports, capacitorApp, capacitorLocalNotifications); on the web they stay idle.
  ['mobile/node_modules/@capacitor/core/dist/capacitor.js', 'lib/cap/capacitor.js'], ['mobile/node_modules/@capacitor/app/dist/plugin.js', 'lib/cap/app.js'],
  ['mobile/node_modules/@capacitor/local-notifications/dist/plugin.js', 'lib/cap/local-notifications.js']
].filter(([from]) => !from.startsWith('mobile/') || fs.existsSync(path.join(root, from))); // a fresh clone without mobile/node_modules keeps the committed copies
module.exports = { copies, app, root };
if (require.main === module) {
  for (const [from, to] of copies) { const target = path.join(app, to); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, from), target); }
  console.log(`docs/app: ${copies.length} files synced`);
}
