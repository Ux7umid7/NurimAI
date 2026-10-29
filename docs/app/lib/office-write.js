// Word (.docx) referats and PowerPoint (.pptx) presentations made from the AI's JSON plan. Shared by the desktop app (Node),
// the phone app (browser) and the Telegram bot (Worker): plain OOXML in an uncompressed zip, no libraries.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.NurimDocs = factory(); })(typeof self !== 'undefined' ? self : this, function () {
const utf8 = s => new TextEncoder().encode(s);
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
// Stored (method 0) zip; [Content_Types].xml first, as Office expects. `files` is [[name, string | Uint8Array], …].
function zip(files, when = new Date()) {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1), date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const parts = [], central = []; let offset = 0;
  for (const [name, content] of files) {
    const data = typeof content === 'string' ? utf8(content) : content, path = utf8(name), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, path.length, 2], [28, 0, 2]].forEach(([at, v, n]) => n === 4 ? head.setUint32(at, v, true) : head.setUint16(at, v, true));
    parts.push(new Uint8Array(head.buffer), path, data);
    const entry = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, path.length, 2], [42, offset, 4]].forEach(([at, v, n]) => n === 4 ? entry.setUint32(at, v, true) : entry.setUint16(at, v, true));
    central.push(new Uint8Array(entry.buffer), path);
    offset += 30 + path.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0; for (const c of all) { out.set(c, at); at += c.length; }
  return out;
}
const esc = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels = list => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type.startsWith('http') ? type : `${REL}/${type}`}" Target="${target}"/>`).join('')}</Relationships>`;
const core = (title, when) => `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>NurimAI</dc:creator><cp:lastModifiedBy>NurimAI</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${when.toISOString().slice(0, 19)}Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when.toISOString().slice(0, 19)}Z</dcterms:modified></cp:coreProperties>`;
const PACKAGE_RELS = rels([['rId1', 'officeDocument', '%MAIN%'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'], ['rId3', 'extended-properties', 'docProps/app.xml']]);
// The AI writes plain text, but sometimes slips in Markdown: ** and leading # or - are dropped. Uzbek Latin gets its own
// letters back: o' g' -> o‘ g‘, and an apostrophe inside a word -> ’ (tutuq belgisi), as a school text should have them.
const clean = s => String(s || '').replace(/\*\*|__/g, '').replace(/^\s*(#{1,6}|[-*•])\s+/, '').replace(/\s+/g, ' ').trim()
  .replace(/([oOgG])['`ʻ‘’](?=\p{L})/gu, '$1‘').replace(/(\p{L})['`ʼ](?=\p{L})/gu, '$1’');

// --- Word: an Uzbek school referat (title page, plan, sections, sources), Times New Roman 14, 1.5 lines, A4 with page numbers.
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const run = (text, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (content, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${content}</w:p>`;
const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
function docx(doc, when = new Date()) {
  const center = '<w:jc w:val="center"/><w:ind w:firstLine="0"/>', blank = n => Array.from({ length: n }, () => para('', center)).join('');
  const title = [blank(6), para(run('REFERAT', '<w:b/><w:sz w:val="40"/>'), center),
    para(run(`Mavzu: «${doc.title}»`, '<w:b/><w:sz w:val="32"/>'), `${center}<w:spacing w:before="240"/>`),
    blank(8), para(run('Bajardi: ______________________'), '<w:jc w:val="right"/><w:ind w:firstLine="0"/>'),
    para(run('Tekshirdi: ____________________'), '<w:jc w:val="right"/><w:ind w:firstLine="0"/>'),
    blank(6), para(run(`${when.getFullYear()}-yil`), center)].join('');
  const heads = [...doc.sections.map(s => s.heading), ...(doc.sources.length ? ['Foydalanilgan adabiyotlar'] : [])];
  const plan = [para(run('Reja', '<w:b/>'), '<w:pStyle w:val="Heading1"/>'), ...heads.map((h, i) => para(run(`${i + 1}. ${h}`), '<w:pStyle w:val="Plan"/>'))].join('');
  const body = doc.sections.map(s => para(run(s.heading), '<w:pStyle w:val="Heading1"/>') + s.paragraphs.map(p => para(run(p))).join('')).join('');
  const sources = doc.sources.length ? para(run('Foydalanilgan adabiyotlar'), '<w:pStyle w:val="Heading1"/>') + doc.sources.map((s, i) => para(run(`${i + 1}. ${s}`), '<w:pStyle w:val="Plan"/>')).join('') : '';
  const section = '<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="709" w:footer="567" w:gutter="0"/><w:titlePg/></w:sectPr>';
  const document = `${XML}<w:document ${W}><w:body>${title}${PAGE_BREAK}${plan}${PAGE_BREAK}${body}${sources}${section}</w:body></w:document>`;
  const font = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>';
  const styles = `${XML}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="uz-Latn-UZ"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="both"/><w:ind w:firstLine="709"/></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:jc w:val="center"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Plan"><w:name w:val="Plan"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="left"/><w:ind w:left="425" w:hanging="425" w:firstLine="0"/></w:pPr></w:style></w:styles>';
  const footer = `${XML}<w:ftr ${W}><w:p><w:pPr><w:jc w:val="center"/><w:ind w:firstLine="0"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const type = t => `application/vnd.openxmlformats-officedocument.wordprocessingml.${t}+xml`;
  return zip([
    ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${type('document.main')}"/><Override PartName="/word/styles.xml" ContentType="${type('styles')}"/><Override PartName="/word/settings.xml" ContentType="${type('settings')}"/><Override PartName="/word/footer1.xml" ContentType="${type('footer')}"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ['_rels/.rels', PACKAGE_RELS.replace('%MAIN%', 'word/document.xml')],
    ['word/document.xml', document], ['word/styles.xml', styles], ['word/footer1.xml', footer],
    ['word/settings.xml', `${XML}<w:settings ${W}><w:defaultTabStop w:val="709"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`],
    ['word/_rels/document.xml.rels', rels([['rId1', 'styles', 'styles.xml'], ['rId2', 'settings', 'settings.xml'], ['rId3', 'footer', 'footer1.xml']])],
    ['docProps/core.xml', core(doc.title, when)],
    ['docProps/app.xml', `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>NurimAI</Application></Properties>`]
  ], when);
}

// --- PowerPoint: 16:9, a dark title slide and cream content slides in the Ustozim Nurim colours (night, gold, cream).
const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const C = { night: '121317', gold: 'D6AC55', cream: 'F6F1E7', ink: '27282D', muted: '5A5C64' };
const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const xfrm = (x, y, w, h) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
const text = (t, size, color, bold = false) => `<a:r><a:rPr lang="uz-Latn-UZ" sz="${size}"${bold ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Segoe UI"/><a:cs typeface="Segoe UI"/></a:rPr><a:t>${esc(t)}</a:t></a:r>`;
function box(id, name, [x, y, w, h], paragraphs, anchor = 't') {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}
const bar = (id, [x, y, w, h], color) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Urg‘u ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
const slideXml = (tree, background) => `${XML}<p:sld ${P}><p:cSld>${background ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` : ''}<p:spTree>${GROUP}${tree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
function titleSlide(deck) {
  return slideXml(bar(2, [838200, 2286000, 1371600, 91440], C.gold)
    + box(3, 'Sarlavha', [838200, 2560320, 10515600, 1645920], `<a:p><a:pPr algn="l"/>${text(deck.title, 4800, C.cream, true)}</a:p>`, 'b')
    + (deck.subtitle ? box(4, 'Izoh', [838200, 4389120, 10515600, 914400], `<a:p><a:pPr algn="l"/>${text(deck.subtitle, 2200, C.gold)}</a:p>`) : ''), C.night);
}
function contentSlide(slide, number, total) {
  const bullets = slide.bullets.map(b => `<a:p><a:pPr marL="342900" indent="-342900"><a:spcBef><a:spcPts val="900"/></a:spcBef><a:buClr><a:srgbClr val="${C.gold}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>${text(b, 2200, C.ink)}</a:p>`).join('');
  return slideXml(bar(2, [838200, 640080, 91440, 777240], C.gold)
    + box(3, 'Sarlavha', [1097280, 548640, 10256520, 960120], `<a:p>${text(slide.title, 3200, C.ink, true)}</a:p>`, 'ctr')
    + box(4, 'Matn', [1097280, 1737360, 10256520, 4389120], bullets)
    + box(5, 'Raqam', [10515600, 6217920, 838200, 320040], `<a:p><a:pPr algn="r"/>${text(`${number} / ${total}`, 1200, C.muted)}</a:p>`));
}
const THEME = `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="NurimAI"><a:themeElements><a:clrScheme name="NurimAI"><a:dk1><a:srgbClr val="${C.ink}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${C.night}"/></a:dk2><a:lt2><a:srgbClr val="${C.cream}"/></a:lt2><a:accent1><a:srgbClr val="${C.gold}"/></a:accent1><a:accent2><a:srgbClr val="45563A"/></a:accent2><a:accent3><a:srgbClr val="7A4F0E"/></a:accent3><a:accent4><a:srgbClr val="1B7A52"/></a:accent4><a:accent5><a:srgbClr val="B3261E"/></a:accent5><a:accent6><a:srgbClr val="5A5C64"/></a:accent6><a:hlink><a:srgbClr val="7A4F0E"/></a:hlink><a:folHlink><a:srgbClr val="5A5C64"/></a:folHlink></a:clrScheme>`
  + '<a:fontScheme name="NurimAI"><a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
  + '<a:fmtScheme name="NurimAI"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
function pptx(deck, when = new Date()) {
  const slides = [titleSlide(deck), ...deck.slides.map((s, i) => contentSlide(s, i + 2, deck.slides.length + 1))];
  const type = t => `application/vnd.openxmlformats-officedocument.presentationml.${t}+xml`;
  const master = `${XML}<p:sldMaster ${P}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${C.cream}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2200"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
  const layout = `${XML}<p:sldLayout ${P} type="blank" preserve="1"><p:cSld name="Bo‘sh"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const presentation = `${XML}<p:presentation ${P} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${10 + i}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  return zip([
    ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="${type('presentation.main')}"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${type('slideMaster')}"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${type('slideLayout')}"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="${type('presProps')}"/><Override PartName="/ppt/viewProps.xml" ContentType="${type('viewProps')}"/><Override PartName="/ppt/tableStyles.xml" ContentType="${type('tableStyles')}"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${type('slide')}"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ['_rels/.rels', PACKAGE_RELS.replace('%MAIN%', 'ppt/presentation.xml')],
    ['ppt/presentation.xml', presentation],
    ['ppt/_rels/presentation.xml.rels', rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ['rId3', 'presProps', 'presProps.xml'], ['rId4', 'viewProps', 'viewProps.xml'], ['rId5', 'tableStyles', 'tableStyles.xml'], ...slides.map((_, i) => [`rId${10 + i}`, 'slide', `slides/slide${i + 1}.xml`])])],
    ['ppt/slideMasters/slideMaster1.xml', master],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']])],
    ['ppt/slideLayouts/slideLayout1.xml', layout],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])],
    ['ppt/theme/theme1.xml', THEME],
    ['ppt/presProps.xml', `${XML}<p:presentationPr ${P}/>`],
    ['ppt/viewProps.xml', `${XML}<p:viewPr ${P}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`],
    ['ppt/tableStyles.xml', `${XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`],
    ...slides.flatMap((xml, i) => [[`ppt/slides/slide${i + 1}.xml`, xml], [`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']])]]),
    ['docProps/core.xml', core(deck.title, when)],
    ['docProps/app.xml', `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>NurimAI</Application><Slides>${slides.length}</Slides></Properties>`]
  ], when);
}

// --- Asking the AI: the user's request is passed on as it is (it names the topic itself), the answer is JSON.
const KINDS = { docx: 'referat', pptx: 'taqdimot' };
const ACTION = /(yoz|tayyorla|qil|tuz|yasa|ber|kerak|chiqar|write|make|create|напиши|сделай|подготовь)/i;
// "Fotosintez haqida referat yozib ber" -> docx; "taqdimot tayyorla: Kosmos, 8 slayd" -> pptx; "referat nima?" -> nothing.
function detect(question) {
  const q = String(question || '');
  const kind = /(taqdimot|prezentatsiya|presentation|slayd|slide|pptx|powerpoint|презентац)/i.test(q) ? 'pptx' : /(referat|mustaqil ish|реферат|\bdocx\b|word fayl)/i.test(q) ? 'docx' : '';
  if (!kind || !ACTION.test(q)) return null;
  if (/\?\s*$/.test(q) && /(qanday|qanaqa|nima|nega|nechta|qaysi|qachon|как|что|зачем|how|what|why)/i.test(q)) return null; // a question about referats, not a request for one
  const pages = Number((/(\d{1,2})\s*(?:-?\s*)(?:bet|sahifa|varaq|page)/i.exec(q) || [])[1]) || 3;
  const slides = Number((/(\d{1,2})\s*(?:ta\s*)?(?:slayd|slide)/i.exec(q) || [])[1]) || 10;
  return { kind, pages: Math.min(5, Math.max(2, pages)), slides: Math.min(15, Math.max(5, slides)) };
}
function prompt(request, want, withFiles = false) {
  const source = `Foydalanuvchi so‘rovi: «${String(request).slice(0, 1500)}»${withFiles ? ' (biriktirilgan fayl(lar) asosida)' : ''}.`;
  if (want.kind === 'pptx') return [source, `Shu so‘rov bo‘yicha ${want.slides} slaydli taqdimot tayyorla: birinchi slayd sarlavha bo‘ladi (uni men o‘zim yasayman), sen aynan ${want.slides - 1} ta mazmunli slayd yoz, oxirgisi «Xulosa».`,
    'Har slaydda 3–5 ta qisqa band, har biri 14 so‘zgacha, aniq faktlar bilan. Adabiy o‘zbek tilida (lotin yozuvi). Markdown, ** belgisi va emoji ishlatma.',
    'Faqat JSON qaytar, boshqa hech narsa yozma:', '{"mavzu":"taqdimot sarlavhasi","izoh":"bir qatorli tagsarlavha","slaydlar":[{"sarlavha":"...","bandlar":["...","..."]}]}'].join('\n');
  return [source, `Shu so‘rov bo‘yicha o‘quvchi uchun referat yoz: ${want.pages} bet, ya’ni matn jami kamida ${want.pages * 250} so‘z bo‘lsin (qisqa yozma).`,
    'Tuzilishi: «Kirish», 3–4 ta asosiy bo‘lim (mazmunli sarlavhalar bilan), «Xulosa». Har asosiy bo‘limda 3–4 xatboshi, har xatboshida 4–6 gap: faktlar, sanalar, misollar bilan. Ilmiy-ommabop uslubda, adabiy o‘zbek tilida (lotin yozuvi). Markdown, ** belgisi va emoji ishlatma.',
    'Oxirida 3–6 ta haqiqiy, umumiy ma’lum adabiyot (darslik, ensiklopediya, rasmiy sayt); bilmagan manbani to‘qima.',
    'Faqat JSON qaytar, boshqa hech narsa yozma:', '{"mavzu":"referat mavzusi","bolimlar":[{"sarlavha":"Kirish","matn":["xatboshi","xatboshi"]},{"sarlavha":"Xulosa","matn":["..."]}],"adabiyotlar":["..."]}'].join('\n');
}
function jsonIn(text) { const s = String(text || ''), start = s.indexOf('{'), end = s.lastIndexOf('}'); if (start < 0 || end <= start) return null; try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; } }
const list = (v, max, length) => (Array.isArray(v) ? v : []).map(x => clean(x).slice(0, length)).filter(Boolean).slice(0, max);
// The AI's JSON -> a validated plan, or null (then the app says it could not make the file).
function parse(kind, text) {
  const d = jsonIn(text); if (!d) return null;
  const title = clean(d.mavzu ?? d.title).slice(0, 120); if (!title) return null;
  if (kind === 'pptx') {
    const slides = (Array.isArray(d.slaydlar ?? d.slides) ? d.slaydlar ?? d.slides : []).map(s => ({ title: clean(s?.sarlavha ?? s?.title).slice(0, 90), bullets: list(s?.bandlar ?? s?.bullets, 6, 160) })).filter(s => s.title && s.bullets.length).slice(0, 15);
    return slides.length >= 2 ? { kind, title, subtitle: clean(d.izoh ?? d.subtitle).slice(0, 140), slides } : null;
  }
  const sections = (Array.isArray(d.bolimlar ?? d.sections) ? d.bolimlar ?? d.sections : []).map(s => ({ heading: clean(s?.sarlavha ?? s?.heading).slice(0, 120), paragraphs: list(s?.matn ?? s?.paragraphs, 8, 3000) })).filter(s => s.heading && s.paragraphs.length).slice(0, 8);
  return sections.length >= 2 ? { kind, title, sections, sources: list(d.adabiyotlar ?? d.sources, 8, 300) } : null;
}
function build(plan, when) { return plan.kind === 'pptx' ? pptx(plan, when) : docx(plan, when); }
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
function fileName(plan) { const base = plan.title.replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || KINDS[plan.kind]; return `${plan.kind === 'pptx' ? 'Taqdimot' : 'Referat'} - ${base}.${plan.kind}`; }
// The chat bubble that goes with the file: what is inside, in the apps' light Markdown.
function summary(plan) {
  if (plan.kind === 'pptx') return [`📊 **Taqdimot tayyor:** ${plan.title}`, `${plan.slides.length + 1} ta slayd (PowerPoint):`, ...plan.slides.map((s, i) => `${i + 2}. ${s.title}`)].join('\n');
  const words = plan.sections.reduce((n, s) => n + s.paragraphs.join(' ').split(/\s+/).length, 0);
  return [`📄 **Referat tayyor:** ${plan.title}`, `Word fayl, taxminan ${Math.max(1, Math.round(words / 250))} bet matn + titul varag‘i va reja:`, ...plan.sections.map((s, i) => `${i + 1}. ${s.heading}`), ...(plan.sources.length ? [`${plan.sections.length + 1}. Foydalanilgan adabiyotlar`] : []), '', 'Titul varag‘idagi ism va o‘qituvchi joylarini o‘zingiz to‘ldiring.'].join('\n');
}
return { zip, crc32, docx, pptx, detect, prompt, parse, build, fileName, summary, MIME, KINDS };
});
