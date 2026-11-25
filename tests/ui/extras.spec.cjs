const {test,expect,_electron:electron}=require('@playwright/test');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
// 👍/👎 under answers, and Settings showing what the document search has read in the chosen folders.
test('an answer is rated once with 👍 or 👎, and Settings shows the documents read in a chosen folder',async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-ui-'));
 const app=await electron.launch({args:[path.resolve(__dirname,'../..'),'--qa'],env:{...process.env,NURIMAI_QA_PROFILE:profile},timeout:30000});
 try{
  await expect.poll(()=>app.windows().some(w=>w.url().endsWith('/index.html')),{timeout:20000}).toBeTruthy();const page=app.windows().find(w=>w.url().endsWith('/index.html'));await page.locator('#question').waitFor();
  await page.locator('#question').fill('Kasr nima?');await page.locator('#send').click();
  const answer=page.locator('.bubble.assistant').last();await expect(answer).toContainText('Jonli AI emas');
  const [up,down]=[answer.locator('.rate').first(),answer.locator('.rate').last()];await expect(up).toHaveText('👍');await expect(down).toHaveText('👎');
  await up.click();await expect(up).toHaveClass(/chosen/);await expect(up).toBeDisabled();await expect(down).toBeDisabled();
  await page.screenshot({path:'test-results/desktop-rate.png'});
  await page.locator('#settings').click();await expect(page.locator('#docs-index')).toBeHidden();
  await page.locator('#folder-add').click();await expect(page.locator('#docs-index')).toContainText('1 ta hujjat o‘qilgan');await expect(page.locator('#docs-reindex')).toBeVisible();
  await page.locator('#docs-reindex').click();await expect(page.locator('#docs-index')).toContainText('1 ta hujjat o‘qilgan');
 }finally{await app.close();fs.rmSync(profile,{recursive:true,force:true});}
});
