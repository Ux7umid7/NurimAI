const test=require('node:test');const assert=require('node:assert/strict');
const Docs=require('../src/shared/office-write.js');const {docxText,pptxText}=require('../src/shared/office-core.js');const {readZip}=require('../src/attachments.cjs');
// Referats (.docx) and presentations (.pptx) made by NurimAI: valid zips Office opens, with the AI's text inside.
const referatJson=JSON.stringify({mavzu:'Fotosintez',bolimlar:[{sarlavha:'Kirish',matn:['Fotosintez — **hayot** manbai.','Ikkinchi xatboshi <b>&</b>.']},{sarlavha:'## Bosqichlari',matn:['- Yorug‘lik bosqichi.']},{sarlavha:'Xulosa',matn:['Yakun.']},{sarlavha:'',matn:['bo‘sh sarlavha tushib qoladi']}],adabiyotlar:['Biologiya 7-sinf darsligi',' ']});
const deckJson='Mana:\n```json\n'+JSON.stringify({mavzu:'Quyosh tizimi',izoh:'8-sinf',slaydlar:[{sarlavha:'Sayyoralar',bandlar:['Merkuriy','Venera','Yer']},{sarlavha:'Xulosa',bandlar:['Kosmos qiziq']},{sarlavha:'Bo‘sh',bandlar:[]}]})+'\n```';
const when=new Date('2026-10-29T10:00:00Z');

