const test=require('node:test');const assert=require('node:assert/strict');const zlib=require('node:zlib');
const {prepare,checkFits,forRequest,forView,LIMITS}=require('../src/attachments.cjs');const {UserError}=require('../src/router.cjs');

// Builds a real ZIP (stored or deflated entries) so Office parsing is tested on genuine archives.
function zip(entries,deflate=true){
  const locals=[],central=[];let offset=0;
  for(const [name,text] of Object.entries(entries)){
    const raw=Buffer.from(text),data=deflate?zlib.deflateRawSync(raw):raw,n=Buffer.from(name);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(deflate?8:0,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(n.length,26);
    const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(deflate?8:0,10);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(raw.length,24);dir.writeUInt16LE(n.length,28);dir.writeUInt32LE(offset,42);
    locals.push(local,n,data);central.push(dir,n);offset+=30+n.length+data.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,cd,end]);
}
const message=async(promise)=>{try{await promise;}catch(e){assert.ok(e instanceof UserError,e);return e.message;}assert.fail('expected UserError');};

test('Word paragraphs, tabs, line breaks and tables become readable text',async()=>{
  const xml='<w:document><w:body><w:p><w:r><w:t>Salom</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">dunyo &amp; do‘st</w:t></w:r></w:p><w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Birinchi</w:t><w:br/><w:t>ikkinchi</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Ism</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Baho</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Ali</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>5</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  for(const deflate of [true,false]){const f=await prepare({name:'uyga vazifa.docx',bytes:zip({'word/document.xml':xml},deflate)});assert.equal(f.kind,'text');assert.equal(f.text,'Salom\tdunyo & do‘st\nBirinchi\nikkinchi\nIsm | Baho\nAli | 5');}
});
test('Excel sheets keep names, shared and inline strings, numbers and column gaps',async()=>{
  const f=await prepare({name:'jadval.xlsx',bytes:zip({
    'xl/workbook.xml':'<workbook><sheets><sheet name="Baholar" sheetId="1" r:id="rId1"/><sheet name="Bo‘sh" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml':'<sst><si><t>Ism</t></si><si><r><t>Ba</t></r><r><t>ho</t></r></si></sst>',
    'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Vali</t></is></c><c r="C2"><v>4.5</v></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml':'<worksheet><sheetData/></worksheet>'})});
  assert.equal(f.text,'## Varaq: Baholar\nIsm\t\tBaho\nVali\t\t4.5');
});
test('PowerPoint slides are read in numeric order',async()=>{
  const f=await prepare({name:'taqdimot.pptx',bytes:zip({'ppt/slides/slide10.xml':'<p:sld><a:p><a:r><a:t>O‘ninchi</a:t></a:r></a:p></p:sld>','ppt/slides/slide2.xml':'<p:sld><a:p><a:r><a:t>Sarlavha</a:t></a:r></a:p><a:p><a:r><a:t>Matn</a:t></a:r></a:p></p:sld>'})});
  assert.equal(f.text,'## Slayd 2\nSarlavha\nMatn\n\n## Slayd 10\nO‘ninchi');
});
test('text files handle UTF-8, UTF-16 and Russian-locale CSV',async()=>{
  assert.equal((await prepare({name:'a.txt',bytes:Buffer.from('﻿Salom, o‘zbek')})).text,'Salom, o‘zbek');
  assert.equal((await prepare({name:'b.txt',bytes:Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('Привет','utf16le')])})).text,'Привет');
  assert.equal((await prepare({name:'c.csv',bytes:Buffer.from([0xcf,0xf0,0xe8,0xe2,0xe5,0xf2,0x3b,0xcc,0xe8,0xf0])})).text,'Привет;Мир'); // windows-1251
});
test('images go through the image tool and PDFs are sent as they are',async()=>{
  let seen;const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(20)]);
  const image=await prepare({name:'skrinshot.png',bytes:png,imageTool:async(bytes,mime)=>{seen=mime;return {mime:'image/jpeg',data:Buffer.from('small'),thumb:'data:image/png;base64,AA=='};}});
  assert.equal(seen,'image/png');assert.deepEqual([image.kind,image.mime,image.data,image.thumb],['image','image/jpeg',Buffer.from('small').toString('base64'),'data:image/png;base64,AA==']);
  const pdf=await prepare({name:'kitob.pdf',bytes:Buffer.from('%PDF-1.7 test')});assert.deepEqual([pdf.kind,pdf.mime],['pdf','application/pdf']);
  assert.match(await message(prepare({name:'katta.pdf',bytes:Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(LIMITS.pdfBytes)])})),/PDF juda katta/);
});
test('unsupported, legacy, empty, broken and oversized files get clear messages',async()=>{
  assert.match(await message(prepare({name:'eski.doc',bytes:Buffer.from('binary')})),/eski \.doc.*\.docx/);
  assert.match(await message(prepare({name:'dastur.exe',bytes:Buffer.from('MZ binary')})),/qo‘llab-quvvatlanmaydi/);
  assert.match(await message(prepare({name:'bo‘sh.txt',bytes:Buffer.alloc(0)})),/bo‘sh/);
  assert.match(await message(prepare({name:'buzuq.docx',bytes:Buffer.from('PK\u0003\u0004 not really a zip')})),/o‘qib bo‘lmadi/);
  assert.match(await message(prepare({name:'rasmli.docx',bytes:zip({'word/document.xml':'<w:document><w:body><w:p/></w:body></w:document>'})})),/matn topilmadi.*PDF/);
  assert.match(await message(prepare({name:'ulkan.txt',bytes:Buffer.alloc(LIMITS.inputBytes+1,97)})),/juda katta/);
  assert.match(await message(prepare({name:'bomba.docx',bytes:zip({'word/document.xml':'<w:t>'+'a'.repeat(LIMITS.zipEntryBytes+10)+'</w:t>'})})),/o‘qib bo‘lmadi/);
});
test('long documents are trimmed with a note and names are sanitised',async()=>{
  const f=await prepare({name:'..\\yo‘l/kitob.txt',bytes:Buffer.alloc(LIMITS.textChars+500,97)});
  assert.equal(f.text.length,LIMITS.textChars);assert.match(f.note,/dastlabki/);assert.equal(f.name,'.._yo‘l_kitob.txt');
});
test('conversation limits on count, media size and text volume',()=>{
  const text=n=>({kind:'text',text:'a'.repeat(n),size:n}),media=size=>({kind:'image',size});
  assert.throws(()=>checkFits([text(1),text(1),text(1),text(1),text(1)],text(1)),/5 tagacha/);
  assert.throws(()=>checkFits([media(LIMITS.totalBinaryBytes)],media(1)),/jami/);
  assert.throws(()=>checkFits([text(LIMITS.totalTextChars)],text(1)),/matn juda ko‘p/);
  assert.doesNotThrow(()=>checkFits([media(1000),text(1000)],text(1000)));
});
test('request and view shapes never leak more than needed',()=>{
  const files=[{id:'1',name:'a.png',ext:'png',kind:'image',mime:'image/png',data:'AAAA',size:3,thumb:'t'},{id:'2',name:'b.docx',ext:'docx',kind:'text',text:'matn',size:4,note:''}];
  assert.deepEqual(forRequest(files),[{kind:'image',name:'a.png',mime:'image/png',data:'AAAA'},{kind:'text',name:'b.docx',text:'matn'}]);
  assert.equal(JSON.stringify(forView(files)).includes('AAAA'),false);assert.equal(JSON.stringify(forView(files)).includes('matn'),false);
});
