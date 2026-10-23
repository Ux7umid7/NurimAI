const {test,expect,_electron:electron}=require('@playwright/test');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
let app,page,profile;
test.beforeAll(async()=>{profile=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-ui-'));app=await electron.launch({args:[path.resolve(__dirname,'../..'),'--qa'],env:{...process.env,NURIMAI_QA_PROFILE:profile},timeout:30000});await expect.poll(()=>app.windows().some(w=>w.url().endsWith('/index.html')),{timeout:20000}).toBeTruthy();page=app.windows().find(w=>w.url().endsWith('/index.html'));await page.locator('#question').waitFor();});
test.afterAll(async()=>{await app?.close();if(profile)fs.rmSync(profile,{recursive:true,force:true});});
test('welcome, send, copy, reset and settings work without an API key',async()=>{
 await expect(page.locator('.brand strong')).toHaveText('NurimAI');await page.locator('#question').fill('Kasr nima?');await page.locator('#send').click();await expect(page.locator('.bubble.assistant p')).toContainText('Jonli AI emas');await page.locator('.bubble.assistant button').click();await expect(page.locator('.bubble.assistant button')).toHaveText('Olindi ✓');
 await page.locator('#settings').click();await expect(page.locator('#settings-dialog')).toBeVisible();await expect(page.locator('#version')).toContainText(require('../../package.json').version);await page.locator('#topmost').uncheck();await page.locator('#settings-form button[type=submit]').click();await expect(page.locator('#settings-dialog')).not.toBeVisible();await page.locator('#new').click();await expect(page.locator('#welcome')).toBeVisible();await page.screenshot({path:'test-results/welcome.png'});
});
test('renderer has no Node access and AI markup remains inert text',async()=>{
 expect(await page.evaluate(()=>typeof require)).toBe('undefined');await page.locator('#question').fill('<img src=x onerror="window.hacked=true">');await page.locator('#send').click();await expect(page.locator('.bubble.user p')).toContainText('<img');expect(await page.evaluate(()=>window.hacked)).toBeUndefined();expect(await page.locator('.bubble.user img').count()).toBe(0);
});
test('settings masks keys and shows honest update status',async()=>{
 await page.locator('#settings').click();await page.locator('summary').click();await expect(page.locator('#key-Gemini')).toHaveAttribute('type','password');await expect(page.locator('#key-Groq')).toHaveAttribute('type','password');await page.locator('#check-update').click();await expect(page.locator('#update-status')).toContainText('Dasturchi rejimi');await page.screenshot({path:'test-results/settings.png'});await page.locator('#close-settings').click();
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
});
test('3D Nur hops when an answer arrives, then plays idle once',async()=>{
 const pet=app.windows().find(w=>w.url().endsWith('/pet.html'));
 await expect(pet.locator('#idle.on')).toBeVisible({timeout:15000});await expect(pet.locator('#still')).toBeHidden();
 await page.locator('#new').click();await page.locator('#question').fill('Salom');await page.locator('#send').click();
 await expect(pet.locator('#happy.on')).toBeVisible({timeout:5000});await expect(pet.locator('#idle.on')).toBeVisible({timeout:6000});
 const before=await pet.evaluate(()=>document.getElementById('idle').currentTime);await pet.waitForTimeout(500);expect(await pet.evaluate(()=>document.getElementById('idle').currentTime)).toBeGreaterThan(before); // idle replays once after the hop
 await expect(page.locator('.hero video')).toHaveAttribute('src',/nur\/idle\.webm/);
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
 await page.locator('#history').click();await expect(page.locator('#history-dialog')).toBeVisible();await expect(page.locator('#history-list li.current strong')).toHaveText('Kasr nima?');
 await page.locator('#history-search').fill('FOTOSINTEZ');await expect(page.locator('#history-list li')).toHaveCount(1);await page.screenshot({path:'test-results/history.png'});
 await page.locator('#history-list .history-open').click();await expect(page.locator('#history-dialog')).not.toBeVisible();await expect(page.locator('.bubble.user').first()).toContainText('Fotosintez nima?');await expect(page.locator('.bubble')).toHaveCount(2);
 await page.locator('#question').fill('Davom etamiz');await page.locator('#send').click();await expect(page.locator('.bubble')).toHaveCount(4);
 await page.locator('#history').click();await page.locator('#history-search').fill('fotosintez');await expect(page.locator('#history-list li')).toHaveCount(1);await expect(page.locator('#history-list li small')).toContainText('4 ta xabar');
 await page.locator('#history-list .history-delete').click();await expect(page.locator('#history-empty')).toHaveText('Hech narsa topilmadi.');await page.locator('#close-history').click();
 await page.locator('#settings').click();await expect(page.locator('#save-history')).toBeChecked();await page.locator('#close-settings').click();
});
