// Generates every app and website icon from assets/icon.svg (run: npm run icons).
// Uses Electron's Chromium to rasterise the vector, so all sizes stay sharp.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');
const docs = path.join(root, 'docs');
const svg = fs.readFileSync(path.join(assets, 'icon.svg'), 'utf8');
const mascot = 'data:image/png;base64,' + fs.readFileSync(path.join(assets, 'mascot.png')).toString('base64');

// Runs inside the page: returns {name: dataURL | {rgba, size}}.
async function render(svg, mascot) {
  const load = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
  const svgUrl = (text, size) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text.replace('<svg ', `<svg width="${size}" height="${size}" `));
  const canvas = size => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const round = (ctx, x, y, w, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, w, r); };
  const bg = svg.match(/id="bg"[^>]*fill="([^"]+)"/)[1];
  const gold = svg.match(/id="gold"[^>]*fill="([^"]+)"/)[1];
  const out = {};

  // Rounded tile (Windows .ico, favicon): glyph keeps its original proportions.
  async function tile(size, radius = 0.2) {
    const c = canvas(size), ctx = c.getContext('2d');
    round(ctx, 0, 0, size, size * radius); ctx.clip();
    ctx.drawImage(await load(svgUrl(svg, size)), 0, 0, size, size);
    return c;
  }
  for (const s of [16, 24, 32, 48, 64, 128]) { const ctx = (await tile(s)).getContext('2d'); out[`ico-${s}`] = { size: s, rgba: Array.from(ctx.getImageData(0, 0, s, s).data) }; }
  out['ico-256'] = (await tile(256)).toDataURL('image/png');

  // macOS: 824px rounded tile on a 1024 canvas with Apple's standard margin and soft shadow.
  { const c = canvas(1024), ctx = c.getContext('2d'); const art = await load(svgUrl(svg, 824));
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10; round(ctx, 100, 100, 824, 185); ctx.fillStyle = bg; ctx.fill(); ctx.restore();
    ctx.save(); round(ctx, 100, 100, 824, 185); ctx.clip(); ctx.drawImage(art, 100, 100, 824, 824); ctx.restore();
    out['icon-mac'] = c.toDataURL('image/png'); }

  // macOS menu-bar template: glyph only, black on transparent, cropped to the letterform.
  { const glyph = svg.replace(/<rect id="bg"[^>]*\/>/, '').replace(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="#000"').replace(/viewBox="[^"]+"/, 'viewBox="86 84 468 468"');
    for (const [name, s] of [['trayTemplate', 16], ['trayTemplate@2x', 32]]) { const c = canvas(s); c.getContext('2d').drawImage(await load(svgUrl(glyph, s)), 0, 0, s, s); out[name] = c.toDataURL('image/png'); } }

  // Website: favicon, Apple touch icon, page logo, scaled mascot and link-preview image.
  out['favicon.svg'] = svg.replace('<rect id="bg"', '<rect id="bg" rx="128"');
  out['apple-touch-icon'] = (await (async () => { const c = canvas(180); c.getContext('2d').drawImage(await load(svgUrl(svg, 180)), 0, 0, 180, 180); return c; })()).toDataURL('image/png');
  out['logo-256'] = (await tile(256, 0.22)).toDataURL('image/png');
  const pet = await load(mascot);
  { const h = 560, w = Math.round(pet.width * h / pet.height), c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(pet, 0, 0, w, h); out['mascot'] = c.toDataURL('image/webp', 0.9); }
  { const c = document.createElement('canvas'); c.width = 1200; c.height = 630; const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 1200, 630); g.addColorStop(0, '#1C1D21'); g.addColorStop(1, '#2A2B31'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1200, 630);
    const glow = ctx.createRadialGradient(930, 330, 20, 930, 330, 330); glow.addColorStop(0, 'rgba(213,173,86,0.38)'); glow.addColorStop(1, 'rgba(213,173,86,0)'); ctx.fillStyle = glow; ctx.fillRect(560, 0, 640, 630);
    const ph = 520, pw = pet.width * ph / pet.height; ctx.drawImage(pet, 930 - pw / 2, 70, pw, ph);
    ctx.drawImage(await tile(112, 0.22), 80, 92);
    ctx.fillStyle = '#FFFFFF'; ctx.font = '700 96px "Segoe UI", Arial, sans-serif'; ctx.fillText('NurimAI', 76, 330);
    ctx.fillStyle = '#D9D3C4'; ctx.font = '400 36px "Segoe UI", Arial, sans-serif'; ctx.fillText('Ish stolingizdagi kichik AI yordamchi', 80, 392);
    let x = 80; ctx.font = '600 26px "Segoe UI", Arial, sans-serif';
    for (const label of ['Windows', 'macOS', 'Bepul']) { const w = ctx.measureText(label).width + 44; ctx.fillStyle = label === 'Bepul' ? gold : 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.roundRect(x, 452, w, 52, 26); ctx.fill(); ctx.fillStyle = label === 'Bepul' ? '#1C1D21' : '#FFFFFF'; ctx.fillText(label, x + 22, 487); x += w + 14; }
    out['og'] = c.toDataURL('image/jpeg', 0.88); }
  return out;
}

