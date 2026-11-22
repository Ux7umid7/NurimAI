const test=require('node:test');const assert=require('node:assert/strict');
// The answer comes in the question's language: Russian and English questions get a note for the AI (the eval showed a
// Russian question answered in Uzbek); Uzbek in Latin or Cyrillic letters stays Uzbek.
const P=require('../src/shared/prompt.js');const {Router}=require('../src/router.cjs');const {defaults}=require('../src/store.cjs');
test('the language of the answer follows the question; Uzbek in either alphabet stays Uzbek',()=>{
 for(const [q,lang] of [['Привет! Что такое фотосинтез? Ответь коротко','ru'],['Почему небо голубое?','ru'],['What is photosynthesis? Please answer briefly','en'],['How do I solve this equation?','en'],
  ['Фотосинтез нима? Тушунтириб беринг',null],['Салом, қандай ёрдам берасан?',null],['Fotosintez nima?',null],["'Book' so'zini o'zbekchaga tarjima qil",null],["'I goes to school' gapidagi xatoni tuzat",null],['2+2',null],['Ok',null],['Salom!',null]])
  assert.equal(P.replyLanguage(q),lang,q);
 assert.equal(P.withLanguage('Savol','Fotosintez nima?'),'Savol');assert.equal(P.withLanguage('Почему небо голубое?'),'Почему небо голубое?\n\n(Ответь на русском языке.)');
 assert.match(P.INSTRUCTION,/ruscha savolga — ruscha, inglizcha savolga — inglizcha/);
});
test('the router adds the note after memory and help notes, and decides it from the user\'s own words',async()=>{
 const sent=[];const router=new Router({fetcher:async(_u,o)=>{sent.push(JSON.parse(o.body).contents.at(-1).parts.at(-1).text);return Response.json({candidates:[{content:{parts:[{text:'Ответ'}]},finishReason:'STOP'}]});}});
 const settings={...defaults(),keys:{Gemini:'g',Groq:'',OpenRouter:''},free:{Gemini:true}};
 await router.ask(settings,[],'Что такое дробь?',undefined,[],{memory:['8-sinf']});assert.ok(sent[0].endsWith('(Ответь на русском языке.)'));assert.match(sent[0],/8-sinf/);
 await router.ask(settings,[],'Kasr nima?');assert.equal(sent[1],'Kasr nima?');
});
