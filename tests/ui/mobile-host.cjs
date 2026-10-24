// Electron host for the phone-app UI tests: serves docs/ on a random local port and opens /app/?qa=1 in a phone-sized window
// with its own in-memory storage (nothing touches the real profile).
const { app, BrowserWindow, nativeTheme } = require('electron');
if (process.env.NURIM_THEME) nativeTheme.themeSource = process.env.NURIM_THEME; // screenshots for the site use the light theme
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..', '..', 'docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webm': 'video/webm', '.webmanifest': 'application/manifest+json' };
app.whenReady().then(() => {
  const server = http.createServer((req, res) => {
    let file = path.normalize(path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
  }).listen(0, '127.0.0.1', () => {
    const win = new BrowserWindow({ width: 390, height: 844, webPreferences: { partition: 'nurim-mobile-test', sandbox: true, contextIsolation: true } });
    win.loadURL(`http://localhost:${server.address().port}/app/?qa=1`);
  });
});
app.on('window-all-closed', () => app.quit());
