const test=require('node:test');const assert=require('node:assert/strict');
const {fresh,feedItems,clean,normalize,rateLine,weatherLine}=require('../src/web.cjs');const {Router,body,withSources}=require('../src/router.cjs');const {defaults}=require('../src/store.cjs');
// A fake internet: two news sites, a sport site, the Central Bank and Open-Meteo; everything else is down.
const rss=items=>`<?xml version="1.0"?><rss><channel><title>Feed</title>${items.map(([title,link,description,date])=>`<item><title>${title}</title><link>${link}</link><description>${description}</description><pubDate>${date}</pubDate></item>`).join('')}</channel></rss>`;
const SITES={
 'kun.uz':rss([['Hitlerning Bavariya toğlaridagi uyi yonib ketdi.','https://kun.uz/news/1','<![CDATA[Politsiya bir kişini qölga olgan.]]>.','Sun, 25 Oct 2026 10:32:17 +0500'],['Eski xabar','https://kun.uz/news/0','','Sat, 24 Oct 2026 08:00:00 +0500']]),
 'www.gazeta.uz':rss([['Toshkentdagi Elbek bog‘i rekonstruksiya qilinmoqda','https://www.gazeta.uz/oz/park/?a=1&amp;b="2"','<![CDATA[Bog‘&nbsp;to‘liq yangilanadi.]]>','Sun, 25 Oct 2026 04:41:00 GMT'],['Reklama','http://insecure.example/x','','Sun, 25 Oct 2026 04:00:00 GMT']]),
 'sports.uz':rss([['Реал Мадрид Барселонани 2:1 ҳисобида енгди','https://sports.uz/news/view/real','Эль-класико','Sun, 25 Oct 2026 01:00:00 GMT']]),
 'cbu.uz':JSON.stringify([{Ccy:'USD',CcyNm_UZ:'AQSH dollari',Nominal:'1',Rate:'11838.92',Diff:'-64.23',Date:'24.10.2026'},{Ccy:'EUR',CcyNm_UZ:'EVRO',Nominal:'1',Rate:'13248.94',Diff:'-80.21',Date:'24.10.2026'},{Ccy:'JPY',Nominal:'1',Rate:'80.1',Date:'24.10.2026'}]),
 'api.open-meteo.com':JSON.stringify({current:{time:'2026-10-25T10:45',temperature_2m:17.2,apparent_temperature:14.4,weather_code:0,wind_speed_10m:4.1},daily:{time:['2026-10-25','2026-10-26','2026-10-27'],weather_code:[3,61,0],temperature_2m_max:[21,18,20],temperature_2m_min:[7,9,8],precipitation_probability_max:[0,70,5]}}),
};
function internet(){const calls=[];const fetcher=async(url,options={})=>{calls.push(String(url));const host=new URL(url).hostname;
 if(host==='generativelanguage.googleapis.com')return Response.json({candidates:[{content:{parts:[{text:'Javob'}]},finishReason:'STOP'}]});
 return SITES[host]?new Response(SITES[host],{status:200}):new Response('down',{status:503});};
 return {calls,fetcher,sites:()=>calls.filter(u=>!u.includes('generativelanguage'))};}
const NOW=Date.parse('2026-10-25T06:00:00Z');

