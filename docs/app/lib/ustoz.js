// Ustoz rejimi: Bugun (seriya, takrorlash), Test (AI tuzadi, birma-bir yechiladi), Kartochkalar (Leitner takrorlash), Eslatmalar.
let practiceView=null,quiz=null,study=null;
const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children);return node;};
const MONTH_NAMES=['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
function dayLabel(day){const [y,m,d]=day.split('-').map(Number);const t=new Date();const diff=Math.round((new Date(y,m-1,d)-new Date(t.getFullYear(),t.getMonth(),t.getDate()))/864e5);return diff===0?'bugun':diff===1?'ertaga':`${d}-${MONTH_NAMES[m-1]}`;}
function ustozNote(text){$('ustoz-note').textContent=text||'';}
function showTab(name){for(const b of document.querySelectorAll('.tabs [data-tab]'))b.setAttribute('aria-selected',String(b.dataset.tab===name));for(const s of document.querySelectorAll('#ustoz-dialog .tab'))s.hidden=s.id!==`tab-${name}`;ustozNote('');}
async function refreshPractice(view){practiceView=view||await call(window.nurim.practice());renderPractice();greet();}
function renderPractice(){
  const p=practiceView;
  $('streak-count').textContent=p.streak?`${p.streak} kun ketma-ket`:'Bugun boshlaymiz';
  $('streak-text').textContent=p.today.reviewed||p.today.quizzes?`Bugun: ${p.today.reviewed} ta kartochka, ${p.today.quizzes} ta test`:'Har kuni ozgina mashq qilsangiz, seriya o‘sadi.';
  $('ustoz-sub').textContent=p.streak?`${p.streak} kun ketma-ket · ${p.due} ta takrorlash`:`${p.due} ta takrorlash`;
  if($('streak-week'))$('streak-week').replaceChildren(...streakWeek(p));
  $('due-text').textContent=p.due?`${p.due} ta kartochka sizni kutmoqda.`:p.decks.length?'Bugungi takrorlash tugagan. Barakalla!':'Kartochkalar hali yo‘q. “Kartochkalar” bo‘limida mavzu yozing.';
  $('review-all').disabled=!p.due;$('teacher').checked=p.teacher;
  $('results').replaceChildren(...(p.quizzes.length?[el('p',{className:'eyebrow',textContent:'So‘nggi testlar'}),el('ul',{className:'results'},...p.quizzes.map(q=>el('li',{},el('span',{textContent:q.title}),el('b',{textContent:`${q.score}/${q.total}`}))))]:[]));
  $('decks').replaceChildren(...p.decks.map(d=>el('li',{},
    el('div',{className:'deck-info'},el('strong',{textContent:d.title}),el('small',{textContent:`${d.count} ta · ${d.learned} tasi o‘zlashtirildi${d.due?` · ${d.due} ta takrorlashga`:''}`})),
    el('button',{type:'button',className:d.due?'primary':'',textContent:d.due?'Takrorlash':'✓',disabled:!d.due,title:d.due?'':'Bugun takrorlanadigani qolmadi',onclick:()=>startStudy(d.id)}),
    el('button',{type:'button',className:'history-delete',textContent:'×',title:'O‘chirish',ariaLabel:`“${d.title}” to‘plamini o‘chirish`,onclick:async()=>{if(confirm(`“${d.title}” to‘plami o‘chirilsinmi?`))refreshPractice(await call(window.nurim.practiceDeckDelete(d.id)));}}))));
  if(!p.decks.length)$('decks').append(el('li',{className:'empty'},'Hali to‘plam yo‘q. Mavzu yozing — AI kartochka tuzib beradi.'));
  $('practice-on').checked=p.practiceReminder.on;$('practice-time').value=p.practiceReminder.time;
  $('reminders').replaceChildren(...p.reminders.map(r=>el('li',{},el('div',{className:'deck-info'},el('strong',{textContent:r.text}),el('small',{textContent:`${r.time} · ${r.repeat==='daily'?'har kuni':dayLabel(r.date)}`})),
    el('button',{type:'button',className:'history-delete',textContent:'×',title:'O‘chirish',ariaLabel:`“${r.text}” eslatmasini o‘chirish`,onclick:async()=>refreshPractice(await call(window.nurim.reminderDelete(r.id)))}))));
}
// Shu hafta (Du–Ya): seriya kunlari oltin doira, bugun nurli halqa. Seriya bugun yoki kecha tugaydi.
const WEEK_DAYS=['Du','Se','Ch','Pa','Ju','Sh','Ya'];
function streakWeek(p){
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),monday=new Date(today);monday.setDate(today.getDate()-(today.getDay()+6)%7);
  const end=new Date(today);if(!(p.today.reviewed||p.today.quizzes))end.setDate(end.getDate()-1);const start=new Date(end);start.setDate(end.getDate()-p.streak+1);
  return WEEK_DAYS.map((label,i)=>{const day=new Date(monday);day.setDate(monday.getDate()+i);const done=p.streak>0&&day>=start&&day<=end,isToday=+day===+today;
    const mark=el('span');if(done){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d','M5 12.5l4.2 4.2L19 7');svg.append(path);mark.append(svg);}
    const li=el('li',{className:[done?'done':'',isToday?'today':''].filter(Boolean).join(' ')},mark,label);if(isToday)li.setAttribute('aria-current','date');li.setAttribute('aria-label',`${label}${done?': mashq qilindi':''}`);return li;});
}
async function openUstoz(tab='today'){try{await refreshPractice();if(!quiz)resetQuiz();if(!study)resetStudy();showTab(tab);if(!$('ustoz-dialog').open)$('ustoz-dialog').showModal();}catch(e){notice(e.message);}}
$('ustoz').onclick=()=>openUstoz();$('streak-chip').onclick=()=>openUstoz();$('close-ustoz').onclick=()=>$('ustoz-dialog').close();
for(const b of document.querySelectorAll('.tabs [data-tab]'))b.onclick=()=>showTab(b.dataset.tab);
$('teacher').onchange=async()=>{try{await refreshPractice(await call(window.nurim.practiceOptions({teacher:$('teacher').checked})));ustozNote($('teacher').checked?'Ustoz uslubi yoqildi: endi javoblar o‘rgatuvchi bo‘ladi.':'Ustoz uslubi o‘chirildi.');}catch(e){ustozNote(e.message);}};
$('review-all').onclick=()=>startStudy('');
$('daily-quiz').onclick=()=>{showTab('quiz');resetQuiz();$('quiz-count').value='5';$('quiz-topic').value=practiceView?.quizzes[0]?.title||'';$('quiz-topic').focus();};
async function generate(button,options){
  const label=button.textContent;button.disabled=true;button.textContent='Tuzilmoqda…';ustozNote('NurimAI o‘ylayapti, biroz kuting…');
  try{return await call(window.nurim.practiceGenerate(options));}catch(e){ustozNote(e.message);return null;}finally{button.disabled=false;button.textContent=label;}
}

// --- Test ---
function resetQuiz(){quiz=null;$('quiz-form').hidden=false;$('quiz-run').hidden=true;$('quiz-run').replaceChildren();}
$('quiz-form').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter||$('quiz-form').querySelector('button');
  const result=await generate(button,{kind:'quiz',topic:$('quiz-topic').value.trim(),fromChat:$('quiz-chat').checked,count:Number($('quiz-count').value),level:$('quiz-level').value});
  if(result){ustozNote('');quiz={...result.quiz,i:0,score:0,mistakes:[]};$('quiz-form').hidden=true;$('quiz-run').hidden=false;showQuestion();}
};
function showQuestion(){
  const q=quiz.questions[quiz.i],box=$('quiz-run');
  const explain=el('p',{className:'explain',hidden:true}),next=el('button',{type:'button',className:'primary',hidden:true,textContent:quiz.i+1<quiz.questions.length?'Keyingi →':'Natijani ko‘rish',onclick:()=>{quiz.i++;quiz.i<quiz.questions.length?showQuestion():finishQuiz();}});
  const options=q.options.map((text,i)=>el('button',{type:'button',className:'option',textContent:text,onclick:()=>{
    for(const b of options)b.disabled=true;options[q.answer].classList.add('right');const right=i===q.answer;
    if(right)quiz.score++;else{options[i].classList.add('wrong');quiz.mistakes.push({q:q.q,answer:q.options[q.answer],explain:q.explain});}
    explain.textContent=`${right?'To‘g‘ri! ':'Afsus, to‘g‘ri javob: '+q.options[q.answer]+'. '}${q.explain}`;explain.className=`explain ${right?'good':'bad'}`;explain.hidden=false;next.hidden=false;next.focus();
    window.nurim.practiceMood(right?'happy':'sad');
  }}));
  box.replaceChildren(el('div',{className:'run-head'},el('span',{textContent:quiz.title}),el('b',{textContent:`${quiz.i+1}/${quiz.questions.length}`})),
    el('div',{className:'progress'},el('i',{style:`width:${Math.round(quiz.i/quiz.questions.length*100)}%`})),el('p',{className:'question',textContent:q.q}),el('div',{className:'options'},...options),explain,next);
}
async function finishQuiz(){
  const {score,questions,mistakes}=quiz,total=questions.length,pct=score/total;
  const message=pct===1?'Ajoyib! Hammasi to‘g‘ri 🌟':pct>=0.7?'Zo‘r natija! 👏':pct>=0.4?'Yomon emas, yana bir oz mashq qilamiz 💪':'Hechqisi yo‘q — xatolar ustida ishlaymiz 🌱';
  try{refreshPractice(await call(window.nurim.practiceQuizDone({title:quiz.title,score,total,mistakes})));}catch(e){ustozNote(e.message);}
  $('quiz-run').replaceChildren(el('div',{className:'result'},el('strong',{textContent:`${score}/${total}`}),el('p',{textContent:message}),
    el('small',{textContent:mistakes.length?`${mistakes.length} ta xato “Xatolar ustida ishlash” kartochkalariga qo‘shildi.`:'Xato yo‘q — kartochka kerak bo‘lmadi.'})),
    el('div',{className:'row'},el('button',{type:'button',className:'primary',textContent:'Yangi test',onclick:resetQuiz}),...(mistakes.length?[el('button',{type:'button',textContent:'Xatolarni takrorlash',onclick:()=>{const d=practiceView.decks.find(x=>x.title==='Xatolar ustida ishlash');resetQuiz();startStudy(d?.id||'');}})]:[])));
  quiz=null;
}

