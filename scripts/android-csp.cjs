// After `cap sync`: Capacitor's Android WebView injects its bridge as an inline <script>, which the web app's strict CSP would block.
// Only the packaged copy inside the APK allows inline scripts; the web app on GitHub Pages keeps script-src 'self'.
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'mobile', 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const next = html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");
if (next === html && !html.includes("script-src 'self' 'unsafe-inline';")) throw new Error('CSP not found in the Android copy of index.html');
fs.writeFileSync(file, next);
console.log('Android CSP adjusted for the Capacitor bridge');
