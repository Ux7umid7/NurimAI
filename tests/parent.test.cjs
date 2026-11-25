const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
// Ota-ona nazorati (src/parent-lock.cjs): the PIN is kept only as a salted scrypt hash, opens Settings for ten minutes,
// and five wrong tries make the next one wait a minute.
const {ParentLock,OPEN_MS}=require('../src/parent-lock.cjs');
test('no PIN: Settings are open; with a PIN they lock, open for ten minutes with it, and five wrong tries mean a wait',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nurim-pin-')),file=path.join(dir,'parent-lock.json');let now=1000;
 const lock=new ParentLock({file,now:()=>now});assert.deepEqual(lock.status(),{enabled:false,open:true,minutes:0,waitSeconds:0});lock.check();
 assert.throws(()=>lock.set('12a4','12a4'),/4–8 ta raqam/);assert.throws(()=>lock.set('1234','1243'),/bir xil emas/);
 lock.set('1234','1234');const saved=fs.readFileSync(file,'utf8');assert.doesNotMatch(saved,/1234/);assert.equal(lock.status().open,true,'just set: open');
 const again=new ParentLock({file,now:()=>now});assert.equal(again.enabled,true);assert.throws(()=>again.check(),/qulflangan/,'a new launch starts locked');
 assert.throws(()=>again.set('9999','9999'),/qulflangan/,'a child cannot set a new PIN');assert.throws(()=>again.remove(),/qulflangan/);
 for(let i=0;i<4;i++)assert.throws(()=>again.unlock('0000'),/PIN noto‘g‘ri/);
 assert.throws(()=>again.unlock('0000'),/PIN noto‘g‘ri/);assert.throws(()=>again.unlock('1234'),/soniyadan keyin/,'after five wrong tries even the right PIN waits');
 now+=61000;assert.equal(again.unlock('1234').open,true);again.check();assert.equal(again.status().minutes,10);
 now+=OPEN_MS+1;assert.throws(()=>again.check(),/qulflangan/,'ten minutes later it locks again');
 again.unlock('1234');again.lock();assert.equal(again.status().open,false);
 again.unlock('1234');again.set('5678','5678');assert.throws(()=>new ParentLock({file,now:()=>now}).unlock('1234'),/noto‘g‘ri/);
 again.remove();assert.equal(fs.existsSync(file),false);assert.equal(new ParentLock({file,now:()=>now}).enabled,false);
 fs.writeFileSync(file,'{broken');assert.equal(new ParentLock({file,now:()=>now}).enabled,false,'a broken file is no PIN (an adult removes it the same way)');
 fs.rmSync(dir,{recursive:true,force:true});
});
