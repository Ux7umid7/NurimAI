const {test,expect,_electron:electron}=require('@playwright/test');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
let app,page,profile;
test.beforeAll(async()=>{profile=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-ui-'));app=await electron.launch({args:[path.resolve(__dirname,'../..'),'--qa'],env:{...process.env,NURIMAI_QA_PROFILE:profile},timeout:30000});await expect.poll(()=>app.windows().some(w=>w.url().endsWith('/index.html')),{timeout:20000}).toBeTruthy();page=app.windows().find(w=>w.url().endsWith('/index.html'));await page.locator('#question').waitFor();});
test.afterAll(async()=>{await app?.close();if(profile)fs.rmSync(profile,{recursive:true,force:true});});
test('welcome, send, copy, reset and settings work without an API key',async()=>{
 await expect(page.locator('.brand strong')).toHaveText('NurimAI');await page.locator('#question').fill('Kasr nima?');await page.locator('#send').click();await expect(page.locator('.bubble.assistant p')).toContainText('Jonli AI emas');await page.locator('.bubble.assistant .copy').click();await expect(page.locator('.bubble.assistant .copy')).toHaveText('Olindi ✓');
 await page.locator('#settings').click();await expect(page.locator('#settings-dialog')).toBeVisible();await expect(page.locator('#version')).toContainText(require('../../package.json').version);await page.locator('#topmost').uncheck();await page.locator('#settings-form button[type=submit]').click();await expect(page.locator('#settings-dialog')).not.toBeVisible();await page.locator('#new').click();await expect(page.locator('#welcome')).toBeVisible();await page.screenshot({path:'test-results/welcome.png'});
});
test('renderer has no Node access and AI markup remains inert text',async()=>{
 expect(await page.evaluate(()=>typeof require)).toBe('undefined');await page.locator('#question').fill('<img src=x onerror="window.hacked=true">');await page.locator('#send').click();await expect(page.locator('.bubble.user p')).toContainText('<img');expect(await page.evaluate(()=>window.hacked)).toBeUndefined();expect(await page.locator('.bubble.user img').count()).toBe(0);
});
test('settings masks keys and shows honest update status',async()=>{
 await page.locator('#settings').click();await page.locator('summary').click();await expect(page.locator('#key-Gemini')).toHaveAttribute('type','password');await expect(page.locator('#key-Groq')).toHaveAttribute('type','password');await page.locator('#check-update').click();await expect(page.locator('#update-status')).toContainText('Dasturchi rejimi');await page.screenshot({path:'test-results/settings.png'});await page.locator('#close-settings').click();
});
test('the theme is chosen by hand (light, dark or the system’s) and remembered',async()=>{
 const look=()=>page.evaluate(()=>({theme:document.documentElement.dataset.theme,bg:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),saved:localStorage.getItem('nurim.theme')}));
 await page.emulateMedia({colorScheme:'dark'});await page.locator('#settings').click();await expect(page.locator('#theme-choice input[value=system]')).toBeChecked();expect(await look()).toEqual({theme:'dark',bg:'#121317',saved:null});
 await page.locator('#theme-choice label',{hasText:'Yorug‘'}).click();expect(await look()).toEqual({theme:'light',bg:'#F6F1E7',saved:'light'});await page.waitForTimeout(400);await page.screenshot({path:'test-results/settings-light.png'});
 await page.emulateMedia({colorScheme:'light'});await page.locator('#theme-choice label',{hasText:'Qorong‘i'}).click();expect(await look()).toEqual({theme:'dark',bg:'#121317',saved:'dark'}); // the choice wins over the system
 await page.locator('#close-settings').click();await page.locator('#settings').click();await expect(page.locator('#theme-choice input[value=dark]')).toBeChecked();
 await page.locator('#theme-choice label',{hasText:'Tizim'}).click();expect((await look()).theme).toBe('light');await page.emulateMedia({colorScheme:'dark'});await expect.poll(async()=>(await look()).theme).toBe('dark'); // "Tizim" follows a change of the system
 await page.locator('#close-settings').click();
});
test('dropped files become chips, quick actions send them, and chips can be removed',async()=>{
 await page.locator('#new').click();
 await page.evaluate(()=>{const dt=new DataTransfer();dt.items.add(new File(['Uy vazifasi: 2+2 nechaga teng?'],'vazifa.txt',{type:'text/plain'}));document.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));});
 await expect(page.locator('#attachments .file-chip')).toContainText('vazifa.txt');await expect(page.locator('#file-actions')).toBeVisible();
 await page.locator('[data-file-prompt]').first().click();
 await expect(page.locator('.bubble.assistant').last()).toContainText('Biriktirilgan fayllar: 1');await expect(page.locator('.bubble.user').last().locator('.file-chip')).toContainText('vazifa.txt');
 await page.locator('#question').fill('Yana bir savol');await page.locator('#send').click();await expect(page.locator('.bubble.assistant').last()).toContainText('Biriktirilgan fayllar: 1');await expect(page.locator('.bubble.user').last().locator('.file-chip')).toHaveCount(0);
 await page.locator('#attachments .file-chip button').click();await expect(page.locator('#attachments')).toBeHidden();await expect(page.locator('#file-actions')).toBeHidden();
 await page.evaluate(()=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([1,2,3])],'dastur.exe'));document.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));});
 await expect(page.locator('#notice')).toContainText('qo‘llab-quvvatlanmaydi');await page.screenshot({path:'test-results/attachments.png'});
});
test('answers are formatted safely: lists, bold and code stay inert DOM',async()=>{
 const html=await page.evaluate(()=>{const d=document.createElement('div');rich(d,'**Qalin** va `kod`\n- bir\n- ikki\n1. birinchi\n```\n<img src=x onerror="window.pwned=1">\n```');return {strong:d.querySelector('p strong')?.textContent,items:d.querySelectorAll('ul li').length,ol:d.querySelectorAll('ol li').length,code:d.querySelector('pre code')?.textContent,img:d.querySelectorAll('img').length,pwned:window.pwned};});
 expect(html).toEqual({strong:'Qalin',items:2,ol:1,code:'<img src=x onerror="window.pwned=1">',img:0,pwned:undefined});
 const math=await page.evaluate(()=>{const was=$('welcome').hidden,el=bubble('assistant','Masalan: $\\frac{1}{2}$ va $x^2$, kodda `$\\frac{1}{2}$`');const text=el.querySelector('.rich').textContent;el.remove();$('welcome').hidden=was;return text;});
 expect(math).toBe('Masalan: 1/2 va x², kodda $\\frac{1}{2}$'); // LaTeX math reads as plain text, code stays as written
 const rule=await page.evaluate(()=>{const was=$('welcome').hidden,el=bubble('assistant','Bir\n\n---\n\nIkki\n* * *\n```\n---\n```'),body=el.querySelector('.rich'),hr=body.querySelectorAll(':scope>hr');const out={hr:hr.length,text:[...body.querySelectorAll(':scope>p')].map(p=>p.textContent),code:body.querySelector('pre code').textContent,full:Math.round(hr[0].getBoundingClientRect().width)===Math.round(body.getBoundingClientRect().width),spoken:speechText('Bir\n---\nIkki')};el.remove();$('welcome').hidden=was;return out;});
 expect(rule).toEqual({hr:2,text:['Bir','Ikki'],code:'---',full:true,spoken:'Bir\nIkki'}); // --- and * * * draw a full-width line, stay text in code, and are not read aloud
});
test('3D Nur hops when an answer arrives, then plays idle once',async()=>{
 const pet=app.windows().find(w=>w.url().endsWith('/pet.html'));
 await expect(pet.locator('#idle.on')).toBeVisible({timeout:15000});await expect(pet.locator('#still')).toBeHidden();
 await page.locator('#new').click();await page.locator('#question').fill('Salom');await page.locator('#send').click();
 await expect(pet.locator('#happy.on')).toBeVisible({timeout:5000});await expect(pet.locator('#idle.on')).toBeVisible({timeout:6000});
 const before=await pet.evaluate(()=>document.getElementById('idle').currentTime);await pet.waitForTimeout(500);expect(await pet.evaluate(()=>document.getElementById('idle').currentTime)).toBeGreaterThan(before); // idle replays once after the hop
 await expect(page.locator('#hero-nur')).toHaveAttribute('src',/pufak\/pufak\.webp/); // the chat window shows the 2D brand Pufak
});
test('Nur catches files, is sad on errors, sleeps and waves when woken',async()=>{
 const pet=app.windows().find(w=>w.url().endsWith('/pet.html'));await page.locator('#new').click();
 await page.evaluate(()=>{const dt=new DataTransfer();dt.items.add(new File(['Matn'],'eslatma.txt',{type:'text/plain'}));document.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));});
 await expect(pet.locator('#catch.on')).toBeVisible({timeout:5000});await page.locator('#attachments .file-chip button').click();
 await page.locator('#question').fill('/qa-xato');await page.locator('#send').click();await expect(page.locator('#notice')).toContainText('Sinov xatosi');await expect(pet.locator('#sad.on')).toBeVisible({timeout:5000});
 await app.evaluate(()=>globalThis.nurimQA.sleep());await expect(pet.locator('#sleep.on')).toBeVisible({timeout:5000});
 await pet.locator('#pet').hover();await expect(pet.locator('#wave.on')).toBeVisible({timeout:5000});await expect(pet.locator('#idle.on')).toBeVisible({timeout:8000});
});
test('selected-text shortcut attaches the selection and asks for an explanation',async()=>{
 await page.locator('#new').click();await app.evaluate((_electron,text)=>globalThis.nurimQA.explain(text),'Fotosintez — yorug‘lik energiyasi.');
 const asked=page.locator('.bubble.user').last();await expect(asked).toContainText('Belgilangan matnni oddiy tilda tushuntirib ber.');await expect(asked.locator('.file-chip')).toContainText('Belgilangan matn.txt');
 await expect(page.locator('.bubble.assistant').last()).toContainText('Biriktirilgan fayllar: 1');
 await app.evaluate(()=>globalThis.nurimQA.explain(''));await expect(page.locator('#notice')).toContainText('Belgilangan matn topilmadi');
});
test('history saves, searches, reopens and deletes conversations',async()=>{
 for(const q of ['Fotosintez nima?','Kasr nima?']){await page.locator('#new').click();await page.locator('#question').fill(q);await page.locator('#send').click();await expect(page.locator('.bubble.assistant').last()).toContainText('Jonli AI emas');}
 await expect(page.locator('#sidebar')).toBeVisible();await expect(page.locator('#side-history li.current span')).toHaveText('Kasr nima?'); // the wide window lists chats in the sidebar too
 await page.locator('#side-search').fill('foto');await expect(page.locator('#side-history li')).toHaveCount(1);await page.locator('#side-search').fill('');await page.screenshot({path:'test-results/desktop-sidebar.png'});
 await page.locator('#history').click();await expect(page.locator('#history-dialog')).toBeVisible();await expect(page.locator('#history-list li.current strong')).toHaveText('Kasr nima?');
 await page.locator('#history-search').fill('FOTOSINTEZ');await expect(page.locator('#history-list li')).toHaveCount(1);await page.screenshot({path:'test-results/history.png'});
 await page.locator('#history-list .history-open').click();await expect(page.locator('#history-dialog')).not.toBeVisible();await expect(page.locator('.bubble.user').first()).toContainText('Fotosintez nima?');await expect(page.locator('.bubble')).toHaveCount(2);
 await page.locator('#question').fill('Davom etamiz');await page.locator('#send').click();await expect(page.locator('.bubble')).toHaveCount(4);
 await page.locator('#history').click();await page.locator('#history-search').fill('fotosintez');await expect(page.locator('#history-list li')).toHaveCount(1);await expect(page.locator('#history-list li small')).toContainText('4 ta xabar');
 await page.locator('#history-list .history-delete').click();await expect(page.locator('#history-empty')).toHaveText('Hech narsa topilmadi.');await page.locator('#close-history').click();
 await page.locator('#settings').click();await expect(page.locator('#save-history')).toBeChecked();await page.locator('#close-settings').click();
});
test('Ustoz: AI test is solved step by step, mistakes become cards, cards are reviewed and the streak starts',async()=>{
 await page.locator('#new').click();await page.locator('#ustoz').click();await expect(page.locator('#ustoz-dialog')).toBeVisible();await expect(page.locator('#streak-count')).toHaveText('Bugun boshlaymiz');
 await page.locator('[data-tab=quiz]').click();await page.locator('#quiz-topic').fill('Qo‘shish');await page.locator('#quiz-form button[type=submit]').click();
 await expect(page.locator('#quiz-run .question')).toHaveText('2 + 2 nechaga teng?');await page.locator('#quiz-run .option').nth(1).click();await expect(page.locator('#quiz-run .explain')).toContainText('To‘g‘ri!');
 await page.locator('#quiz-run button.primary').click();await page.locator('#quiz-run .option').nth(0).click();await expect(page.locator('#quiz-run .option.wrong')).toHaveCount(1);await expect(page.locator('#quiz-run .option.right')).toHaveText('6');
 await page.locator('#quiz-run button.primary').click();await page.locator('#quiz-run .option').nth(1).click();await page.locator('#quiz-run button.primary').click();
 await expect(page.locator('#quiz-run .result strong')).toHaveText('2/3');await expect(page.locator('#quiz-run .result small')).toContainText('1 ta xato');await page.screenshot({path:'test-results/ustoz-quiz.png'});
 await page.locator('[data-tab=cards]').click();await page.locator('#cards-topic').fill('Mevalar');await page.locator('#cards-form button[type=submit]').click();
 await expect(page.locator('#study .card-front')).toBeVisible();await expect(page.locator('#study .run-head b')).toHaveText(/1\/[34]/);
 for(let i=0;i<10&&await page.locator('#study .card-front').isVisible();i++){await page.locator('#study button.primary').click();await page.locator('#study .grade.know').click();}
 await expect(page.locator('#ustoz-note')).toContainText('Takrorlash tugadi');await expect(page.locator('#decks li')).toHaveCount(2);
 await page.locator('[data-tab=today]').click();await expect(page.locator('#streak-count')).toHaveText('1 kun ketma-ket');
 await expect(page.locator('#streak-week li')).toHaveCount(7);await expect(page.locator('#streak-week li.today.done')).toHaveCount(1);await expect(page.locator('#streak-chip')).toContainText('1 kun ketma-ket'); // week row and the gold practice cardawait expect(page.locator('#results li')).toHaveCount(1);await page.screenshot({path:'test-results/ustoz-today.png'});
 await page.locator('#teacher').check();await expect(page.locator('#ustoz-note')).toContainText('yoqildi');await page.locator('#teacher').uncheck();await page.locator('#close-ustoz').click();
});
test('reminders can be added, fire as a note in chat and open the Ustoz panel',async()=>{
 await page.locator('#ustoz').click();await page.locator('[data-tab=remind]').click();await page.locator('#remind-text').fill('Kitob o‘qish');await page.locator('#remind-time').fill('21:30');await page.locator('#remind-repeat').selectOption('daily');await page.locator('#remind-form button[type=submit]').click();
 await expect(page.locator('#reminders li')).toContainText('21:30 · har kuni');await page.locator('#practice-on').check();await expect(page.locator('#ustoz-note')).toContainText('eslataman');await page.locator('#practice-on').uncheck();await expect(page.locator('#ustoz-note')).toContainText('o‘chirildi');
 await page.locator('#reminders li').filter({hasText:'Kitob'}).locator('button').click();await expect(page.locator('#reminders li')).toHaveCount(0);await page.locator('#close-ustoz').click();
 await app.evaluate(()=>globalThis.nurimQA.remind());await expect(page.locator('#notice')).toContainText('⏰ Sinov eslatmasi');
});
test('a voice question shows what was heard, the answer can be read aloud and stopped',async()=>{
 await page.locator('#new').click();
 await page.evaluate(()=>askVoice(encodeWav(new Float32Array(16000).map((_,i)=>Math.sin(i/10)*0.2),16000),1.2));
 await expect(page.locator('.bubble.user').last()).toHaveText(/🎤 Kasr nima\?/);const answer=page.locator('.bubble.assistant').last();await expect(answer).toContainText('Jonli AI emas');await expect(answer).not.toContainText('Savolingiz');
 await expect(answer.locator('.speak')).toHaveText('🔊 Tinglash',{timeout:5000});await answer.locator('.speak').click();await expect(answer.locator('.speak')).toHaveText('◼ To‘xtatish');await expect(answer.locator('.speak')).toHaveText('🔊 Tinglash',{timeout:5000});
 expect(await page.evaluate(()=>speechParts(speechText('**Salom!** Bu `kod`. '+'Uzun gap. '.repeat(200))).map(p=>p.length<=1100))).not.toContain(false);
 await page.evaluate(()=>{const b=document.getElementById('mic');return b.getAttribute('aria-label');}).then(label=>expect(label).toBe('Ovozli savol'));
});
test('Nur talks while an answer is read and listens while a question is recorded',async()=>{
 const pet=app.windows().find(w=>w.url().endsWith('/pet.html'));
 for(const mood of ['talk','listen']){await page.evaluate(m=>window.nurim.petMood(m),mood);await expect(pet.locator(`#${mood}.on`)).toBeVisible({timeout:5000});}
 await page.evaluate(()=>window.nurim.petMood('idle'));await expect(pet.locator('#idle.on')).toBeVisible({timeout:5000});
 expect(await page.evaluate(()=>window.nurim.petMood('happy'))).toEqual({ok:true,data:undefined}); // only talk/listen/idle are accepted from the chat window
 await page.evaluate(()=>{showRecording(true);showClock('0:07');});await expect(page.locator('#voice')).toBeVisible();await expect(page.locator('#voice-time')).toHaveText('0:07');await expect(page.locator('#voice-send')).toBeFocused();
 await page.screenshot({path:'test-results/desktop-voice.png'});await page.evaluate(()=>showRecording(false));await expect(page.locator('#voice')).toBeHidden(); // the full-screen listening view follows the recorder
});
test('a referat or presentation request makes a Word/PowerPoint file in Documents\\NurimAI, opened from a card that stays in history',async()=>{
 await page.locator('#new').click();await expect(page.locator('.prompts button',{hasText:'Referat yoz'})).toBeVisible();
 await page.locator('.prompts button',{hasText:'Referat yoz'}).click();await expect(page.locator('#question')).toHaveValue('Referat yozib ber (Word): ');
 await page.locator('#question').fill('Fotosintez haqida referat yozib ber');await page.locator('#send').click();
 const answer=page.locator('.bubble.assistant').last(),card=answer.locator('.doc-card');
 await expect(answer).toContainText('Referat tayyor: Sinov referati');await expect(card).toContainText('Referat - Sinov referati.docx');await expect(card.locator('b')).toHaveText('DOCX');
 expect(fs.readFileSync(path.join(profile,'documents','Referat - Sinov referati.docx')).subarray(0,4)).toEqual(Buffer.from([0x50,0x4b,3,4]));
 await card.locator('.doc-open').click();await card.locator('.doc-show').click();await expect(page.locator('#notice')).toBeHidden();
 await page.locator('#question').fill('Quyosh tizimi haqida taqdimot tayyorla');await page.locator('#send').click();await expect(page.locator('.doc-card').last()).toContainText('Taqdimot - Sinov taqdimoti.pptx');
 await page.locator('#question').fill('Yana bitta referat yoz: suv');await page.locator('#send').click();await expect(page.locator('.doc-card').last()).toContainText('Referat - Sinov referati (2).docx');
 await page.screenshot({path:'test-results/desktop-doc.png'});
 expect(await page.evaluate(()=>window.nurim.docOpen('C:\\Windows\\win.ini'))).toEqual({ok:false,error:'Fayl topilmadi: u o‘chirilgan yoki ko‘chirilgan bo‘lishi mumkin.'}); // only NurimAI's own files
 await page.locator('#history').click();await page.locator('#history-list .history-open').first().click();await expect(page.locator('.doc-card')).toHaveCount(3); // the cards come back with the chat
});
