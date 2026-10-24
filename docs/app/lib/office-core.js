// Office (.docx/.xlsx/.pptx) text extraction shared by the desktop app (Node) and the phone app (browser).
// A "zip" here is { names: string[], text(name) -> string|null }; each side opens the archive its own way.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.NurimOffice = factory(); })(typeof self !== 'undefined' ? self : this, function () {
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[e.toLowerCase()] ?? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
const tidy = s => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function docxText(zip) {
  const xml = zip.text('word/document.xml'); if (xml == null) throw new Error('docx');
  let out = '', cell = 0;
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>|<\/w:p>|<w:tc(?:\s[^>]*)?>|<\/w:tc>|<\/w:tr>/g)) {
    const t = m[0];
    if (m[1] !== undefined) out += decode(m[1]);
    else if (t === '<w:tab/>') out += '\t';
    else if (t.startsWith('<w:br') || t.startsWith('<w:cr')) out += '\n';
    else if (t === '</w:p>') out += cell ? ' ' : '\n';
    else if (t.startsWith('<w:tc')) cell++;
    else if (t === '</w:tc>') { cell--; out = out.replace(/ $/, '') + ' | '; }
    else if (t === '</w:tr>') out = out.replace(/ \| $/, '') + '\n';
  }
  return tidy(out);
}

function xlsxText(zip) {
  const workbook = zip.text('xl/workbook.xml'); if (workbook == null) throw new Error('xlsx');
  const shared = [...(zip.text('xl/sharedStrings.xml') || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => decode([...m[1].matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map(t => t[1]).join('')));
  const rels = new Map([...(zip.text('xl/_rels/workbook.xml.rels') || '').matchAll(/<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)].map(m => ({ name: decode(m[1]), target: rels.get(m[2]) }));
  const column = ref => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const parts = [];
  for (const sheet of sheets) {
    if (!sheet.target) continue;
    const xml = zip.text(sheet.target.startsWith('/') ? sheet.target.slice(1) : `xl/${sheet.target}`); if (xml == null) continue;
    const rows = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= 1000) break;
      const cells = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+)\d+"/.exec(c[1])?.[1], type = /\bt="([^"]+)"/.exec(c[1])?.[1], inner = c[2] || '';
        const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1];
        let value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? decode([...inner.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map(t => t[1]).join('')) : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : decode(v ?? '');
        const i = ref ? column(ref) : cells.length; if (i < 60) cells[i] = value.replace(/[\t\n]+/g, ' ');
      }
      if (cells.some(Boolean)) rows.push(Array.from(cells, v => v ?? '').join('\t'));
    }
    if (rows.length) parts.push(`## Varaq: ${sheet.name}\n${rows.join('\n')}`);
  }
  return parts.join('\n\n');
}

function pptxText(zip) {
  const slides = zip.names.map(n => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n)).filter(Boolean).sort((a, b) => a[1] - b[1]);
  if (!slides.length) throw new Error('pptx');
  return slides.map(([name, n]) => {
    let text = ''; for (const m of zip.text(name).matchAll(/<a:t>([^<]*)<\/a:t>|<\/a:p>/g)) text += m[1] !== undefined ? decode(m[1]) : '\n';
    return `## Slayd ${n}\n${tidy(text)}`;
  }).join('\n\n');
}

// ZIP central directory (no ZIP64) from a Uint8Array: entry names, compression method and the compressed bytes.
function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('zip');
  const count = view.getUint16(end + 10, true); let p = view.getUint32(end + 16, true); const entries = new Map(); const utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('zip');
    const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true), nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true), offset = view.getUint32(p + 42, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    entries.set(name, { method, data: bytes.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
return { decode, tidy, docxText, xlsxText, pptxText, zipEntries };
});
