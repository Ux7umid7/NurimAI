let start=null;let moved=false;
document.getElementById('pet').onpointerdown=event=>{if(event.button!==0)return;start={x:event.screenX,y:event.screenY,offsetX:event.clientX,offsetY:event.clientY};moved=false;event.currentTarget.setPointerCapture(event.pointerId);};
document.getElementById('pet').onpointermove=event=>{if(!start)return;if(Math.hypot(event.screenX-start.x,event.screenY-start.y)>4)moved=true;if(moved)window.nurim.movePet({x:event.screenX-start.offsetX,y:event.screenY-start.offsetY});};
document.getElementById('pet').onpointerup=()=>{if(!start)return;if(!moved)window.nurim.toggle();start=null;};
document.getElementById('pet').onpointercancel=()=>{start=null;};
document.getElementById('pet').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();window.nurim.toggle();}};

// 3D Nur: idle, think and sleep are base moods; happy, wave, sad and catch play once and return to the base mood. Only one video is visible at a time.
const clips=Object.fromEntries(['idle','think','happy','wave','sleep','sad','catch'].map(name=>[name,document.getElementById(name)]));
const ONCE=new Set(['happy','wave','sad','catch']);
const still=document.getElementById('still');
let shown=null,base='idle',latest=0,rest=null;
function show(name){
  const clip=clips[name],ticket=++latest; // moods can arrive faster than play() resolves; only the newest may take over
  clearTimeout(rest);
  if(shown===name&&!clip.paused)return;
  clip.currentTime=0;
  clip.play().then(()=>{if(ticket!==latest)return;for(const [key,video] of Object.entries(clips)){video.classList.toggle('on',key===name);if(key!==name)video.pause();}shown=name;still.hidden=true;}).catch(()=>{if(ticket===latest&&ONCE.has(name))show(base);}); // without video support the still image stays
}
for(const name of ONCE)clips[name].onended=()=>show(base);
// Idle and sleep play once, then Nur rests on the (identical) first frame for a few seconds: a paused video costs almost no CPU.
const pause={idle:[6000,8000],sleep:[3000,6000]};
for(const name of ['idle','sleep'])clips[name].onended=()=>{clearTimeout(rest);rest=setTimeout(()=>{if(base===name&&shown===name)show(name);},pause[name][0]+Math.random()*pause[name][1]);};
document.getElementById('pet').onpointerenter=()=>{if(base==='sleep'){window.nurim.petActive();return;}if(base==='idle'&&shown==='idle'&&clips.idle.paused)show('idle');}; // hovering wakes a sleeping Nur
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
  show('idle');
  window.nurim.onMood(mood=>{
    if(!clips[mood])return;
    if(ONCE.has(mood)){if(mood==='happy'||mood==='sad'||base==='sleep')base='idle';show(mood);return;} // an answer or an error ends the thinking
    base=mood;if(!ONCE.has(shown)||(mood==='think'&&shown!=='catch'))show(mood); // a reaction finishes first, except that thinking cuts in (after a catch)
  });
}
