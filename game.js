const canvas=document.querySelector('canvas'), ctx=canvas.getContext('2d');
const hint=document.querySelector('#hint'), mute=document.querySelector('#sound');
const nav=document.querySelector('nav');
const keys=new Set();
const menus={start:['play','exit'],pause:['continue','restart','exit to main menu','exit'],
  over:['restart','exit to main menu','exit'],closed:['reopen']};
const red='#e33131', gold='#d8a500', gray='#777';
let state='start', selected=0, world, record=0, newRecord=false;
let unlocked=false, muted=false, music, musicName, context;
const effects=new Map();
try {record=Number(localStorage.getItem('fallbound.highscore'))||0;} catch {}
function unlock() {
  if (!unlocked) {
    unlocked=true;
    if (location.protocol !== 'file:' && window.AudioContext) context=new AudioContext();
    for (const name of ['bullet','coin','collectible','ding','enemy_death','jump',
      'menu_move','menu_select','player_damage','player_death']) {
      if (!context) { effects.set(name,new Audio('audio/'+name+'.mp3')); continue; }
      effects.set(name,fetch('audio/'+name+'.mp3').then(r=>r.arrayBuffer())
        .then(bytes=>context.decodeAudioData(bytes)).catch(()=>null));
    }
    syncMusic();
  }
  if (context?.state==='suspended') context.resume().catch(()=>{});
}
function sound(name) {
  if (!unlocked || muted) return;
  if (!context) {
    const effect=effects.get(name); effect.currentTime=0; effect.play().catch(()=>{}); return;
  }
  effects.get(name)?.then(buffer=>{
    if (!buffer || muted || document.hidden) return;
    const source=context.createBufferSource();
    source.buffer=buffer; source.connect(context.destination); source.start();
  });
}
function syncMusic() {
  if (!unlocked) return;
  const name=state==='start'?'menu_music':state==='play'||state==='pause'?'background_music':null;
  if (name!==musicName) {
    music?.pause(); music=name?new Audio('audio/'+name+'.mp3'):null;
    musicName=name;
    if (music) {music.loop=true; music.volume=.55;}
  }
  if (!music) return;
  if (document.hidden || muted || state==='pause') music.pause();
  else music.play().catch(()=>{});
}
mute.onclick=()=>{
  muted=!muted; unlock(); syncMusic();
  mute.textContent=muted?'Unmute':'Mute'; mute.setAttribute('aria-pressed',String(muted));
  canvas.focus();
};
const timeText=t=>[Math.floor(t/60000),Math.floor(t/1000)%60,Math.floor(t/10)%100]
  .map(n=>String(n).padStart(2,'0')).join(':').replace(/:(\d\d)$/,'.$1');
