// Coordinates are terminal cells. Physics advances once per 16 ms desktop tick.
const cell = (x, y) => Math.round(y) * 90 + Math.round(x);
const sameCell = (a, b) => Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
const upgrades = [
  ['♥', 'increases health', 5, p => p.hp = Math.min(p.maxHp, p.hp + 1)],
  ['♡', 'increases max health', 7, p => { p.maxHp++; p.hp++; }],
  ['⚡', 'increases move speed', 12, p => p.speed += .04],
  ['|', 'increases bullet count', 3, p => p.capacity++],
  ['⇢', 'increases bullet speed', 8, p => { if (p.cooldown > 71) p.cooldown -= 70; }],
  ['⬆', 'increases jump height', 10, p => p.jump -= .08]
];

class World {
  constructor(sound) {
    this.sound = sound;
    this.time = this.camera = 0;
    this.walls = new Map();
    this.enemies = [];
    this.coins = [];
    this.items = [];
    this.bullets = [];
    this.p = {x:19, y:19, vy:0, speed:.45, jump:-.4, hp:5, maxHp:5, ammo:5,
      capacity:5, coins:0, cooldown:350, shot:-Infinity, hurt:-Infinity, grounded:true};
    this.block(0,20,38,2); this.block(51,20,39,2);
    this.block(36,19,2,1); this.block(51,19,2,1);
  }
  block(x,y,w,h,breakable=false) {
    for (let i=x; i<x+w; i++) for (let j=y; j<y+h; j++)
      this.walls.set(cell(i,j), {x:i,y:j,breakable});
  }
  platform(y, shop) {
    if (shop) {
      this.block(0,y,30,4); this.block(60,y,30,4);
      const choices = [...upgrades];
      for (let i=0;i<3;i++) {
        const [upgrade] = choices.splice(Math.floor(Math.random()*choices.length),1);
        this.items.push({x:65+5*i,y:y-1,upgrade});
      }
      return;
    }
    const left = 25 + Math.trunc(Math.random()*30-15);
    this.block(0,y,left,4); this.block(left+40,y,50-left,4);
    const width = 10+Math.floor(Math.random()*10);
    const gap = 2+Math.floor(Math.random()*3);
    const x = left+gap+1;
    const height = () => Math.floor(y+Math.random()*10-3);
    this.block(x,height(),width,3,true);
    this.block(x+width+2,height(),Math.floor(35-width-gap-Math.random()*3),3,true);
    for (const [type,count] of [['normal',1+Math.floor(this.time/60000)],
      ['shell',Math.floor(this.time/120000)],['spike',Math.floor(this.time/90000)]]) {
      for (let i=0;i<count;i++) for (const [start,w] of [[0,left],[left+40,50-left]]) {
        this.enemies.push({type,x:start+Math.floor(Math.random()*w),
          y:type==='shell'?y-1:Math.floor(y-Math.random()*3), direction:1, moved:-Infinity});
      }
    }
  }
  scroll() {
    const target = Math.round(this.p.y)-15;
    while (this.camera < target) {
      this.camera++;
      if (this.camera%15===0) this.platform(this.camera+40,this.camera%180===0);
      const cutoff = this.camera-10;
      for (const [key,w] of this.walls) if (w.y<cutoff) this.walls.delete(key);
      for (const list of ['items','coins','enemies']) this[list]=this[list].filter(e=>e.y>=cutoff);
    }
  }
  damage() {
    if (this.time-this.p.hurt<3000) return;
    this.p.hp--; this.p.hurt=this.time; this.sound('player_damage');
  }
  kill(e) {
    this.enemies.splice(this.enemies.indexOf(e),1);
    this.coins.push({x:e.x,y:e.y}); this.sound('enemy_death');
  }
  moveEnemies() {
    for (const e of this.enemies) {
      if (this.time-e.moved<(e.type==='normal'?300:500)) continue;
      e.moved=this.time;
      let x=e.x, y=e.y;
      if (e.type==='shell') x+=e.direction;
      else {
        const dx=this.p.x-x, dy=this.p.y-y;
        if (Math.abs(dx)>=Math.abs(dy)) x+=Math.sign(dx);
        else y+=Math.sign(dy);
      }
      if (sameCell({x,y},this.p)) {
        this.damage();
        if (e.type==='shell') e.direction *= -1;
      } else if (e.type==='shell' && !this.walls.has(cell(x,y+1))) e.direction *= -1;
      else if (!this.walls.has(cell(x,y))) Object.assign(e,{x,y});
    }
  }
  advanceBullet(b) {
    b.y++;
    if (b.y-this.camera>=30) return false;
    const key=cell(b.x,b.y), wall=this.walls.get(key);
    if (wall) {
      if (wall.breakable) this.walls.delete(key);
      return false;
    }
    const enemy=this.enemies.find(e=>sameCell(e,b));
    if (enemy) {
      if (enemy.type==='shell') this.sound('ding');
      else this.kill(enemy);
      return false;
    }
    const item=this.items.find(i=>sameCell(i,b));
    if (item && item.upgrade[2]<=this.p.coins) {
      this.p.coins-=item.upgrade[2]; item.upgrade[3](this.p);
      this.items.splice(this.items.indexOf(item),1); this.sound('collectible');
      return false;
    }
    return true;
  }
  tick(keys) {
    const p=this.p, oldY=p.y;
    this.time+=16;
    if (keys.has('Space')) {
      if (p.grounded) {
        p.vy=p.jump; p.grounded=false; p.shot=this.time; this.sound('jump');
      } else if (p.ammo && this.time-p.shot>=p.cooldown) {
        this.bullets.push({x:p.x,y:p.y-1}); p.shot=this.time;
        p.ammo--; p.vy=-.175; this.sound('bullet');
      }
    }
    const right=keys.has('ArrowRight')||keys.has('KeyD');
    const left=keys.has('ArrowLeft')||keys.has('KeyA');
    const x=p.x+(right?1:left?-1:0)*p.speed;
    if (x>=0 && x<=89 && !this.walls.has(cell(x,p.y))) p.x=x;
    if (!p.grounded) p.vy=Math.min(.4,p.vy+.02);
    if (this.walls.has(cell(p.x,p.y+p.vy))) p.vy=0;
    else p.y+=p.vy;
    p.grounded=p.vy>=0 && this.walls.has(cell(p.x,p.y+1));
    if (p.grounded) {
      p.vy=0;
      if (p.ammo!==p.capacity) this.sound('menu_move');
      p.ammo=p.capacity;
    }
    const coin=this.coins.find(c=>sameCell(c,p));
    if (coin) {this.coins.splice(this.coins.indexOf(coin),1); p.coins++; this.sound('coin');}
    const enemy=this.enemies.find(e=>sameCell(e,p));
    if (enemy) {
      if (oldY<enemy.y-.1 && enemy.type!=='spike') this.kill(enemy);
      else this.damage();
      p.vy=p.jump/1.5;
    }
    this.moveEnemies(); this.scroll();
    this.bullets=this.bullets.filter(b=>this.advanceBullet(b));
  }
}
