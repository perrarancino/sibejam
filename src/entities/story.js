import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { gameState } from '../state/gameState.js';
import { caveForWave, cavesForWave } from './enemyMechanics.js';
import { Navigation } from './navigation.js?v=centered-route-15';

// Story interaction and a lightweight, schematic map: no second WebGL render.
export class Story {
  constructor(game) {
    this.game = game;
    this.read = false;
    this.rewardedNights=new Set();
    this.wasInside = false;
    this.dialog = null;
    this.lastMap = 0;
    this.aimRay = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
    this.aimPoint = new THREE.Vector3();
    this.icons = Object.fromEntries(['church','cctv-camera'].map(name => {
      const img = new Image(); img.src = `./assets/icons/minimap/${name}.svg`; return [name,img];
    }));
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2), new THREE.ShaderMaterial({
      uniforms:{uColor:{value:new THREE.Color(0xffc950)},uTime:{value:0}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv;uniform vec3 uColor;uniform float uTime;
        float line(float d,float width){return 1.-smoothstep(width,width+.009,abs(d));}
        void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float a=atan(p.y,p.x);
          float rings=max(max(line(r-.85,.010),line(r-.77,.006)),max(line(r-.57,.006),line(r-.29,.006)));
          float petals=line(r-(.65+.065*cos(a*8.)),.008)*smoothstep(.50,.58,r)* (1.-smoothstep(.73,.78,r));
          float diamonds=line(abs(p.x)+abs(p.y)-.22,.008)*(1.-smoothstep(.27,.31,r));
          float compass=max(line(p.x,.006),line(p.y,.006))*(1.-smoothstep(.20,.25,r));
          float outerDots=(1.-smoothstep(.008,.025,length(vec2(r-.805,sin(a*12.)*.12))))*step(.76,r)*step(r,.85);
          float ink=max(max(rings,petals),max(max(diamonds,compass),outerDots));
          float halo=(1.-smoothstep(.30,.94,r))*.08;
          float pulse=.78+.18*sin(uTime*2.);
          gl_FragColor=vec4(uColor,(ink*.82+halo)*pulse);
        }`,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending
    }));
    ring.rotation.x = -Math.PI / 2;
    this.ring = ring;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.83, 48), new THREE.MeshBasicMaterial({color:0xffc950, transparent:true, opacity:0.15, side:THREE.DoubleSide, depthWrite:false}));
    glow.rotation.x = -Math.PI / 2;
    this.glow = glow;
    this.marker.add(ring, glow);
    this.marker.position.y = 0.08;
    this.marker.visible = false;
    game.sceneManager.scene.add(this.marker);
    this.buildUI();
    window.addEventListener('keydown', e => this.key(e));
  }
  buildUI() {
    const style = document.createElement('style');
    style.textContent = `
      #night-indicator{position:fixed;z-index:65;right:18px;top:280px;color:#f4e8ca;font-size:30px;text-shadow:0 2px 8px #000;pointer-events:none}
      #story-dialog{position:fixed;z-index:110;inset:0;display:grid;place-items:center;background:#08070bd9;padding:18px}
      #story-dialog[hidden]{display:none} #story-dialog article{position:relative;max-width:570px;max-height:90vh;overflow:auto;padding:38px 46px;color:#3b2b21;background:linear-gradient(135deg,#e5c997,#c5a478);border:3px double #806342;box-shadow:0 18px 80px #000; font:24px/1.35 RumRaisin,serif}
      #story-dialog article.letter-enter{animation:letter-rise .75s cubic-bezier(.2,.75,.25,1) both}
      #story-dialog .story-word{opacity:0;animation:word-appear .32s ease forwards;animation-delay:var(--word-delay)}
      @keyframes letter-rise{from{opacity:0;transform:translateY(100px) rotate(-2deg) scale(.97)}to{opacity:1;transform:translateY(0) rotate(0) scale(1)}}
      @keyframes word-appear{from{opacity:0}to{opacity:1}}
      body.game-paused #story-dialog article,body.game-paused #story-dialog .story-word{animation-play-state:paused}
      #camera-hint{position:fixed;z-index:70;bottom:22px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 24px);text-align:center;padding:8px 18px;color:#f4e8ca;background:#211a20ed;border:1px solid #a88b60;border-radius:4px;box-shadow:0 4px 20px #0008;font-size:18px;pointer-events:none;opacity:0;transition:opacity .3s}
      #camera-hint.show{opacity:1}
      #story-dialog h2{font-size:32px;margin-bottom:18px} #story-dialog p{margin:0 0 15px} #story-dialog .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px} #story-dialog button{cursor:pointer;border:1px solid #725a3d;background:#3b302b;color:#f5e7cb;padding:9px 18px;font:17px RumRaisin,serif} #story-dialog button:hover{background:#695139}
      #story-dialog strong{color:#942e22;font-weight:700}
      #mini-wrap{position:fixed;right:18px;top:18px;z-index:65;padding:6px;background:#15141ce8;border:1px solid #8f805e;box-shadow:0 3px 20px #0009} #mini-wrap canvas{width:240px;height:240px;display:block;touch-action:auto}
      @media(max-width:600px){#mini-wrap{right:8px;top:8px}#mini-wrap canvas{width:160px;height:160px}#night-indicator{right:8px;top:190px;font-size:25px}#story-dialog article{padding:24px;font-size:21px}}
    `;
    document.head.appendChild(style);
    this.status = document.createElement('div'); this.status.id='night-indicator';
    this.modal = document.createElement('div'); this.modal.id='story-dialog'; this.modal.hidden=true;
    this.modal.innerHTML='<article role="dialog" aria-modal="true" aria-labelledby="story-title"><div class="content"></div><div class="actions"></div></article>';
    this.hint=document.createElement('div');this.hint.id='camera-hint';this.hint.textContent='Камеры: 1–4 / ← → / нажми на камеру на миникарте · Пробел — вспышка';
    this.mapWrap = document.createElement('div'); this.mapWrap.id='mini-wrap'; this.mapWrap.innerHTML='<canvas width="192" height="192" aria-label="Миникарта"></canvas>';
    this.mapCanvas = this.mapWrap.querySelector('canvas'); this.ctx = this.mapCanvas.getContext('2d');
    this.mapCanvas.addEventListener('pointerdown',event=>{
      if(event.button!==0||gameState.get().phase!=='WAVE_ACTIVE'||this.dialog||this.game.paused||this.game.editor.active)return;
      const rect=this.mapCanvas.getBoundingClientRect(),x=(event.clientX-rect.left)*192/rect.width,y=(event.clientY-rect.top)*192/rect.height;
      const scale=172/this.game.map.fieldSize;let closest=-1,best=14;
      this.getCameras().forEach((item,index)=>{const p=item.pivot.parent.position,d=Math.hypot(x-(96+p.x*scale),y-(96+p.z*scale));if(d<best){best=d;closest=index;}});
      if(closest>=0){event.preventDefault();event.stopPropagation();this.selectCamera(closest);}
    });
    document.body.append(this.status,this.mapWrap,this.hint,this.modal);
    for (const el of [this.modal,this.mapWrap]) for (const type of ['pointerdown','pointermove','pointerup','wheel']) el.addEventListener(type, e=>e.stopPropagation());
    this.updateStatus();
  }
  updateStatus() {
    this.status.textContent=`Н${Math.max(1, gameState.get().wave)}`;
  }
  open(kind) {
    this.game.audio?.cue('choose');this.game.audio?.action(this.game.player.getPosition());
    this.dialog=kind; this.modal.hidden=false; this.game.input.keys.clear(); this.game.input.isShiftPressed=false;
    const content=this.modal.querySelector('.content'), actions=this.modal.querySelector('.actions');
    this.modal.querySelector('article').classList.toggle('letter-enter',kind==='letter');
    actions.replaceChildren();
    if(kind==='letter') {
      content.innerHTML=`<h2 id="story-title">Дорогая сестра Агата,</h2><p>Нечисть идёт к монастырю. Я оставил тебе <strong>шипы и арбалет</strong>: поставь их у пещеры и следи за камерой.</p><p>Призраков проявляет свет камеры. Выдержи пять ночей — и Господь сохранит нашу обитель.</p><p>Твой священник</p>`;
      this.button(actions,'Я защищу монастырь',()=>{this.read=true;this.open('tutorial');this.updateStatus();});
    } else if(kind==='tutorial') {
      content.innerHTML=`<h2 id="story-title">Как поставить ловушку</h2>
        <p>Подойди к свободному месту рядом с Агатой и нажми <strong>ЛКМ</strong>. Выбери ловушку в круговом меню — её стоимость спишется из монет.</p>
        <p><span style="color:#795000;font-weight:bold">● Золотой круг</span> — место подходит. <span style="color:#a12624;font-weight:bold">● Красный круг</span> — место занято или слишком далеко.</p>
        <p><strong>R</strong> поворачивает ловушку. ЛКМ по уже поставленной ловушке убирает её и возвращает монеты.</p>
        <p>Стрелка на миникарте показывает путь от пещеры. Во время ночи нажимай ловушки со значком <strong>молнии</strong>, чтобы их включить.</p>`;
      this.button(actions,'Понятно',()=>this.close());
    } else {
      content.innerHTML='<h2 id="story-title">Войти в храм?</h2><p>С наступлением ночи начнётся оборона монастыря. Убедись, что всё готово.</p>';
      this.button(actions,'Начать оборону',()=>this.startBattle());
      this.button(actions,'Ещё подготовиться',()=>this.close());
    }
    actions.querySelector('button')?.focus({preventScroll:true});
  }
  button(parent,label,action) { const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);parent.appendChild(b);return b; }
  revealLetter() {
    const content=this.modal.querySelector('.content');
    const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    let index=0;
    for(const node of nodes){
      const fragment=document.createDocumentFragment();
      for(const part of node.data.split(/(\s+)/)){
        if(!part)continue;
        if(/^\s+$/.test(part)){fragment.appendChild(document.createTextNode(part));continue;}
        const word=document.createElement('span');word.className='story-word';word.style.setProperty('--word-delay',`${750+index++*65}ms`);word.textContent=part;fragment.appendChild(word);
      }
      node.replaceWith(fragment);
    }
  }
  close() {this.dialog=null;this.modal.hidden=true;this.game.input.keys.clear();}
  prepareNextRoute(){const caves=cavesForWave(this.game.decorations.editable,Math.min(5,gameState.get().wave+1));const church=this.game.decorations.editable.find(e=>e.type==='church'&&e.object.visible)?.object;for(const cave of caves)this.previewNavigation(cave,church);}
  startBattle() {
    this.close(); this.marker.visible=false;
    gameState.update({phase:'WAVE_ACTIVE',wave:Math.min(5,gameState.get().wave+1),isViewingCamera:true,activeCameraIndex:0});
    this.game.input.keys.clear(); this.updateStatus();
    const night=gameState.get().wave;
    const screen=document.createElement('div');screen.textContent=`НОЧЬ ${night}`;
    screen.style.cssText='position:fixed;inset:0;z-index:105;display:grid;place-items:center;pointer-events:none;background:#07060de8;color:#f5dfb3;font:64px Georgia,serif;animation:night-fade 3s ease forwards';
    if(!document.getElementById('night-fade-style')){const style=document.createElement('style');style.id='night-fade-style';style.textContent='@keyframes night-fade{0%,55%{opacity:1}100%{opacity:0}}';document.head.append(style);}
    document.body.append(screen);setTimeout(()=>screen.remove(),3000);
    this.hint.classList.add('show');
  }
  openWaveResult(bossDefeated,bossEscaped){
    this.dialog='waveResult';this.modal.hidden=false;this.modal.querySelector('article').classList.remove('letter-enter');
    const content=this.modal.querySelector('.content'),actions=this.modal.querySelector('.actions');actions.replaceChildren();
    const wave=gameState.get().wave;
    const notes=[
      'Дочь моя, я нашёл тебе мину и пакет с жидкостью. Мина взорвётся сама, пакет нажми в нужный миг. Следи за светом камер. Твой священник.',
      'Агата, к твоим услугам электрический канат и бревно. Канат замедлит нечисть; бревно пусти вручную вдоль прохода. Храни тебя Господь.',
      'Дочь моя, береги припасы: сегодня нового оружия нет. Пугало перепрыгивает ловушку, но затем десять секунд не может повторить прыжок. Твой священник.',
      'Агата, я приготовил огнемёт и пушку ярости — нажми на них во время боя. Пушка обратит приспешников, но на Джека не подействует. Нечисть придёт сразу из всех четырёх пещер. Молюсь за тебя.',
      'Дорогая Агата, рассвет настал. Благодаря тебе обитель спасена. Да хранит тебя Господь. Твой священник.'
    ];
    const rewards=[80,100,130,160,200];let reward=0;
    if(!bossEscaped&&!this.rewardedNights.has(wave)){reward=rewards[wave-1]||0;this.rewardedNights.add(wave);gameState.update({seeds:gameState.get().seeds+reward});}
    if(wave>=5&&bossDefeated){
      content.innerHTML=`<h2 id="story-title">Джек повержен</h2><p>Все пять ночей позади. Монастырь выстоял!</p><p>${notes[4]}</p><p>Награда: ${reward} монет</p>`;
      this.button(actions,'Вернуться в монастырь',()=>{this.close();this.rewardedNights.clear();gameState.update({phase:'PREPARATION',wave:0,seeds:150});});
    }else if(bossEscaped){
      content.innerHTML='<h2 id="story-title">Жнец прорвался к храму</h2><p>Подготовь ловушки и останови Джека в следующей попытке.</p>';
      this.button(actions,'Повторить последнюю ночь',()=>{gameState.update({wave:4});this.startBattle();});
    }else{
      content.innerHTML=`<h2 id="story-title">Ночь ${wave} завершена</h2><p>${notes[wave-1]}</p><p>Награда: ${reward} монет. ${wave===4?'В последнюю ночь враги пойдут из всех пещер.':'Следующей ночью враги придут из другой пещеры.'}</p>`;
      this.button(actions,'Подготовиться',()=>{this.close();gameState.update({phase:'PREPARATION'});this.prepareNextRoute();});
      this.button(actions,'Начать без подготовки',()=>this.startBattle());
    }
  }
  getCameras() {return this.game.decorations.cameras.filter(c=>c.pivot.parent.visible);}
  gameStatePhaseIsBattle() {return gameState.get().phase === 'WAVE_ACTIVE';}
  selectCamera(index) {
    this.game.audio.cue('camera');
    const cameras=this.getCameras(); if(!cameras.length)return;
    gameState.update({activeCameraIndex:(index+cameras.length)%cameras.length});
  }
  key(e) {
    if(this.dialog){if(e.key==='Escape' && this.dialog==='confirm'){e.preventDefault();this.close();}return;}
    if(this.game.editor.active||gameState.get().phase!=='WAVE_ACTIVE'||e.repeat)return;
    if(e.key==='Escape') {gameState.update({phase:'PREPARATION',wave:0,isViewingCamera:false});this.game.input.keys.clear();this.hint.classList.remove('show');this.updateStatus();return;}
    if(e.code==='Space'){e.preventDefault();this.game.combat.cameraFlash();return;}
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();this.selectCamera(gameState.get().activeCameraIndex+(e.key==='ArrowLeft'?-1:1));}
    if(/^[1-9]$/.test(e.key)){e.preventDefault();this.selectCamera(Number(e.key)-1);}
  }
  update(now) {
    const editor=this.game.editor.active, battle=gameState.get().phase==='WAVE_ACTIVE';
    this.hint.classList.toggle('show',battle&&!editor&&!this.dialog);
    const church=this.game.decorations.editable.find(e=>e.type==='church' && e.object.visible)?.object;
    this.marker.visible=!!church&&!editor&&!battle;
    if(church){
      const distance=2.85*church.scale.x;
      this.marker.position.x=church.position.x-Math.sin(church.rotation.y)*distance;
      this.marker.position.z=church.position.z-Math.cos(church.rotation.y)*distance;
      const color=this.read?0x56bfff:0xffc950;this.ring.material.uniforms.uColor.value.setHex(color);this.ring.material.uniforms.uTime.value=now*.001;this.glow.material.color.setHex(color);
      this.glow.material.opacity=0.07+0.03*Math.sin(now*0.003);
      const p=this.game.player.getPosition();const inside=Math.hypot(p.x-this.marker.position.x,p.z-this.marker.position.z)<0.95;
      if(!editor&&!battle&&!this.dialog&&inside&&!this.wasInside)this.open(this.read?'confirm':'letter');
      this.wasInside=inside;
    }
    if(!editor&&now-this.lastMap>200){this.lastMap=now;this.drawMap(church,battle);}
    this.mapWrap.hidden=editor;this.status.hidden=editor;
    const night=`Н${Math.max(1, gameState.get().wave)}`;
    if(this.status.textContent!==night)this.status.textContent=night;
  }
  cameraTarget() {
    const cameras=this.getCameras();const item=cameras[gameState.get().activeCameraIndex]||cameras[0];
    return item ? item.pivot.parent.position : this.game.player.getPosition();
  }
  getCameraAim() {
    if (!this.game.player.pointerActive) return null;
    this.aimRay.setFromCamera(this.game.player.pointer,this.game.sceneManager.camera);
    return this.aimRay.ray.intersectPlane(this.aimPlane,this.aimPoint);
  }
  previewNavigation(cave,church) {
    const colliders=this.game.decorations.colliders,destination=church?.position||this.game.player.getPosition();
    const key=[this.game.boundLimit,cave.position.x,cave.position.z,cave.rotation.y,destination.x,destination.z,...colliders.map(c=>[c.disabled?1:0,c.x,c.z,c.r,c.halfX,c.halfZ].join(','))].join('|');
    this.routeCache??=new Map();this.routePending??=new Map();
    if(this.routeCache.has(key))return this.routeCache.get(key);
    if(this.routePending.has(key))return null;
    const origin={x:cave.position.x+Math.sin(cave.rotation.y)*1.7,z:cave.position.z+Math.cos(cave.rotation.y)*1.7},target={x:destination.x,z:destination.z};
    const fallback=()=>{if(!this.routePending.has(key))return;setTimeout(()=>{if(!this.routePending.has(key))return;const nav=new Navigation(this.game.decorations,this.game.boundLimit,origin,target);this.routeCache.set(key,nav);this.routePending.delete(key);},0);};
    try{
      const worker=new Worker(new URL('./navigationWorker.js',import.meta.url),{type:'module'});this.routePending.set(key,worker);
      worker.onmessage=event=>{worker.terminate();if(!this.routePending.has(key))return;if(event.data.error){fallback();return;}const nav=Object.assign(Object.create(Navigation.prototype),event.data.data,{decorations:this.game.decorations});if(this.routeCache.size>=12)this.routeCache.delete(this.routeCache.keys().next().value);this.routeCache.set(key,nav);this.routePending.delete(key);};
      worker.onerror=()=>{worker.terminate();fallback();};
      worker.postMessage({key,limit:this.game.boundLimit,origin,destination:target,colliders:colliders.map(c=>({type:c.type,x:c.x,z:c.z,r:c.r,halfX:c.halfX,halfZ:c.halfZ,disabled:!!c.disabled}))});
    }catch(error){this.routePending.set(key,null);fallback();}
    return null;
  }
  drawMap(church,battle) {
    const c=this.ctx,w=192,size=this.game.map.fieldSize,scale=(w-20)/size;
    const point=(x,z)=>[w/2+x*scale,w/2+z*scale];
    c.clearRect(0,0,w,w);c.fillStyle='#d6c29e';c.fillRect(0,0,w,w);
    c.strokeStyle='#8f7754';c.lineWidth=1;c.strokeRect(7,7,w-14,w-14);c.strokeRect(10,10,w-20,w-20);
    c.strokeStyle='#765a3d';c.lineWidth=1.6;c.lineCap='round';c.beginPath();
    for(const entry of this.game.decorations.editable){
      const o=entry.object,type=entry.type;if(!o.visible||!['fence','fenceSection','stoneFence','stoneFenceSection'].includes(type))continue;
      const stone=type.startsWith('stoneFence');
      const half=type.endsWith('Section') ? (stone?26/16:2)*o.scale.x/2 : entry.colliderBase ? (Math.max(entry.colliderBase.halfX,entry.colliderBase.halfZ)-(stone?.125:.03))*o.scale.x/entry.colliderBase.scale : 0;
      const dx=Math.cos(o.rotation.y)*half,dz=-Math.sin(o.rotation.y)*half;
      const [x1,y1]=point(o.position.x-dx,o.position.z-dz),[x2,y2]=point(o.position.x+dx,o.position.z+dz);
      c.moveTo(x1,y1);c.lineTo(x2,y2);
    }
    c.stroke();
    const drawIcon=(name,x,z,width,bg)=>{const [px,py]=point(x,z),img=this.icons[name];c.fillStyle=bg;c.beginPath();c.arc(px,py,width*.55,0,Math.PI*2);c.fill();if(img.complete&&img.naturalWidth)c.drawImage(img,px-width/2,py-width/2,width,width);};
    if(church)drawIcon('church',church.position.x,church.position.z,20,'#eadbbd');
    for(const entry of this.game.decorations.editable){
      if(entry.type!=='cave'||!entry.object.visible)continue;
      const [x,y]=point(entry.object.position.x,entry.object.position.z);
      c.fillStyle='#eadbbd';c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.fill();
      c.fillStyle='#624833';c.beginPath();c.moveTo(x-6,y+4);c.lineTo(x-4,y-3);c.lineTo(x,y-6);c.lineTo(x+4,y-3);c.lineTo(x+6,y+4);c.closePath();c.fill();
      c.fillStyle='#e5d1ae';c.beginPath();c.arc(x,y+4,2.6,Math.PI,0);c.fill();
    }
    const state=gameState.get();
    const caves=battle?(this.game.combat?.active?this.game.combat.spawnCaves:cavesForWave(this.game.decorations.editable,state.wave)):cavesForWave(this.game.decorations.editable,Math.min(5,state.wave+1));
    for(const cave of caves||[]){
      const nav=battle&&this.game.combat?.active?this.game.combat.caveRoutes?.get(cave):this.previewNavigation(cave,church);
      const points=[point(cave.position.x,cave.position.z)];let travelled=0;
      if(nav?.start>=0){
        let index=nav.start;
        for(let i=0;i<20&&index>=0;i++){
          const world=nav.point(index),next=point(world.x,world.z),prev=points.at(-1);
          travelled+=Math.hypot(next[0]-prev[0],next[1]-prev[1]);points.push(next);
          if(travelled>=21||index===nav.goal)break;
          index=nav.next[index];
        }
      }
      if(points.length<2){const direction={x:Math.sin(cave.rotation.y),z:Math.cos(cave.rotation.y)};points.push(point(cave.position.x+direction.x*4,cave.position.z+direction.z*4));}
      const [cx,cy]=points[0],[firstX,firstY]=points[1],firstLen=Math.hypot(firstX-cx,firstY-cy)||1;
      const startX=cx+(firstX-cx)*Math.min(7/firstLen,1),startY=cy+(firstY-cy)*Math.min(7/firstLen,1);
      const [tipX,tipY]=points.at(-1),[prevX,prevY]=points.at(-2),length=Math.hypot(tipX-prevX,tipY-prevY)||1,dx=(tipX-prevX)/length,dy=(tipY-prevY)/length;
      c.save();c.lineCap='round';c.lineJoin='round';
      const drawLine=()=>{c.beginPath();c.moveTo(startX,startY);for(const [x,y] of points.slice(1))c.lineTo(x,y);c.stroke();};
      c.strokeStyle='#f6e3b8';c.lineWidth=5;drawLine();c.strokeStyle='#a14b24';c.lineWidth=2.4;drawLine();
      c.fillStyle='#a14b24';c.beginPath();c.moveTo(tipX+dx*4,tipY+dy*4);c.lineTo(tipX-dx*4-dy*4,tipY-dy*4+dx*4);c.lineTo(tipX-dx*4+dy*4,tipY-dy*4-dx*4);c.closePath();c.fill();c.restore();
    }
    this.getCameras().forEach((item,i)=>drawIcon('cctv-camera',item.pivot.parent.position.x,item.pivot.parent.position.z,14,battle&&i===gameState.get().activeCameraIndex?'#a9c7c2':'#e4d0a7'));
    c.save();c.beginPath();c.rect(10,10,w-20,w-20);c.clip();
    for(const enemy of this.game.combat?.enemies||[]){if(enemy.hp<=0||!enemy.mesh.visible)continue;const [x,y]=point(enemy.mesh.position.x,enemy.mesh.position.z);c.fillStyle=enemy.ally?'#39895b':'#b52f28';c.strokeStyle='#f7e8c8';c.lineWidth=.8;c.beginPath();c.arc(x,y,2.8,0,Math.PI*2);c.fill();c.stroke();}
    c.restore();
  }
}
