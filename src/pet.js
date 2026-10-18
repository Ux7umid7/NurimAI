let start=null;let moved=false;
document.getElementById('pet').onpointerdown=event=>{if(event.button!==0)return;start={x:event.screenX,y:event.screenY,offsetX:event.clientX,offsetY:event.clientY};moved=false;event.currentTarget.setPointerCapture(event.pointerId);};
document.getElementById('pet').onpointermove=event=>{if(!start)return;if(Math.hypot(event.screenX-start.x,event.screenY-start.y)>4)moved=true;if(moved)window.nurim.movePet({x:event.screenX-start.offsetX,y:event.screenY-start.offsetY});};
document.getElementById('pet').onpointerup=()=>{if(!start)return;if(!moved)window.nurim.toggle();start=null;};
document.getElementById('pet').onpointercancel=()=>{start=null;};
document.getElementById('pet').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();window.nurim.toggle();}};
