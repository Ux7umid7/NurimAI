const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Practice,parseQuiz,parseCards,quizPrompt,cardsPrompt,sample,dayOf,MISTAKES}=require('../src/practice.cjs');const {UserError}=require('../src/router.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'nurim-practice-'));
const at=(d,h=12,m=0)=>new Date(2026,9,d,h,m); // 2026-10-<d> local time
test('quiz and card JSON is read from fences or surrounding prose, and bad items are dropped',()=>{
 const quiz=parseQuiz('Mana test:\n```json\n{"title":"Kasrlar","questions":[{"q":"1/2 + 1/2?","options":["1","2"," 0 ","1/4"],"answer":0,"explain":"Ikki yarim butun bo‘ladi."},{"q":"bad","options":["a"],"answer":0},{"q":"x","options":["a","b"],"answer":5}]}\n```');
 assert.equal(quiz.title,'Kasrlar');assert.equal(quiz.questions.length,1);assert.deepEqual(quiz.questions[0].options,['1','2','0','1/4']);
 assert.equal(parseQuiz(sample('quiz',3)).questions.length,3);assert.equal(parseCards(sample('cards',3)).cards.length,3);
 assert.equal(parseCards('Kartochkalar: {"title":"Hayvonlar","cards":[{"front":"cat","back":"mushuk"},{"front":"","back":"x"}]} tayyor').cards.length,1);
 assert.throws(()=>parseQuiz('Kechirasiz, tushunmadim.'),UserError);assert.throws(()=>parseQuiz('{"questions":[]}'),/to‘g‘ri tuzmadi/);assert.throws(()=>parseCards('{"cards":[{"front":"a"}]}'),UserError);
});
test('prompts ask for strict JSON with the chosen size, level and source',()=>{
 const q=quizPrompt({topic:'Kasrlar',count:10,level:'qiyin',fromChat:false});assert.match(q,/Mavzu: Kasrlar/);assert.match(q,/10 ta test/);assert.match(q,/qiyin/);assert.match(q,/Faqat JSON/);
 assert.match(quizPrompt({count:5,fromChat:true}),/suhbat va biriktirilgan fayllar asosida/);assert.match(cardsPrompt({topic:'Hayvonlar',count:15}),/15 ta kartochka/);
});
test('Leitner review: know doubles the gap, hard repeats tomorrow, again comes back today',()=>{
 const p=new Practice(temp());const deck=p.addDeck('Ingliz',[{front:'cat',back:'mushuk'},{front:'dog',back:'it'},{front:'cat',back:'dup'}],at(1));
 assert.equal(deck.cards.length,2);assert.equal(p.due(at(1)).length,2);
 const [cat,dog]=deck.cards;p.review(deck.id,cat.id,'know',at(1));assert.equal(cat.box,1);assert.equal(cat.due,'2026-10-02');
 p.review(deck.id,dog.id,'again',at(1));assert.equal(dog.box,0);assert.equal(dog.due,'2026-10-01');p.review(deck.id,dog.id,'hard',at(1));assert.equal(dog.due,'2026-10-02');
 p.review(deck.id,cat.id,'know',at(2));assert.equal(cat.box,2);assert.equal(cat.due,'2026-10-04');assert.equal(p.view(at(2)).due,1);
 assert.throws(()=>p.review(deck.id,'nope','know'),UserError);assert.throws(()=>p.review(deck.id,cat.id,'maybe'),UserError);
});
test('streak grows on consecutive days, survives until the next day, resets after a gap',()=>{
 const p=new Practice(temp());const deck=p.addDeck('D',[{front:'a',back:'b'}],at(1));const card=deck.cards[0];
 p.review(deck.id,card.id,'again',at(1));assert.equal(p.streak(at(1)),1);p.review(deck.id,card.id,'again',at(2));assert.equal(p.streak(at(2)),2);
 assert.equal(p.streak(at(3)),2);assert.equal(p.streak(at(4)),0);p.review(deck.id,card.id,'again',at(5));assert.equal(p.streak(at(5)),1);
 assert.deepEqual(p.view(at(5)).today,{reviewed:1,quizzes:0});
});
test('finished quizzes are kept and mistakes become cards in one deck without duplicates',()=>{
 const p=new Practice(temp());const mistake={q:'2+2?',answer:'4',explain:'Ikki ikki to‘rt.'};
 p.finishQuiz({title:'Matematika',score:1,total:2,mistakes:[mistake]},at(1));p.finishQuiz({title:'Matematika',score:1,total:2,mistakes:[mistake]},at(1));
 const deck=p.state.decks.find(d=>d.title===MISTAKES);assert.equal(deck.cards.length,1);assert.equal(deck.cards[0].back,'4 — Ikki ikki to‘rt.');
 assert.deepEqual(p.view(at(1)).quizzes[0],{title:'Matematika',date:'2026-10-01',score:1,total:2});assert.equal(p.view(at(1)).today.quizzes,2);
 assert.throws(()=>p.finishQuiz({title:'x',score:3,total:2}),UserError);
});
test('reminders fire once at their time, a late app still shows them within 3 hours, one-off ones disappear',()=>{
 const p=new Practice(temp());p.addReminder({text:'Uy vazifasi',time:'18:00',repeat:'once'},at(1,9));p.addReminder({text:'Kitob o‘qish',time:'20:00',repeat:'daily'},at(1,9));
 assert.equal(p.state.reminders[0].date,'2026-10-01');assert.deepEqual(p.dueReminders(at(1,17,59)),[]);
 assert.deepEqual(p.dueReminders(at(1,18,0)).map(r=>r.text),['Uy vazifasi']);assert.equal(p.state.reminders.length,1);assert.deepEqual(p.dueReminders(at(1,18,1)),[]);
 assert.deepEqual(p.dueReminders(at(1,22,30)).map(r=>r.text),['Kitob o‘qish']);assert.deepEqual(p.dueReminders(at(1,23)),[]);assert.deepEqual(p.dueReminders(at(2,23,30)),[]); // 3.5 soat kech: o'tkazib yuboriladi
 p.addReminder({text:'Erta',time:'08:00',repeat:'once'},at(3,9));assert.equal(p.state.reminders.find(r=>r.text==='Erta').date,'2026-10-04'); // vaqti o'tgan: ertaga
 assert.throws(()=>p.addReminder({text:'',time:'10:00'}),/matnini/);assert.throws(()=>p.addReminder({text:'x',time:'25:00'}),/SS:DD/);
});
test('daily practice reminder tells how many cards wait and the streak',()=>{
 const p=new Practice(temp());const deck=p.addDeck('D',[{front:'a',back:'b'},{front:'c',back:'d'}],at(1));p.review(deck.id,deck.cards[0].id,'hard',at(1));
 p.setOptions({practiceReminder:{on:true,time:'19:00'}});const [r]=p.dueReminders(at(1,19,5));assert.equal(r.kind,'practice');assert.match(r.text,/1 ta kartochka/);assert.match(r.text,/🔥 1 kun/);
 assert.deepEqual(p.dueReminders(at(1,19,30)),[]);assert.throws(()=>p.setOptions({practiceReminder:{on:true,time:'7pm'}}),UserError);
});
test('practice data survives a restart, drops invalid entries and reports a broken file',()=>{
 const dir=temp();try{
  const p=new Practice(dir);p.addDeck('Saqlanadi',[{front:'a',back:'b'}]);p.setOptions({teacher:true});p.addReminder({text:'R',time:'10:00',repeat:'daily'});
  const raw=JSON.parse(fs.readFileSync(p.file,'utf8'));raw.decks.push({id:5,title:'bad'});raw.reminders.push({id:'x',text:'t',time:'99:99',repeat:'daily'});fs.writeFileSync(p.file,JSON.stringify(raw));
  const again=new Practice(dir);again.load();assert.equal(again.state.decks.length,1);assert.equal(again.state.decks[0].cards.length,1);assert.equal(again.state.teacher,true);assert.equal(again.state.reminders.length,1);
  fs.writeFileSync(p.file,'{oops');const broken=new Practice(dir);broken.load();assert.deepEqual(broken.state.decks,[]);assert.match(broken.warning,/o‘qib bo‘lmadi/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 assert.equal(dayOf(at(9)),'2026-10-09');
});
