const {test,expect,_electron:electron}=require('@playwright/test');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
// First run: the app asks how to work - free through the NurimAI server, or with the user's own key.
async function launch(profile){const app=await electron.launch({args:[path.resolve(__dirname,'../..'),'--qa'],env:{...process.env,NURIMAI_QA_PROFILE:profile,NURIMAI_QA_ONBOARD:'1'},timeout:30000});await expect.poll(()=>app.windows().some(w=>w.url().endsWith('/index.html')),{timeout:20000}).toBeTruthy();const page=app.windows().find(w=>w.url().endsWith('/index.html'));await page.locator('#question').waitFor();return {app,page};}
test('first run: free is the default; an own key is checked, saved encrypted and turns on own keys; the choice is asked once',async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-ui-'));
 try{
  let {app,page}=await launch(profile);
  await expect(page.locator('#onboard-dialog')).toBeVisible();await expect(page.locator('#onboard-go')).toHaveText('Bepul boshlash');await expect(page.locator('#own-key')).toBeHidden();
  await page.screenshot({path:'test-results/desktop-onboard.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#onboard-dialog')).toBeVisible(); // a choice is needed
  await page.locator('.choice:has(input[value=own])').click();await expect(page.locator('#own-key')).toBeVisible();await expect(page.locator('#onboard-go')).toHaveText('Saqlash va boshlash');
  await page.locator('#onboard-go').click();await expect(page.locator('#onboard-error')).toContainText('API kalitini kiriting');
  await page.locator('#own-provider').selectOption('Claude');await expect(page.locator('#own-free-row')).toBeHidden();await page.locator('#own-key-input').fill('sk-proj-wrong');await page.locator('#onboard-go').click();await expect(page.locator('#onboard-error')).toContainText('sk-ant-');
  await page.locator('#own-provider').selectOption('Gemini');await expect(page.locator('#own-free-row')).toBeVisible();await page.locator('#own-key-input').fill('AIza-test-key');
  await page.screenshot({path:'test-results/desktop-onboard-own.png'});
  await page.locator('#onboard-go').click();await expect(page.locator('#onboard-dialog')).toBeHidden();await expect(page.locator('#notice')).toContainText('Gemini kaliti saqlandi');
  const saved=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));expect(saved.onboarded).toBe(true);expect(saved.usePersonalKeys).toBe(true);expect(saved.free.Gemini).toBe(true);expect(typeof saved.encryptedKeys.Gemini).toBe('string');expect(JSON.stringify(saved)).not.toContain('AIza-test-key');
  await app.close();({app,page}=await launch(profile));await page.waitForTimeout(500);await expect(page.locator('#onboard-dialog')).toBeHidden();await app.close();
 }finally{fs.rmSync(profile,{recursive:true,force:true});}
});
test('first run: "Bepul" keeps the free server and is not asked again',async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-ui-'));
 try{
  let {app,page}=await launch(profile);await page.locator('#onboard-go').click();await expect(page.locator('#onboard-dialog')).toBeHidden();await expect(page.locator('#notice')).toContainText('Bepul rejim');
  const saved=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));expect(saved.onboarded).toBe(true);expect(saved.usePersonalKeys).toBe(false);
  await app.close();({app,page}=await launch(profile));await page.waitForTimeout(500);await expect(page.locator('#onboard-dialog')).toBeHidden();await app.close();
 }finally{fs.rmSync(profile,{recursive:true,force:true});}
});
