const {test,expect,_electron:electron}=require('@playwright/test');const path=require('node:path');const zlib=require('node:zlib');
let app,page;
test.beforeAll(async()=>{app=await electron.launch({args:[path.join(__dirname,'mobile-host.cjs')],timeout:30000});page=await app.firstWindow();await page.locator('#question').waitFor();});
test.afterAll(async()=>{await app?.close();});
function docx(text){const raw=Buffer.from(`<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`),data=zlib.deflateRawSync(raw),name=Buffer.from('word/document.xml');
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);
 const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(8,10);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(raw.length,24);dir.writeUInt16LE(name.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+name.length,12);end.writeUInt32LE(30+name.length+data.length,16);
 return Buffer.concat([local,name,data,dir,name,end]);}
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJgYGBAQAWBgICcNjU9wAAAABJRU5ErkJggg==','base64');
test('phone app: greeting, a typed question, answer actions and the chat in the menu',async()=>{
 await expect(page.locator('#greet')).toHaveText(/Xayrli|Tun/);await expect(page.locator('.suggest button')).toHaveCount(5);
 await page.locator('#question').fill('Kasr nima?');await expect(page.locator('#send')).toBeVisible();await expect(page.locator('#mic')).toBeHidden();await page.locator('#send').click();
 const answer=page.locator('.bubble.assistant').last();await expect(answer).toContainText('Jonli AI emas');await expect(answer.locator('.speak')).toBeVisible();await expect(page.locator('.bubble.user p')).toHaveText('Kasr nima?');
 expect(await page.evaluate(()=>{const el=bubble('assistant','Masalan: $\\frac{1}{2}$ va $\\sqrt{9} = 3$');const text=el.querySelector('.rich').textContent;el.remove();return text;})).toBe('Masalan: 1/2 va √9 = 3');
 await page.locator('#menu').click();await expect(page.locator('#drawer')).toBeVisible();await expect(page.locator('#history-list li strong')).toHaveText('Kasr nima?');
 await page.locator('#history-search').fill('yoq narsa');await expect(page.locator('#history-empty')).toHaveText('Hech narsa topilmadi.');await page.locator('#history-search').fill('');
 await page.locator('#drawer-new').click();await expect(page.locator('#welcome')).toBeVisible();await page.screenshot({path:'test-results/mobile-welcome.png'});
});
test('phone app: photo, Word and text files become chips and go with the question',async()=>{
 await page.locator('#pick-image').setInputFiles({name:'masala.png',mimeType:'image/png',buffer:PNG});
 await page.locator('#pick-file').setInputFiles([{name:'reja.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docx('Dars rejasi')},{name:'vazifa.txt',mimeType:'text/plain',buffer:Buffer.from('2+2=?')}]);
 await expect(page.locator('#attachments .file-chip')).toHaveCount(3);await expect(page.locator('#attachments .file-chip img')).toHaveCount(1);await expect(page.locator('#attachments')).toContainText('reja.docx');
 await page.locator('[data-file-prompt]').first().click();await expect(page.locator('.bubble.assistant').last()).toContainText('Biriktirilgan fayllar: 3');await expect(page.locator('.bubble.user').last().locator('.file-chip')).toHaveCount(3);
 await page.locator('#pick-file').setInputFiles({name:'eski.doc',mimeType:'application/msword',buffer:Buffer.from('x')});await expect(page.locator('#notice')).toContainText('eski .doc');
 await page.screenshot({path:'test-results/mobile-files.png'});
});
test('phone app: voice question, read-aloud and the Ustoz quiz',async()=>{
 await page.locator('#new').click();
 await page.evaluate(()=>askVoice(encodeWav(new Float32Array(16000).map((_,i)=>Math.sin(i/9)*0.2),16000),1.5));
 await expect(page.locator('.bubble.user').last()).toHaveText(/🎤 Kasr nima\?/);const answer=page.locator('.bubble.assistant').last();await expect(answer).not.toContainText('Savolingiz');
 await expect(answer.locator('.speak')).toHaveText('🔊 Tinglash',{timeout:5000});
 await page.locator('#menu').click();await page.locator('#ustoz').click();await expect(page.locator('#ustoz-dialog')).toBeVisible();await expect(page.locator('#drawer')).toBeHidden();
 await page.locator('[data-tab=quiz]').click();await page.locator('#quiz-topic').fill('Qo‘shish');await page.locator('#quiz-form button[type=submit]').click();
 await page.locator('#quiz-run .option').nth(1).click();await expect(page.locator('#quiz-run .explain')).toContainText('To‘g‘ri!');await page.screenshot({path:'test-results/mobile-quiz.png'});
 for(let i=0;i<2;i++){await page.locator('#quiz-run button.primary').click();await page.locator('#quiz-run .option').nth(0).click();}
 await page.locator('#quiz-run button.primary').click();await expect(page.locator('#quiz-run .result strong')).toHaveText('1/3');
 await page.locator('[data-tab=today]').click();await expect(page.locator('#streak-count')).toHaveText('1 kun ketma-ket');await page.locator('#close-ustoz').click();
 await expect(page.locator('#streak-chip')).toContainText('🔥 1 kun');
});
test('phone app: settings, and history survives a reload',async()=>{
 await page.locator('#menu').click();await page.locator('#settings').click();await expect(page.locator('#settings-dialog')).toBeVisible();await expect(page.locator('#version')).toContainText(require('../../package.json').version);
 await page.locator('#save-history').uncheck();await page.locator('#save-history').check();await page.locator('#settings-dialog .icon-btn').click();
 await page.reload();await page.locator('#question').waitFor();await page.locator('#menu').click();await expect(page.locator('#history-list li')).toHaveCount(3);
});
