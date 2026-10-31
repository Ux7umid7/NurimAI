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
 await expect(page.locator('#greet')).toHaveText(/Xayrli|Tun/);await expect(page.locator('.suggest button')).toHaveCount(7);
 await expect(page.locator('#tabbar')).toBeVisible();await expect(page.locator('#streak-chip')).toContainText('Kunlik mashq');await expect(page.locator('#hero-still')).toHaveAttribute('src',/pufak\/pufak\.webp/);
 await page.evaluate(()=>{showRecording(true);showClock('0:07');});await expect(page.locator('#voice')).toBeVisible();await page.screenshot({path:'test-results/mobile-voice.png'});await page.locator('#voice-cancel').click();await expect(page.locator('#voice')).toBeHidden(); // the listening view (no recorder: cancel just closes it)
 await page.locator('#question').fill('Kasr nima?');await expect(page.locator('#send')).toBeVisible();await expect(page.locator('#mic')).toBeHidden();await page.locator('#send').click();
 const answer=page.locator('.bubble.assistant').last();await expect(answer).toContainText('Jonli AI emas');await expect(answer.locator('.speak')).toBeVisible();await expect(page.locator('.bubble.user p')).toHaveText('Kasr nima?');
 await expect(page.locator('#tabbar')).toBeHidden();await expect(answer.locator('img')).toHaveAttribute('src',/pufak\/avatar\.webp/); // the menu bar is only on the home screen
 await expect(page.locator('#dock')).toBeHidden({timeout:4000}); // "Tayyor!" Pufak goes away by itself after the answer
 expect(await page.evaluate(()=>{const el=bubble('assistant','Masalan: $\\frac{1}{2}$ va $\\sqrt{9} = 3$');const text=el.querySelector('.rich').textContent;el.remove();return text;})).toBe('Masalan: 1/2 va √9 = 3');
 expect(await page.evaluate(()=>{const el=bubble('assistant','Formulasi:\n\n---\n\nQadamlar'),body=el.querySelector('.rich'),hr=body.querySelector('hr');const out={text:body.textContent,full:Math.round(hr.getBoundingClientRect().width)===Math.round(body.getBoundingClientRect().width)};el.remove();return out;})).toEqual({text:'Formulasi:Qadamlar',full:true});
 await page.locator('#menu').click();await expect(page.locator('#drawer')).toBeVisible();await expect(page.locator('#history-list li strong')).toHaveText('Kasr nima?');
 await page.locator('#history-search').fill('yoq narsa');await expect(page.locator('#history-empty')).toHaveText('Hech narsa topilmadi.');await page.locator('#history-search').fill('');
 await page.locator('#drawer-new').click();await expect(page.locator('#welcome')).toBeVisible();await page.screenshot({path:'test-results/mobile-welcome.png'});
 expect(await page.evaluate(async()=>{const q=document.getElementById('question'),bar=q.parentElement;bar.style.width='60px';grow();const narrow=parseFloat(q.style.height);bar.style.width='';window.dispatchEvent(new Event('resize'));return {narrow,after:parseFloat(q.style.height)};})).toEqual(expect.objectContaining({after:expect.any(Number)}));
 expect(await page.evaluate(()=>parseFloat(document.getElementById('question').style.height))).toBeLessThan(60); // an empty composer is one line again after a resize
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
 await expect(page.locator('#streak-chip')).toContainText('1 kun ketma-ket');
});
test('phone app: settings, a hand-picked theme, and history survives a reload',async()=>{
 const look=()=>page.evaluate(()=>({theme:document.documentElement.dataset.theme,bg:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),bar:document.querySelector('meta[name=theme-color]').content}));
 await page.emulateMedia({colorScheme:'dark'});
 await page.locator('#menu').click();await page.locator('#settings').click();await expect(page.locator('#settings-dialog')).toBeVisible();await expect(page.locator('#version')).toContainText(require('../../package.json').version);
 await expect(page.locator('#theme-choice input[value=system]')).toBeChecked();expect(await look()).toEqual({theme:'dark',bg:'#121317',bar:'#121317'});
 await page.locator('#theme-choice label',{hasText:'Yorug‘'}).click();expect(await look()).toEqual({theme:'light',bg:'#F6F1E7',bar:'#F6F1E7'});await page.waitForTimeout(400);await page.screenshot({path:'test-results/mobile-settings-light.png'});
 await page.emulateMedia({colorScheme:'light'});await page.locator('#theme-choice label',{hasText:'Qorong‘i'}).click();expect((await look()).theme).toBe('dark'); // the choice wins over the phone's mode
 await page.waitForTimeout(400);await page.screenshot({path:'test-results/mobile-settings-dark.png'});await page.locator('#theme-choice label',{hasText:'Yorug‘'}).click();
 await page.locator('#save-history').uncheck();await page.locator('#save-history').check();await page.locator('#settings-dialog .icon-btn').click();
 await page.emulateMedia({colorScheme:'dark'});await page.reload();await page.locator('#question').waitFor();expect((await look()).theme).toBe('light'); // remembered, and set before the first paint
 await page.locator('#menu').click();await expect(page.locator('#history-list li')).toHaveCount(3);
});
test('phone app: a presentation request makes a PowerPoint file to download, kept on the phone for later',async()=>{
 await page.locator('#drawer-new').click();await page.locator('.suggest button',{hasText:'Taqdimot'}).click();await expect(page.locator('#question')).toHaveValue('Taqdimot tayyorlab ber (PowerPoint): ');
 await page.locator('#question').fill('Quyosh tizimi haqida taqdimot tayyorla');await page.locator('#send').click();
 const card=page.locator('.bubble.assistant .doc-card').last();await expect(card).toContainText('Taqdimot - Sinov taqdimoti.pptx');await expect(card.locator('button')).toHaveText('Yuklab olish');
 await page.evaluate(()=>{window.__download=null;HTMLAnchorElement.prototype.click=function(){window.__download={name:this.download,blob:this.href.startsWith('blob:')};};});
 await card.locator('button').click();expect(await page.evaluate(()=>window.__download)).toEqual({name:'Taqdimot - Sinov taqdimoti.pptx',blob:true});
 expect(await page.evaluate(()=>{const [id]=JSON.parse(localStorage.getItem('nurim.docs'));return atob(localStorage.getItem('nurim.doc.'+id)).slice(0,2);})).toBe('PK');
 await page.screenshot({path:'test-results/mobile-doc.png'});
 await page.reload();await page.locator('#question').waitFor();await page.locator('#menu').click();await page.locator('#history-list li .open').first().click();
 await page.evaluate(()=>{window.__download=null;HTMLAnchorElement.prototype.click=function(){window.__download={name:this.download};};});
 await page.locator('.doc-card button').last().click();expect(await page.evaluate(()=>window.__download)).toEqual({name:'Taqdimot - Sinov taqdimoti.pptx'}); // still there after a restart
});
test('phone app: memory is noted under the answer, kept on the phone, shown in settings and can be forgotten',async()=>{
 await page.evaluate(()=>newChat());await page.locator('#question').fill('Men Sinovman /qa-xotira');await page.locator('#send').click();
 await expect(page.locator('.bubble.assistant').last().locator('.memory-note')).toHaveText('🧠 Eslab qoldim: Ismi Sinov; 8-sinfda o‘qiydi');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nurim.memory')).facts.map(f=>f.text))).toEqual(['Ismi Sinov','8-sinfda o‘qiydi']);
 await page.locator('#menu').click();await page.locator('#settings').click();await expect(page.locator('#settings-dialog')).toBeVisible(); // the bottom bar is only on the home screen
 await expect(page.locator('#memory-on')).toBeChecked();await expect(page.locator('#memory-list li')).toHaveCount(2);
 await page.locator('#memory-list').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/mobile-memory.png'});
 await page.locator('#memory-list li button').first().click();await expect(page.locator('#memory-list li span')).toHaveText(['8-sinfda o‘qiydi']);
 await page.locator('#memory-clear').click();await expect(page.locator('#memory-empty')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nurim.memory')).facts.length)).toBe(0);
 await page.locator('#settings-dialog .icon-btn').click();
});