test('feeds are read safely: CDATA, entities and tags become plain text, only https links are kept',()=>{
 const items=feedItems(SITES['www.gazeta.uz'],{name:'Gazeta.uz'});
 assert.equal(items.length,1);assert.deepEqual(items[0],{source:'Gazeta.uz',title:'Toshkentdagi Elbek bog‘i rekonstruksiya qilinmoqda',text:'Bog‘ to‘liq yangilanadi',link:'https://www.gazeta.uz/oz/park/?a=1&b="2"',time:Date.parse('Sun, 25 Oct 2026 04:41:00 GMT')});
 assert.equal(clean('<p>a &amp; b&#39;s &lt;i&gt;x&lt;/i&gt; &#x41;&#0;</p>'),"a & b's x A");
 assert.equal(normalize('Ўзбекистон Қоғоз ҳа toğ öt'),'ozbekiston qogoz ha tog ot');
});
test('bank rates and the forecast become one readable line each',()=>{
 assert.equal(rateLine(JSON.parse(SITES['cbu.uz'])),'Markaziy bankning rasmiy kursi (24.10.2026 dan): 1 USD (AQSH dollari) = 11838.92 so‘m, o‘zgarish -64.23; 1 EUR (EVRO) = 13248.94 so‘m, o‘zgarish -80.21.');
 assert.equal(rateLine([]),null);assert.equal(weatherLine({},'Toshkent'),null);
 assert.match(weatherLine(JSON.parse(SITES['api.open-meteo.com']),'Samarqand'),/^Ob-havo, Samarqand \(Open-Meteo, 2026-10-25 10:45\): hozir 17°C \(his qilinishi 14°C\), ochiq osmon, shamol 4 km\/soat\. bugun \(2026-10-25\): 7…21°C, bulutli, yog‘ingarchilik ehtimoli 0%; ertaga \(2026-10-26\): 9…18°C, yomg‘ir, yog‘ingarchilik ehtimoli 70%/);
});
test('general news: the newest from each site, dated in Tashkent time, with the sites as sources',async()=>{
 const net=internet();const web=await fresh('Bugungi yangiliklar qanday?',{fetcher:net.fetcher,now:()=>NOW});
 assert.equal(web.file.kind,'text');assert.equal(web.file.name,'Internetdan olingan ma’lumot (25.10.2026 11:00, Toshkent vaqti)');
 assert.equal(web.file.text,['Yangiliklar (Kun.uz, Gazeta.uz):','- [Kun.uz, 25.10 10:32] Hitlerning Bavariya toğlaridagi uyi yonib ketdi. — Politsiya bir kişini qölga olgan','- [Gazeta.uz, 25.10 09:41] Toshkentdagi Elbek bog‘i rekonstruksiya qilinmoqda — Bog‘ to‘liq yangilanadi','- [Kun.uz, 24.10 08:00] Eski xabar'].join('\n'));
 assert.deepEqual(web.sources,[{title:'Kun.uz',uri:'https://kun.uz/'},{title:'Gazeta.uz',uri:'https://www.gazeta.uz/oz/'}]);assert.deepEqual(web.queries,[]);
 assert.ok(!net.calls.some(u=>/cbu|open-meteo/.test(u)),'news only');
});
test('a topic is found across sites and scripts (Latin question, Cyrillic headline); a missing one is said plainly',async()=>{
 const net=internet();
 const real=await fresh('Real Madrid kim yutdi?',{fetcher:net.fetcher,now:()=>NOW});
 assert.match(real.file.text,/^Yangiliklar \(Sports\.uz\):\n- \[Sports\.uz, 25\.10 06:00\] Реал Мадрид Барселонани 2:1/);assert.deepEqual(real.sources,[{title:'Sports.uz: Реал Мадрид Барселонани 2:1 ҳисобида енгди',uri:'https://sports.uz/news/view/real'}]);assert.deepEqual(real.queries,['real madrid']);
 const park=await fresh('Elbek bog‘i haqida yangilik bormi?',{fetcher:net.fetcher,now:()=>NOW});assert.equal(park.sources[0].uri,'https://www.gazeta.uz/oz/park/?a=1&b="2"');
 const none=await fresh('Arsenal o‘yini hisobi qanday?',{fetcher:net.fetcher,now:()=>NOW});
 assert.match(none.file.text,/^«arsenal» haqida bu saytlarda alohida xabar topilmadi; quyida eng so‘nggi umumiy yangiliklar\.\nYangiliklar \(Sports\.uz\):/);assert.deepEqual(none.queries,['arsenal']);
});
test('rates and weather read only their own source; the city is taken from the question',async()=>{
 const net=internet();const rates=await fresh('Dollar kursi qancha?',{fetcher:net.fetcher,now:()=>NOW});
 assert.match(rates.file.text,/^Markaziy bankning rasmiy kursi/);assert.deepEqual(rates.sources,[{title:'Markaziy bank',uri:'https://cbu.uz/uz/arkhiv-kursov-valyut/'}]);assert.deepEqual(net.sites(),['https://cbu.uz/uz/arkhiv-kursov-valyut/json/']);
 net.calls.length=0;const sky=await fresh('Samarqandda ob-havo qanday?',{fetcher:net.fetcher,now:()=>NOW});
 assert.match(sky.file.text,/^Ob-havo, Samarqand/);assert.equal(net.sites().length,1);assert.match(net.sites()[0],/latitude=39\.6542&longitude=66\.9597/);
 net.calls.length=0;await fresh('Ob-havo qanday?',{fetcher:net.fetcher,now:()=>NOW});assert.match(net.sites()[0],/latitude=41\.3111/);
});
test('sources are kept for ten minutes (a failed one for two), and a dead internet gives nothing instead of an error',async()=>{
 const net=internet();const cache=new Map();let now=NOW;
 await fresh('Bugungi yangiliklar',{fetcher:net.fetcher,now:()=>now,cache});const first=net.calls.length;assert.equal(first,7);
 await fresh('Bugungi yangiliklar',{fetcher:net.fetcher,now:()=>now,cache});assert.equal(net.calls.length,first,'a failed site waits two minutes');
 now+=11*60000;await fresh('Bugungi yangiliklar',{fetcher:net.fetcher,now:()=>now,cache});assert.equal(net.calls.length,first+7);
 assert.equal(await fresh('Bugungi yangiliklar',{fetcher:async()=>{throw new Error('offline');},now:()=>NOW}),null);
 const stop=new AbortController();stop.abort();await assert.rejects(fresh('Bugungi yangiliklar',{fetcher:net.fetcher,signal:stop.signal}),{name:'AbortError'});
});
test('the router gives the fresh facts to the AI as a text attachment and returns their sources',async()=>{
 const settings={...defaults(),keys:{Gemini:'test-gemini',Groq:'test-groq',OpenRouter:''},free:{Gemini:true,Groq:true}};
 const net=internet();const sent=[];const router=new Router({now:()=>NOW,fetcher:async(url,o)=>{if(String(url).includes('generativelanguage'))sent.push(JSON.parse(o.body));return net.fetcher(url,o);}});
 const reply=await router.ask(settings,[],'Bugungi yangiliklar');const prompt=sent[0].contents.at(-1).parts.at(-1).text;
 assert.match(prompt,/^Biriktirilgan fayl: Internetdan olingan ma’lumot \(25\.10\.2026 11:00, Toshkent vaqti\)\n"""\nYangiliklar \(Kun\.uz, Gazeta\.uz\):/);assert.ok(prompt.endsWith('"""\n\nBugungi yangiliklar'));
 assert.equal('tools' in sent[0],false);assert.match(sent[0].systemInstruction.parts[0].text,/Internetdan olingan ma’lumot/);
 assert.deepEqual(reply.sources.map(s=>s.title),['Kun.uz','Gazeta.uz']);assert.equal(withSources(reply),'Javob\n\n🔎 Manbalar: Kun.uz · Gazeta.uz');
 net.calls.length=0;const plain=await router.ask(settings,[],'Bugungi yangiliklar',undefined,[],{search:false});assert.deepEqual(net.sites(),[]);assert.deepEqual(plain.sources,[]);assert.equal(withSources(plain),'Javob');
 net.calls.length=0;await router.ask(settings,[],'Kasr nima?');assert.deepEqual(net.sites(),[]);
 // Text-only fallbacks get the same facts.
 assert.match(body('Groq',[],'Savol',[{kind:'text',name:'Internetdan olingan ma’lumot',text:'Yangilik'}]).messages.at(-1).content,/Internetdan olingan ma’lumot\n"""\nYangilik\n"""\n\nSavol$/);
});