test('requests for a referat or a presentation are recognised, with page and slide counts; questions about them are not',()=>{
 assert.deepEqual(Docs.detect('Fotosintez haqida referat yozib ber'),{kind:'docx',pages:3,slides:10});
 assert.deepEqual(Docs.detect('Amir Temur mavzusida 5 betlik referat tayyorla'),{kind:'docx',pages:5,slides:10});
 assert.deepEqual(Docs.detect('Quyosh tizimi bo‘yicha 8 ta slayd taqdimot qilib ber'),{kind:'pptx',pages:3,slides:8});
 assert.equal(Docs.detect('Prezentatsiya tayyorla: suv aylanishi').kind,'pptx');assert.equal(Docs.detect('Сделай презентацию про космос').kind,'pptx');assert.equal(Docs.detect('Напиши реферат о воде').kind,'docx');
 assert.equal(Docs.detect('referat yoz, 30 bet').pages,5);assert.equal(Docs.detect('taqdimot tayyorla, 99 slayd').slides,15);assert.equal(Docs.detect('Menga referat kerak: Suv').kind,'docx');
 for(const q of ['Referat nima?','Taqdimot qanday bo‘lishi kerak?','Referatni qanday qilish kerak?','Kasr nima?','',null])assert.equal(Docs.detect(q),null,String(q));
 assert.match(Docs.prompt('Kosmos haqida taqdimot',{kind:'pptx',slides:8}),/8 slaydli taqdimot[\s\S]*7 ta mazmunli slayd[\s\S]*"slaydlar"/);
 assert.match(Docs.prompt('Suv haqida referat',{kind:'docx',pages:4},true),/biriktirilgan fayl[\s\S]*4 bet, ya’ni matn jami kamida 1000 so‘z[\s\S]*"bolimlar"/);
});
test('the AI\'s JSON becomes a clean plan: Markdown is dropped, empty parts are skipped, nonsense is refused',()=>{
 const r=Docs.parse('docx',referatJson);
 assert.deepEqual(r,{kind:'docx',title:'Fotosintez',sections:[{heading:'Kirish',paragraphs:['Fotosintez — hayot manbai.','Ikkinchi xatboshi <b>&</b>.']},{heading:'Bosqichlari',paragraphs:['Yorug‘lik bosqichi.']},{heading:'Xulosa',paragraphs:['Yakun.']}],sources:['Biologiya 7-sinf darsligi']});
 const d=Docs.parse('pptx',deckJson);assert.deepEqual(d,{kind:'pptx',title:'Quyosh tizimi',subtitle:'8-sinf',slides:[{title:'Sayyoralar',bullets:['Merkuriy','Venera','Yer']},{title:'Xulosa',bullets:['Kosmos qiziq']}]});
 for(const bad of ['yo‘q','{"mavzu":"x"}','{"mavzu":"","bolimlar":[{"sarlavha":"a","matn":["b"]},{"sarlavha":"c","matn":["d"]}]}','{"mavzu":"x","bolimlar":[{"sarlavha":"a","matn":["b"]}]}'])assert.equal(Docs.parse('docx',bad),null,bad);
 assert.equal(Docs.parse('pptx','{"mavzu":"x","slaydlar":[{"sarlavha":"a","bandlar":["b"]}]}'),null);
 const ap=Docs.parse('docx',JSON.stringify({mavzu:"O'zbekiston",bolimlar:[{sarlavha:"G'alaba",matn:["Ma'rifat, bog'lar, Qo`qon va so'z"]},{sarlavha:'Xulosa',matn:['ok']}]}));
 assert.deepEqual([ap.title,ap.sections[0].heading,ap.sections[0].paragraphs[0]],['O‘zbekiston','G‘alaba','Ma’rifat, bog‘lar, Qo‘qon va so‘z']); // Uzbek Latin letters, not typewriter apostrophes
 assert.equal(Docs.fileName({kind:'docx',title:'Ona tili: "imlo" / qoidalar?'}),'Referat - Ona tili imlo qoidalar.docx');assert.equal(Docs.fileName(d),'Taqdimot - Quyosh tizimi.pptx');
 assert.match(Docs.summary(r),/^📄 \*\*Referat tayyor:\*\* Fotosintez\n[\s\S]*1\. Kirish\n2\. Bosqichlari\n3\. Xulosa\n4\. Foydalanilgan adabiyotlar/);assert.match(Docs.summary(d),/^📊 \*\*Taqdimot tayyor:\*\* Quyosh tizimi\n3 ta slayd[\s\S]*2\. Sayyoralar\n3\. Xulosa$/);
});
test('the zip is stored, every CRC is right and Office\'s own parts are there',()=>{
 const bytes=Docs.docx(Docs.parse('docx',referatJson),when),view=new DataView(bytes.buffer);
 assert.equal(view.getUint32(0,true),0x04034b50);const zip=readZip(Buffer.from(bytes));
 assert.deepEqual(zip.names,['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml','word/footer1.xml','word/settings.xml','word/_rels/document.xml.rels','docProps/core.xml','docProps/app.xml']);
 let at=0;while(view.getUint32(at,true)===0x04034b50){const size=view.getUint32(at+18,true),name=view.getUint16(at+26,true),data=bytes.subarray(at+30+name,at+30+name+size);assert.equal(view.getUint32(at+14,true),Docs.crc32(data));at+=30+name+size;}
 assert.equal(Docs.crc32(new TextEncoder().encode('123456789')),0xCBF43926);
});
test('a referat has a title page, the plan, the sections and the sources, in safe XML',()=>{
 const zip=readZip(Buffer.from(Docs.docx(Docs.parse('docx',referatJson),when)));
 const text=docxText(zip);assert.match(text,/^REFERAT\n[\s\S]*Mavzu: «Fotosintez»[\s\S]*Bajardi:[\s\S]*2026-yil\n[\s\S]*Reja\n1\. Kirish\n2\. Bosqichlari\n3\. Xulosa\n4\. Foydalanilgan adabiyotlar\n[\s\S]*Kirish\nFotosintez — hayot manbai\.\nIkkinchi xatboshi <b>&<\/b>\.\n[\s\S]*Foydalanilgan adabiyotlar\n1\. Biologiya 7-sinf darsligi/);
 const xml=zip.text('word/document.xml');assert.match(xml,/Ikkinchi xatboshi &lt;b&gt;&amp;&lt;\/b&gt;\./);assert.match(xml,/<w:pgSz w:w="11906" w:h="16838"\/>/);assert.match(xml,/<w:titlePg\/>/);
 assert.match(zip.text('word/styles.xml'),/Times New Roman[\s\S]*w:sz w:val="28"[\s\S]*w:line="360"/);assert.match(zip.text('word/footer1.xml'),/ PAGE /);assert.match(zip.text('docProps/core.xml'),/<dc:title>Fotosintez<\/dc:title>/);
});
test('a presentation has a title slide and one slide per part, numbered, with every relationship in place',()=>{
 const zip=readZip(Buffer.from(Docs.pptx(Docs.parse('pptx',deckJson),when)));
 assert.equal(pptxText(zip),'## Slayd 1\nQuyosh tizimi\n8-sinf\n\n## Slayd 2\nSayyoralar\nMerkuriy\nVenera\nYer\n2 / 3\n\n## Slayd 3\nXulosa\nKosmos qiziq\n3 / 3');
 const presentation=zip.text('ppt/presentation.xml'),rels=zip.text('ppt/_rels/presentation.xml.rels'),types=zip.text('[Content_Types].xml');
 for(const i of [1,2,3]){assert.ok(zip.names.includes(`ppt/slides/slide${i}.xml`));assert.ok(zip.names.includes(`ppt/slides/_rels/slide${i}.xml.rels`));assert.match(types,new RegExp(`/ppt/slides/slide${i}\\.xml`));assert.match(rels,new RegExp(`slides/slide${i}\\.xml`));}
 assert.equal((presentation.match(/<p:sldId /g)||[]).length,3);assert.match(presentation,/<p:sldSz cx="12192000" cy="6858000"\/>/);
 for(const part of ['ppt/slideMasters/slideMaster1.xml','ppt/slideLayouts/slideLayout1.xml','ppt/theme/theme1.xml','ppt/presProps.xml','ppt/viewProps.xml','ppt/tableStyles.xml'])assert.ok(zip.names.includes(part),part);
 assert.match(zip.text('ppt/slides/slide1.xml'),/<p:bg>[\s\S]*121317/);assert.match(zip.text('docProps/app.xml'),/<Slides>3<\/Slides>/);
});