// --- Kartochkalar ---
function resetStudy(){study=null;$('study').hidden=true;$('study').replaceChildren();$('cards-form').hidden=false;$('decks').hidden=false;}
$('cards-form').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter||$('cards-form').querySelector('button');
  const result=await generate(button,{kind:'cards',topic:$('cards-topic').value.trim(),fromChat:$('cards-chat').checked,count:Number($('cards-count').value)});
  if(result){await refreshPractice(result.view);$('cards-topic').value='';const d=result.view.decks.find(x=>x.id===result.deck);ustozNote(`“${d?.title}” — ${d?.count} ta kartochka tayyor.`);startStudy(result.deck);}
};
async function startStudy(deckId){
  try{
    const cards=await call(window.nurim.practiceDue(deckId));showTab('cards');
    if(!cards.length){ustozNote('Hozircha takrorlanadigan kartochka yo‘q. Barakalla! ✨');return;}
    study={cards,i:0,done:0};$('cards-form').hidden=true;$('decks').hidden=true;$('study').hidden=false;showCard();
  }catch(e){ustozNote(e.message);}
}
function showCard(){
  const c=study.cards[study.i],back=el('p',{className:'card-back',textContent:c.back,hidden:true});
  const grades=el('div',{className:'grades',hidden:true},...[['again','Bilmadim'],['hard','Qiyin'],['know','Bilardim']].map(([grade,text])=>el('button',{type:'button',className:`grade ${grade}`,textContent:text,onclick:()=>grade_(c,grade)})));
  const reveal=el('button',{type:'button',className:'primary',textContent:'Javobni ko‘rsatish',onclick:()=>{back.hidden=false;grades.hidden=false;reveal.hidden=true;grades.querySelector('.know').focus();}});
  $('study').replaceChildren(el('div',{className:'run-head'},el('span',{textContent:c.deckTitle}),el('b',{textContent:`${study.i+1}/${study.cards.length}`})),
    el('div',{className:'progress'},el('i',{style:`width:${Math.round(study.i/study.cards.length*100)}%`})),
    el('div',{className:'flashcard'},el('p',{className:'card-front',textContent:c.front}),back),reveal,grades,
    el('button',{type:'button',className:'link',textContent:'To‘xtatish',onclick:()=>{resetStudy();renderPractice();}}));
}
async function grade_(card,grade){
  try{practiceView=await call(window.nurim.practiceReview(card.deck,card.id,grade));}catch(e){ustozNote(e.message);return;}
  if(grade==='again')study.cards.push(card); // bilmagan kartochka shu mashq oxirida yana chiqadi
  else study.done++;
  study.i++;
  if(study.i<study.cards.length)return showCard();
  const done=study.done;resetStudy();renderPractice();greet();window.nurim.practiceMood('happy');
  ustozNote(`Takrorlash tugadi: ${done} ta kartochka. ${practiceView.streak?`🔥 ${practiceView.streak} kun ketma-ket!`:''}`);
}

// --- Eslatmalar ---
$('practice-on').onchange=$('practice-time').onchange=async()=>{try{refreshPractice(await call(window.nurim.practiceOptions({practiceReminder:{on:$('practice-on').checked,time:$('practice-time').value||'19:00'}})));ustozNote($('practice-on').checked?`Har kuni ${$('practice-time').value} da eslataman.`:'Kunlik eslatma o‘chirildi.');}catch(e){ustozNote(e.message);}};
$('remind-form').onsubmit=async event=>{event.preventDefault();try{refreshPractice(await call(window.nurim.reminderAdd({text:$('remind-text').value,time:$('remind-time').value,repeat:$('remind-repeat').value})));ustozNote(`Eslatma qo‘shildi: ${$('remind-time').value}.`);$('remind-text').value='';}catch(e){ustozNote(e.message);}};
window.nurim.onPanel(name=>{if(name==='ustoz')openUstoz();});
window.nurim.onReminder(r=>{notice(`⏰ ${r.text}`);if(r.kind==='practice')greet();});