// 32-bit DIB icon entry (BGRA bottom-up + AND mask) from straight RGBA pixels.
function dib(size, rgba) {
  const maskStride = Math.ceil(size / 32) * 4;
  const buf = Buffer.alloc(40 + size * size * 4 + maskStride * size);
  buf.writeUInt32LE(40, 0); buf.writeInt32LE(size, 4); buf.writeInt32LE(size * 2, 8); buf.writeUInt16LE(1, 12); buf.writeUInt16LE(32, 14);
  buf.writeUInt32LE(size * size * 4 + maskStride * size, 20);
  let o = 40;
  for (let y = size - 1; y >= 0; y--) for (let x = 0; x < size; x++) { const i = (y * size + x) * 4; buf[o++] = rgba[i + 2]; buf[o++] = rgba[i + 1]; buf[o++] = rgba[i]; buf[o++] = rgba[i + 3]; }
  for (let y = size - 1; y >= 0; y--) { for (let x = 0; x < size; x++) if (rgba[(y * size + x) * 4 + 3] === 0) buf[o + (x >> 3)] |= 0x80 >> (x & 7); o += maskStride; }
  return buf;
}
function ico(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, data }, i) => { const p = 6 + 16 * i; header[p] = size >= 256 ? 0 : size; header[p + 1] = size >= 256 ? 0 : size; header.writeUInt16LE(1, p + 4); header.writeUInt16LE(32, p + 6); header.writeUInt32LE(data.length, p + 8); header.writeUInt32LE(offset, p + 12); offset += data.length; });
  return Buffer.concat([header, ...entries.map(e => e.data)]);
}
const fromDataUrl = url => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  const out = await win.webContents.executeJavaScript(`(${render})(${JSON.stringify(svg)}, ${JSON.stringify(mascot)})`);
  fs.mkdirSync(docs, { recursive: true });
  const entries = [16, 24, 32, 48, 64, 128].map(s => ({ size: s, data: dib(s, out[`ico-${s}`].rgba) }));
  entries.push({ size: 256, data: fromDataUrl(out['ico-256']) });
  const files = {
    [path.join(assets, 'Nuri.ico')]: ico(entries),
    [path.join(assets, 'icon-mac.png')]: fromDataUrl(out['icon-mac']),
    [path.join(assets, 'trayTemplate.png')]: fromDataUrl(out.trayTemplate),
    [path.join(assets, 'trayTemplate@2x.png')]: fromDataUrl(out['trayTemplate@2x']),
    [path.join(docs, 'favicon.svg')]: out['favicon.svg'],
    [path.join(docs, 'apple-touch-icon.png')]: fromDataUrl(out['apple-touch-icon']),
    [path.join(docs, 'logo.png')]: fromDataUrl(out['logo-256']),
    [path.join(docs, 'mascot.webp')]: fromDataUrl(out.mascot),
    [path.join(docs, 'og.jpg')]: fromDataUrl(out.og)
  };
  for (const [file, data] of Object.entries(files)) { fs.writeFileSync(file, data); console.log(path.relative(root, file), data.length, 'bytes'); }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
