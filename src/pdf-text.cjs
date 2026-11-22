// The text of a PDF (a textbook, a worksheet) for the document search (rag.cjs), read on the computer with Mozilla's
// PDF.js. A scanned PDF holds pictures of pages, not text, so it gives nothing here (attached to a question, Gemini can
// still read it). Only text is read: no page is drawn, so PDF.js's optional canvas package is not needed or packed.
const path = require('node:path');
let loading;
const pdfjs = () => (loading ||= import('pdfjs-dist/legacy/build/pdf.mjs'));
const root = () => path.dirname(require.resolve('pdfjs-dist/package.json'));
const LIMIT = Object.freeze({ pages: 600, chars: 3000000 });
// Text items of one page → lines (PDF.js marks the end of a line with hasEOL and adds the spaces between words itself).
function pageText(items) {
  let out = '';
  for (const item of items) if (typeof item.str === 'string') out += item.str + (item.hasEOL ? '\n' : '');
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function pdfText(bytes, { pages = LIMIT.pages } = {}) {
  const { getDocument } = await pdfjs();
  const dir = root().split(path.sep).join('/');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0, cMapUrl: `${dir}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${dir}/standard_fonts/` });
  const doc = await task.promise;
  try {
    const out = []; let chars = 0;
    for (let n = 1; n <= Math.min(doc.numPages, pages) && chars < LIMIT.chars; n++) {
      const page = await doc.getPage(n);
      try { const text = pageText((await page.getTextContent()).items); if (text) { out.push(text); chars += text.length; } } finally { page.cleanup(); }
    }
    return out.join('\n\n');
  } finally { await task.destroy(); }
}
module.exports = { pdfText, pageText, LIMIT };