function text(x,y,s,color='#fff') {
  ctx.fillStyle=color;
  for (const c of s) {if(c!==' ') ctx.fillText(c,x*8,y*16+14,8); x++;}
}
function drawScene() {
  const {p,camera}=world;
  const draw=(e,glyph,color)=>{
    const y=Math.round(e.y)-camera;
    if(y>=5 && y<31) text(Math.round(e.x),y,glyph,color);
  };
  for(const b of world.bullets) draw(b,'|',red);
  for(const c of world.coins) draw(c,'O',gold);
  for(const w of world.walls.values()) draw(w,w.breakable?'░':'▓');
  for(const e of world.enemies) draw(e,{normal:'█',shell:'∩',spike:'Δ'}[e.type],red);
  for(const i of world.items) {
    draw(i,i.upgrade[0],gold);
    if(sameCell(i,p)) {
      text(2,i.y-camera-2,i.upgrade[1]);
      text(2,i.y-camera-1,i.upgrade[2]+' COINS | shoot to purchase',gold);
    }
  }
  draw(p,'█',world.time-p.hurt<3000?gray:'#0040bf');
  text(2,1,'TIME '+timeText(world.time)); text(2,2,'HIGHSCORE '+timeText(record),gray);
  text(2,3,'♥ '.repeat(p.hp)+'♡ '.repeat(p.maxHp-p.hp),red);
  text(83,1,'COINS'); text(82-String(p.coins).length,1,String(p.coins),gold);
  text(88-p.capacity,2,'░'.repeat(p.capacity-p.ammo)+'█'.repeat(p.ammo),gold);
}
function draw() {
  ctx.fillStyle='#000'; ctx.fillRect(0,0,720,496);
  ctx.font='16px Terminal, monospace';
  if(state==='play') return drawScene();
  if(state==='start') banner.forEach((line,i)=>text(4,i+6,line,red));
  if(state==='over') {
    text(2,1,newRecord?'⁜ NEW HIGH SCORE! ⁜':'GAME OVER',gold);
    text(2,2,'TIME '+timeText(world.time)); text(2,3,'HIGHSCORE '+timeText(record),gray);
  }
  const title={start:'START MENU',pause:'PAUSE MENU',over:'GAME OVER',closed:'TERMINAL CLOSED'}[state];
  text(4,24,'⁜ '+title+' ⁜',red);
  menus[state].forEach((label,i)=>text(4,(state==='start'?26:25)+i,
    (i===selected?'▒ ':'')+label,i===selected?'#fff':gray));
}
function change(next) {
  state=next; selected=0; keys.clear(); syncMusic();
  hint.textContent=state==='play'?'A / D or ← → move · Space jump / shoot · Esc pause':
    '↑ ↓ select · Enter confirm';
  nav.replaceChildren();
  for (const [label,code] of (state==='play'?[['←','ArrowLeft'],['→','ArrowRight'],['Jump / Shoot','Space'],['Pause','Escape']]:
    [['↑','ArrowUp'],['↓','ArrowDown'],['Enter','Enter']])) {
    const button=document.createElement('button'); button.textContent=label; nav.append(button);
    button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);press(code);};
    button.onlostpointercapture=()=>keys.delete(code);
  }
  draw();
}
function choose() {
  const action=menus[state][selected];
  sound('menu_select');
  if(action==='play'||action==='restart') {
    world=new World(sound); if(musicName==='background_music') music.currentTime=0;
    change('play');
  } else if(action==='continue') change('play');
  else if(action==='exit') change('closed');
  else change('start');
}
function press(code) {
  unlock();
  if(state==='play') {
    if(code==='Escape') {sound('menu_select');change('pause');}
    else keys.add(code);
  } else if(code==='Enter') choose();
  else if(code==='ArrowDown'||code==='ArrowUp') {
    const count=menus[state].length;
    selected=(selected+(code==='ArrowDown'?1:-1)+count)%count; sound('menu_move');draw();
  } else if(code==='Escape' && state==='pause') change('play');
}
window.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLButtonElement && ['Space','Enter'].includes(e.code)) return;
  if(e.altKey||e.ctrlKey||e.metaKey||!['Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyA','KeyD','Space','Escape'].includes(e.code)) return;
  e.preventDefault(); if(!e.repeat) press(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
canvas.onpointerdown=e=>{
  unlock(); canvas.focus();
  if(state==='play') return;
  const rect=canvas.getBoundingClientRect();
  const row=Math.floor((e.clientY-rect.top)/rect.height*31)-(state==='start'?26:25);
  const col=(e.clientX-rect.left)/rect.width*90;
  if(row>=0 && row<menus[state].length && col>=3 && col<=7+menus[state][row].length) {
    selected=row;choose();
  }
};
function loseFocus() {keys.clear();if(state==='play') change('pause');}
window.addEventListener('blur',loseFocus);
document.addEventListener('visibilitychange',()=>{if(document.hidden) loseFocus();syncMusic();});
let last=0, remaining=0;
function frame(now) {
  if(state==='play') {
    remaining+=Math.min(96,now-last);
    while(remaining>=16 && state==='play') {
      world.tick(keys); remaining-=16;
      if(world.p.hp<=0) {
        newRecord=world.time>record;
        if(newRecord) {
          record=world.time;try{localStorage.setItem('fallbound.highscore',String(record));}catch{}
        }
        sound('player_death');change('over');
      }
    }
    if(state==='play') draw();
  } else remaining=0;
  last=now;requestAnimationFrame(frame);
}
change('start');document.fonts.load('16px Terminal').then(draw);requestAnimationFrame(frame);
