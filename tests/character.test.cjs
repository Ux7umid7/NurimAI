const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
// The hero picker: Pufak (default) or Nur; each mood picture comes from the hero's own folder, or its main picture when it has none.
function load(stored){const store=new Map(stored?[['nurim.character',stored]]:[]);const ctx={localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))}};ctx.window=ctx;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/shared/character.js'),'utf8'),ctx);return {C:ctx.NurimCharacter,store};}
test('Pufak is the default; a picked hero is kept; unknown names are ignored',()=>{
 const {C,store}=load();assert.equal(C.get(),'pufak');assert.equal(C.set('ustoz'),'ustoz');assert.equal(store.get('nurim.character'),'ustoz');assert.equal(C.get(),'ustoz');
 assert.equal(C.set('dragon'),'ustoz');assert.equal(load('dragon').C.get(),'pufak');assert.deepEqual([C.info().name,C.info('pufak').name],['Nur','Pufak']);
});
test('pictures come from the hero\'s folder, and a mood it has no picture for shows its main one',()=>{
 const {C}=load('ustoz');
 assert.equal(C.src('avatar','../assets/'),'../assets/ustoz/avatar.webp');assert.equal(C.src('think'),'ustoz/ustoz.webp');assert.equal(C.src('hero'),'ustoz/ustoz.webp');
 assert.equal(C.src('think','','pufak'),'pufak/think.webp');assert.equal(C.src('hero','','pufak'),'pufak/pufak.webp');assert.equal(C.src('nonsense','','pufak'),'pufak/pufak.webp');
});
test('every picture a hero lists exists in the desktop assets and in the phone app, and the phone caches them',()=>{
 const {C}=load();const root=path.join(__dirname,'..');const sw=fs.readFileSync(path.join(root,'docs/app/sw.js'),'utf8');
 for(const h of Object.values(C.LIST))for(const m of [...h.moods,'hero']){const rel=C.src(m,'',h.id);assert.ok(fs.existsSync(path.join(root,'assets',rel)),rel);assert.ok(fs.existsSync(path.join(root,'docs/app',rel)),rel);}
 for(const f of ['lib/character.js','ustoz/ustoz.webp','ustoz/avatar.webp'])assert.ok(sw.includes(`'${f}'`),f);
 assert.equal(C.info('pufak').clips,'nur');assert.ok(fs.existsSync(path.join(root,'assets/nur/idle.webm')));
});
