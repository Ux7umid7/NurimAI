const {test,expect,_electron:electron}=require('@playwright/test');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
let app,page,profile;
test.beforeAll(async()=>{profile=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-ui-'));app=await electron.launch({args:[path.resolve(__dirname,'../..'),'--qa'],env:{...process.env,NURIMAI_QA_PROFILE:profile},timeout:30000});await expect.poll(()=>app.windows().some(w=>w.url().endsWith('/index.html')),{timeout:20000}).toBeTruthy();page=app.windows().find(w=>w.url().endsWith('/index.html'));await page.locator('#question').waitFor();});
test.afterAll(async()=>{await app?.close();if(profile)fs.rmSync(profile,{recursive:true,force:true});});
test('welcome, send, copy, reset and settings work without an API key',async()=>{
 await expect(page.locator('.brand strong')).toHaveText('NurimAI');await page.locator('#question').fill('Kasr nima?');await page.locator('#send').click();await expect(page.locator('.bubble.assistant p')).toContainText('Jonli AI emas');await page.locator('.bubble.assistant button').click();await expect(page.locator('.bubble.assistant button')).toHaveText('Olindi ✓');
 await page.locator('#settings').click();await expect(page.locator('#settings-dialog')).toBeVisible();await expect(page.locator('#version')).toContainText('0.3.0');await page.locator('#topmost').uncheck();await page.locator('#settings-form button[type=submit]').click();await expect(page.locator('#settings-dialog')).not.toBeVisible();await page.locator('#new').click();await expect(page.locator('#welcome')).toBeVisible();await page.screenshot({path:'test-results/welcome.png'});
});
test('renderer has no Node access and AI markup remains inert text',async()=>{
 expect(await page.evaluate(()=>typeof require)).toBe('undefined');await page.locator('#question').fill('<img src=x onerror="window.hacked=true">');await page.locator('#send').click();await expect(page.locator('.bubble.user p')).toContainText('<img');expect(await page.evaluate(()=>window.hacked)).toBeUndefined();expect(await page.locator('.bubble.user img').count()).toBe(0);
});
test('settings masks keys and shows honest update status',async()=>{
 await page.locator('#settings').click();await page.locator('summary').click();await expect(page.locator('#key-Gemini')).toHaveAttribute('type','password');await expect(page.locator('#key-Groq')).toHaveAttribute('type','password');await page.locator('#check-update').click();await expect(page.locator('#update-status')).toContainText('Dasturchi rejimi');await page.screenshot({path:'test-results/settings.png'});await page.locator('#close-settings').click();
});
