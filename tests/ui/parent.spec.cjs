const {test,expect,_electron:electron}=require('@playwright/test');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
// Ota-ona nazorati: a parent's PIN locks Settings, API keys and the AI's folders; the main process refuses changes while locked.
async function launch(profile){const app=await electron.launch({args:[path.resolve(__dirname,'../..'),'--qa'],env:{...process.env,NURIMAI_QA_PROFILE:profile},timeout:30000});await expect.poll(()=>app.windows().some(w=>w.url().endsWith('/index.html')),{timeout:20000}).toBeTruthy();const page=app.windows().find(w=>w.url().endsWith('/index.html'));await page.locator('#question').waitFor();return {app,page};}
test('a parent PIN locks Settings after a restart; a wrong PIN is refused, the right one opens them, and the lock holds in the main process',async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-ui-'));
 try{
  let {app,page}=await launch(profile);
  await page.locator('#settings').click();await expect(page.locator('#parent-action')).toHaveText('PIN o‘rnatish');
  await page.locator('#parent-pin').fill('2468');await page.locator('#parent-pin2').fill('1357');await page.locator('#parent-action').click();await expect(page.locator('#settings-error')).toContainText('bir xil emas');
  await page.locator('#parent-pin').fill('12');await page.locator('#parent-pin2').fill('12');await page.locator('#parent-action').click();await expect(page.locator('#settings-error')).toContainText('4–8 ta raqam');
  await page.locator('#parent-pin').fill('2468');await page.locator('#parent-pin2').fill('2468');await page.locator('#parent-action').click();
  await expect(page.locator('#parent-text')).toContainText('daqiqaga ochiq');await expect(page.locator('#parent-lock')).toBeVisible();
  expect(JSON.parse(fs.readFileSync(path.join(profile,'parent-lock.json'),'utf8')).hash).not.toContain('2468');
  await app.close();({app,page}=await launch(profile));
  await page.locator('#settings').click();await expect(page.locator('#parent-text')).toContainText('qulflangan');
  await expect(page.locator('#settings-form button[type=submit]')).toBeDisabled();await expect(page.locator('#topmost')).toBeDisabled();await expect(page.locator('#memory-on')).toBeEnabled();await expect(page.locator('#theme-choice input').first()).toBeEnabled();
  await page.screenshot({path:'test-results/desktop-parent-locked.png'});
  for(const call of ['saveSettings({topmost:true})','folderAdd()','folderRemove(0)'])expect(await page.evaluate(`window.nurim.${call}`)).toMatchObject({ok:false,error:expect.stringContaining('qulflangan')});
  await page.locator('#parent-pin').fill('1111');await page.locator('#parent-action').click();await expect(page.locator('#settings-error')).toContainText('PIN noto‘g‘ri');await expect(page.locator('#topmost')).toBeDisabled();
  await page.locator('#parent-pin').fill('2468');await page.locator('#parent-pin').press('Enter');
  await expect(page.locator('#parent-text')).toContainText('daqiqaga ochiq');await expect(page.locator('#topmost')).toBeEnabled();await expect(page.locator('#settings-form button[type=submit]')).toBeEnabled();
  expect(await page.evaluate('window.nurim.folderAdd()')).toMatchObject({ok:true});
  await page.locator('#parent-lock').click();await expect(page.locator('#topmost')).toBeDisabled();
  await page.locator('#parent-pin').fill('2468');await page.locator('#parent-action').click();await page.locator('#parent-remove').click();
  await expect(page.locator('#parent-action')).toHaveText('PIN o‘rnatish');expect(fs.existsSync(path.join(profile,'parent-lock.json'))).toBe(false);
  await app.close();
 }finally{fs.rmSync(profile,{recursive:true,force:true});}
});
