const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
// PDF textbooks in the document search: their text is read with PDF.js, and the index is kept on disk so a textbook is read once.
const {pdfText,pageText}=require('../src/pdf-text.cjs');
// A small real PDF (Helvetica text, one page per list of lines) with a byte-exact cross-reference table.
function pdf(pages){
 const objects=[],add=body=>{objects.push(body);return objects.length;};
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),kids=[],contents=[];
 for(const lines of pages){const stream='BT /F1 12 Tf 50 750 Td 16 TL '+lines.map(l=>`(${l.replace(/[()\\]/g,m=>'\\'+m)}) Tj T*`).join(' ')+' ET';contents.push(add(`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`));kids.push(add(''));}
 const parent=add(`<< /Type /Pages /Kids [${kids.map(k=>`${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
 kids.forEach((k,i)=>{objects[k-1]=`<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents[i]} 0 R >>`;});
 const catalog=add(`<< /Type /Catalog /Pages ${parent} 0 R >>`);let out='%PDF-1.4\n';const offsets=[];
 objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(out,'latin1'));out+=`${i+1} 0 obj\n${body}\nendobj\n`;});
 const xref=Buffer.byteLength(out,'latin1');
 out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(out,'latin1');
}
const BOOK=[['Fizika 7-sinf darsligi','Nyutonning birinchi qonuni: jism tinch holatda qoladi'],['Ishqalanish kuchi harakatga qarshi yo\'nalgan','Erkin tushish tezlanishi 9,8 m/s2 ga teng']];
test('the text of every page of a PDF is read, line by line',async()=>{
 const text=await pdfText(pdf(BOOK));
 assert.equal(text,'Fizika 7-sinf darsligi\nNyutonning birinchi qonuni: jism tinch holatda qoladi\n\nIshqalanish kuchi harakatga qarshi yo\'nalgan\nErkin tushish tezlanishi 9,8 m/s2 ga teng');
 assert.equal(await pdfText(pdf(BOOK),{pages:1}),'Fizika 7-sinf darsligi\nNyutonning birinchi qonuni: jism tinch holatda qoladi');
 assert.equal(pageText([{str:'Bir',hasEOL:true},{str:'ikki ',hasEOL:true},{}]),'Bir\nikki');
 await assert.rejects(pdfText(Buffer.from('%PDF-1.4 broken')),'a broken PDF is an error the search skips');
});
test('a PDF textbook in a chosen folder answers a question, and its index is kept so it is not read again',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-pdf-'));fs.writeFileSync(path.join(dir,'fizika.pdf'),pdf(BOOK));fs.writeFileSync(path.join(dir,'skan.pdf'),pdf([[]]));
 const indexFile=path.join(dir,'data','rag-index.json');
 // A fresh copy of the module: its in-memory index starts empty, like a new launch of the app.
 const fresh=()=>{delete require.cache[require.resolve('../src/rag.cjs')];return require('../src/rag.cjs').Library;};
 let reads=0;const read=full=>{reads++;return fs.promises.readFile(full);};
 const first=new(fresh())({roots:[{name:'Darsliklar',path:dir}],read,indexFile});
 const found=await first.find('Erkin tushish tezlanishi qancha?');
 assert.deepEqual(found.sources,['Darsliklar/fizika.pdf']);assert.match(found.file.text,/9,8 m\/s2/);assert.equal(reads,2);
 assert.ok(fs.existsSync(indexFile));const saved=JSON.parse(fs.readFileSync(indexFile,'utf8'));assert.equal(saved.v,1);assert.equal(Object.keys(saved.files).length,2,'a PDF with no text is remembered too, so it is not read again');
 const again=new(fresh())({roots:[{name:'Darsliklar',path:dir}],read,indexFile});
 assert.deepEqual((await again.find('Nyutonning birinchi qonuni nima?')).sources,['Darsliklar/fizika.pdf']);assert.equal(reads,2,'the next launch reads the index, not the PDF');
 fs.rmSync(path.join(dir,'skan.pdf'));fs.appendFileSync(path.join(dir,'eslatma.txt'),'Ishqalanish kuchi haqida eslatma');
 await new(fresh())({roots:[{name:'Darsliklar',path:dir}],read,indexFile}).find('Ishqalanish kuchi');
 assert.equal(Object.keys(JSON.parse(fs.readFileSync(indexFile,'utf8')).files).length,2,'a removed file leaves the index, a new one joins it');
 fs.rmSync(dir,{recursive:true,force:true});
});
