let start=null;let moved=false;
document.getElementById('pet').onpointerdown=event=>{if(event.button!==0)return;start={x:event.screenX,y:event.screenY,offsetX:event.clientX,offsetY:event.clientY};moved=false;event.currentTarget.setPointerCapture(event.pointerId);};
document.getElementById('pet').onpointermove=event=>{if(!start)return;if(Math.hypot(event.screenX-start.x,event.screenY-start.y)>4)moved=true;if(moved)window.nurim.movePet({x:event.screenX-start.offsetX,y:event.screenY-start.offsetY});};
document.getElementById('pet').onpointerup=()=>{if(!start)return;if(!moved)window.nurim.toggle();start=null;};
document.getElementById('pet').onpointercancel=()=>{start=null;};
document.getElementById('pet').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();window.nurim.toggle();}};

// 3D Nur: idle and think loop, happy plays once and returns to the looping mood. Only one video is visible at a time.
const clips={idle:document.getElementById('idle'),think:document.getElementById('think'),happy:document.getElementById('happy')};
const still=document.getElementById('still');
let shown=null,base='idle',latest=0;
function show(name){
  const clip=clips[name],ticket=++latest; // moods can arrive faster than play() resolves; only the newest may take over
  if(shown===name&&!clip.paused)return;
  clip.currentTime=0;
  clip.play().then(()=>{if(ticket!==latest)return;for(const [key,video] of Object.entries(clips)){video.classList.toggle('on',key===name);if(key!==name)video.pause();}shown=name;still.hidden=true;}).catch(()=>{}); // without video support the still image stays
}
clips.happy.onended=()=>show(base);
// Idle plays once, then Nur rests on the (identical) first frame for a few seconds: a paused video costs almost no CPU.
let rest=null;
clips.idle.onended=()=>{clearTimeout(rest);rest=setTimeout(()=>{if(base==='idle'&&shown==='idle')show('idle');},6000+Math.random()*8000);};
document.getElementById('pet').onpointerenter=()=>{if(base==='idle'&&shown==='idle'&&clips.idle.paused){clearTimeout(rest);show('idle');}};
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
  show('idle');
  window.nurim.onMood(mood=>{if(mood==='happy'){base='idle';show('happy');}else{base=mood==='think'?'think':'idle';if(shown!=='happy'||base==='think')show(base);}});
}
