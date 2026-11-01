import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { ECONOMY_CONFIG } from '../config/index.js';
import { gameState } from '../state/gameState.js';

const ITEMS=[
  {key:'spikes',name:'Напольные шипы',config:'floorSpikes',night:1},
  {key:'mine',name:'Мина',config:'mine',night:2},
  {key:'crossbow',name:'Арбалетная турель',config:'dartDevice',night:1},
  {key:'rope',name:'Канатный забор',config:'electricFence',night:3},
  {key:'packet',name:'Пакет жидкости',config:'slowLiquidPacket',night:2},
  {key:'log',name:'Бревно с шипами',config:'log',night:3},
  {key:'flamethrower',name:'Огнемёт',config:'flamethrower',night:5},
  {key:'cannon',name:'Пушка',config:'cannon',night:5}
];

export async function loadTrap(key) {
  const response=await fetch(`./assets/traps/models/${key}.json`);
  if(!response.ok)throw Error(`Модель ${key} недоступна`);
  const data=await response.json(),loader=new THREE.TextureLoader();
  const materials=data.textures.map(url=>{
    const map=loader.load(url);map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.NearestFilter;
    return new THREE.MeshStandardMaterial({map,side:THREE.DoubleSide,roughness:1,transparent:false,alphaTest:.1});
  });
  const root=new THREE.Group();
  for(const part of data.meshes){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(part.uv,2));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,materials[part.texture]);mesh.castShadow=true;mesh.receiveShadow=true;
    if(key==='spikes'&&part.texture===1){geometry.computeBoundingBox();const base=geometry.boundingBox.min.y;geometry.translate(0,-base,0);mesh.position.y=base;mesh.name='spike-heads';mesh.castShadow=false;}
    if(key==='crossbow')mesh.name=part.texture===1?'loaded-dart':'crossbow-body';
    root.add(mesh);
  }
  return root;
}

export class BuildManager {
  constructor(game) {
    this.game=game;this.models=new Map();this.placed=[];this.hovered=null;this.angle=0;this.pointer=new THREE.Vector2();this.point=new THREE.Vector3();this.menuPoint=new THREE.Vector3();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.ray=new THREE.Raycaster();this.pointerValid=false;this.menuOpen=false;
    this.outlineScene=new THREE.Scene();

    this.manualIcons=new Map();
    const iconStyle=document.createElement('style');iconStyle.textContent='.manual-trap-icon{position:fixed;z-index:69;pointer-events:none;transform:translate(-50%,-100%);display:grid;place-items:center;width:32px;height:32px;border:1px solid #927446;border-radius:50%;background:#19161de6;box-shadow:0 2px 6px #0009}.manual-trap-icon img{width:25px;height:25px;display:block}';document.head.append(iconStyle);
    this.outlinePoints=new WeakMap();
    this.outlineSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');this.outlineSvg.setAttribute('aria-hidden','true');this.outlineSvg.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:66;overflow:visible';
    this.outlinePath=document.createElementNS('http://www.w3.org/2000/svg','path');this.outlinePath.setAttribute('fill','none');this.outlinePath.setAttribute('stroke','#ffdb88');this.outlinePath.setAttribute('stroke-width','2.5');this.outlinePath.setAttribute('stroke-linejoin','round');this.outlinePath.style.filter='drop-shadow(0 0 3px #d98625)';this.outlineSvg.append(this.outlinePath);document.body.append(this.outlineSvg);
    this.marker=new THREE.Group();
    const ring=new THREE.Mesh(new THREE.RingGeometry(.28,.32,32),new THREE.MeshBasicMaterial({color:0xe9d39b,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;this.marker.add(ring);this.ring=ring;
    const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.47,.01,0),new THREE.Vector3(-.34,.01,0),new THREE.Vector3(.34,.01,0),new THREE.Vector3(.47,.01,0),new THREE.Vector3(0,.01,-.47),new THREE.Vector3(0,.01,-.34),new THREE.Vector3(0,.01,.34),new THREE.Vector3(0,.01,.47)]);
    this.cross=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xe9d39b,transparent:true,opacity:.85,depthTest:false}));this.marker.add(this.cross);this.marker.position.y=.12;this.marker.visible=false;game.sceneManager.scene.add(this.marker);
    this.buildUI();
    Promise.all(ITEMS.map(async item=>{try{this.models.set(item.key,await loadTrap(item.key));}catch(e){console.error(e);}this.refreshMenu();}));
    const canvas=game.sceneManager.renderer.domElement;
    canvas.addEventListener('pointermove',e=>this.move(e));
    canvas.addEventListener('pointerleave',()=>{if(!this.menuOpen)this.pointerValid=false;});
    canvas.addEventListener('pointerdown',e=>this.down(e));
    window.addEventListener('wheel',e=>{
      if(!this.enabled()||this.menuOpen||e.target!==canvas)return;
      this.move(e);this.ray.setFromCamera(this.pointer,this.game.sceneManager.camera);const object=this.findHovered();if(!object)return;
      e.preventDefault();e.stopImmediatePropagation();object.userData.rotationTarget=(object.userData.rotationTarget??object.rotation.y)+THREE.MathUtils.clamp(e.deltaY/120,-1,1)*Math.PI/12;
      const saved=gameState.get().placedTraps.find(t=>t.id===object.userData.trapId);if(saved)saved.rotation=object.userData.rotationTarget;
    },{capture:true,passive:false});
    window.addEventListener('pointerdown',e=>{if(e.button===2&&this.menuOpen){e.preventDefault();e.stopImmediatePropagation();this.close();}},{capture:true});
    window.addEventListener('keydown',e=>this.key(e));
    gameState.subscribe(()=>this.updateBalance());
  }
  buildUI(){
    const css=document.createElement('style');css.textContent=`
      #build-wallet{position:fixed;z-index:66;left:20px;top:20px;display:flex;align-items:center;gap:8px;color:#f1db9d;background:#19161de6;border:1px solid #927446;padding:7px 13px;border-radius:5px;font-size:26px;text-shadow:0 1px 5px #000;pointer-events:none}
      #build-wallet img,.build-cost img{width:23px;height:23px;filter:sepia(1) saturate(3) hue-rotate(345deg);object-fit:contain}
      #build-feedback{display:none!important}
      #build-menu{position:fixed;z-index:105;width:400px;height:400px;transform:translate(-50%,-50%);border:1px solid #b99a67;border-radius:50%;background:radial-gradient(circle,#302629ee 0 25%,#18151cf2 26% 100%);box-shadow:0 0 0 5px #1a171dd9,0 8px 40px #000d;color:#f4e6c6}
      #build-menu[hidden],#build-wallet[hidden],#build-feedback[hidden]{display:none}
      #build-menu [hidden]{display:none!important}
      #build-menu .build-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);margin:0;z-index:1;text-align:center;font-size:20px;line-height:1.1;width:110px;height:110px;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}
      #build-menu button{position:absolute;left:50%;top:50%;width:98px;height:98px;margin:-49px 0 0 -49px;border:1px solid #77654e;border-radius:50%;background:#302a2c;color:#f8e7c3;cursor:pointer;padding:2px;display:grid;place-items:center;transition:background .15s,border-color .15s}
      #build-menu button:hover,#build-menu button:focus-visible{background:#65503a;border-color:#edca83;outline:none} #build-menu button:disabled{opacity:.42;cursor:not-allowed}
      #build-menu button>img{width:90px;height:80px;object-fit:contain;image-rendering:auto} #build-menu .build-cost{position:absolute;bottom:3px;display:flex;align-items:center;gap:3px;font-size:17px;line-height:1;color:#f7db8e;text-shadow:0 1px 3px #000}
      #build-menu .build-cost img{width:15px;height:15px} @media(max-width:600px){#build-menu{transform:translate(-50%,-50%) scale(.72)}#build-wallet{font-size:21px}}
      #build-menu button.locked>img{filter:grayscale(.35) brightness(1.4);opacity:.82} #build-menu button.locked{opacity:.9}
      #build-menu .build-lock{position:absolute;right:5px;bottom:5px;width:28px;height:28px;border:1px solid #a98b5d;border-radius:50%;display:grid;place-items:center;background:#241d22;box-shadow:0 1px 4px #000} #build-menu .build-lock img{width:17px;height:17px;filter:sepia(1) saturate(1.8) hue-rotate(350deg)}
      #build-menu .unlock-night{position:absolute;top:22px;font:11px system-ui;color:#f1db9d;background:#241d22;padding:1px 3px;border-radius:3px} #build-menu .coin-mark{position:relative;display:inline-flex} #build-menu .no-money .coin-mark:after{content:'';position:absolute;width:16px;height:2px;background:#f06a5d;left:-1px;top:6px;transform:rotate(-45deg);box-shadow:0 0 2px #000}
    `;document.head.appendChild(css);
    this.wallet=document.createElement('div');this.wallet.id='build-wallet';this.wallet.innerHTML='<img src="./assets/icons/two-coins.svg" alt=""><span></span>';this.wallet.setAttribute('aria-label','Монеты');
    this.feedback=document.createElement('div');this.feedback.id='build-feedback';this.feedback.textContent='ЛКМ — построить · R — повернуть';
    this.menu=document.createElement('div');this.menu.id='build-menu';this.menu.hidden=true;this.menu.setAttribute('role','menu');this.menu.setAttribute('aria-label','Строительство ловушек');
    this.center=document.createElement('button');this.center.type='button';this.center.className='build-center';this.center.textContent='Выбери ловушку';this.center.setAttribute('aria-label','Закрыть меню строительства');this.center.addEventListener('click',()=>this.close());this.menu.appendChild(this.center);
    ITEMS.forEach((item,i)=>{
      const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.setAttribute('aria-label',`${item.name}: ${ECONOMY_CONFIG[item.config].cost} монет`);b.title=item.name;
      const a=-Math.PI/2+i*Math.PI/4;b.style.transform=`translate(${Math.cos(a)*145}px,${Math.sin(a)*145}px)`;
      b.innerHTML=`<img src="./assets/traps/previews/${item.key}.png" alt=""><span class="build-lock" hidden><img src="./assets/icons/plain-padlock.svg" alt=""><small class="unlock-night"></small></span><span class="build-cost"><span class="coin-mark"><img src="./assets/icons/two-coins.svg" alt=""></span>${ECONOMY_CONFIG[item.config].cost}</span>`;
      b.addEventListener('mouseenter',()=>this.center.textContent=this.itemUnlocked(item)?item.name:`${item.name} · ночь ${item.night}`);b.addEventListener('focus',()=>this.center.textContent=this.itemUnlocked(item)?item.name:`${item.name} · ночь ${item.night}`);b.addEventListener('click',()=>this.place(item));item.button=b;this.menu.appendChild(b);
    });
    this.menu.addEventListener('pointerdown',e=>e.stopPropagation());this.menu.addEventListener('pointermove',e=>e.stopPropagation());
    document.body.append(this.wallet,this.feedback,this.menu);this.updateBalance();
  }
  enabled(){return gameState.get().phase==='PREPARATION'&&!this.game.editor.active&&!this.game.story.dialog&&!this.game.sceneManager.awaitingPreset&&!this.game.paused;}
  updateBalance(){this.wallet.querySelector('span').textContent=Number.isFinite(gameState.get().seeds)?Math.floor(gameState.get().seeds):'∞';this.refreshMenu();}
  availableNight(){const state=gameState.get();return Math.min(5,Math.max(1,state.phase==='WAVE_ACTIVE'?state.wave:state.wave+1));}
  itemUnlocked(item){return this.availableNight()>=item.night;}
  refreshMenu(){if(!this.menu)return;for(const item of ITEMS){const locked=!this.itemUnlocked(item),poor=gameState.get().seeds<ECONOMY_CONFIG[item.config].cost,b=item.button;b.disabled=locked||poor||!this.models.has(item.key);b.classList.toggle('locked',locked);b.classList.toggle('no-money',poor);b.querySelector('.build-lock').hidden=!locked;b.querySelector('.unlock-night').textContent=locked?`Н${item.night}`:'';b.title=locked?`${item.name} — откроется к ночи ${item.night}`:item.name;b.querySelector('.build-cost').hidden=locked;b.setAttribute('aria-label',`${item.name}: ${locked?`откроется к ночи ${item.night}`:poor?'недостаточно монет':ECONOMY_CONFIG[item.config].cost+' монет'}`);}}
  move(e){
    if(this.menuOpen)return;
    const rect=this.game.sceneManager.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);this.pointerValid=true;
  }
  valid(point){
    const player=this.game.player.getPosition(),limit=this.game.boundLimit;
    if(Math.hypot(point.x-player.x,point.z-player.z)>4||Math.hypot(point.x-player.x,point.z-player.z)<.75)return false;
    if(Math.abs(point.x)>limit-.5||Math.abs(point.z)>limit-.5||this.game.decorations.isBlocked(point.x,point.z,.45))return false;
    return !this.placed.some(p=>Math.hypot(p.position.x-point.x,p.position.z-point.z)<.9);
  }
  down(e){
    if(e.button!==0||this.menuOpen)return;
    if(gameState.get().phase==='WAVE_ACTIVE'&&!this.game.paused&&!this.game.editor.active&&!this.game.story.dialog){this.move(e);this.ray.setFromCamera(this.pointer,this.game.sceneManager.camera);const hit=this.ray.intersectObjects(this.placed,true)[0];let obj=hit?.object;while(obj?.parent&&!this.placed.includes(obj))obj=obj.parent;if(obj&&this.placed.includes(obj))this.game.combat.activate(obj);return;}
    if(!this.enabled())return;
    this.move(e);this.ray.setFromCamera(this.pointer,this.game.sceneManager.camera);
    const hovered=this.findHovered();
    if(hovered){e.preventDefault();this.remove(hovered);return;}
    if(!this.ray.ray.intersectPlane(this.plane,this.point))return;
    if(!this.valid(this.point)){this.feedback.textContent='Выбери свободное место рядом с Агатой';return;}
    e.preventDefault();this.menuPoint.copy(this.point);this.menuOpen=true;this.game.audio.cue('choose');this.menu.hidden=false;this.center.textContent='Выбери ловушку';
    const radius=window.innerWidth<=600?145:205;
    const margin=Math.min(radius,window.innerWidth/2),vert=Math.min(radius,window.innerHeight/2);
    this.menu.style.left=`${Math.max(margin,Math.min(window.innerWidth-margin,e.clientX))}px`;this.menu.style.top=`${Math.max(vert,Math.min(window.innerHeight-vert,e.clientY))}px`;this.refreshMenu();
  }
  close(){this.menuOpen=false;this.menu.hidden=true;}
  key(e){
    if(e.key==='Escape'&&this.menuOpen){e.preventDefault();e.stopImmediatePropagation();this.close();return;}
    if(this.enabled()&&!e.repeat&&e.code==='KeyR'&&!/INPUT|TEXTAREA/.test(e.target.tagName)){if(this.hovered)this.hovered.userData.rotationTarget=(this.hovered.userData.rotationTarget??this.hovered.rotation.y)+Math.PI/4;else this.angle=(this.angle+Math.PI/4)%(2*Math.PI);this.feedback.textContent='Направление повёрнуто';}
  }
  place(item){
    const model=this.models.get(item.key),cost=ECONOMY_CONFIG[item.config].cost;
    if(!this.enabled()||!this.itemUnlocked(item)||!model||gameState.get().seeds<cost||!this.valid(this.menuPoint)){this.feedback.textContent='Не удалось построить: проверь место и монеты';this.close();return;}
    const object=model.clone();object.position.copy(this.menuPoint);object.position.y=0;object.rotation.y=this.angle;this.game.sceneManager.scene.add(object);this.placed.push(object);
    const outline=new THREE.Group();outline.matrixAutoUpdate=false;

    outline.visible=false;this.outlineScene.add(outline);object.userData.outline=outline;object.userData.key=item.key;object.userData.cost=cost;object.userData.trapId=crypto.randomUUID();
    gameState.update({seeds:gameState.get().seeds-cost,placedTraps:[...gameState.get().placedTraps,{id:object.userData.trapId,type:item.key,x:object.position.x,z:object.position.z,rotation:this.angle}]});
    this.game.sceneManager.moonLight.shadow.needsUpdate=true;this.feedback.textContent=`Построено: ${item.name}`;this.close();
    this.game.audio.cue('drop',object.position);this.game.audio.action(this.game.player.getPosition());
  }
  findHovered(){
    const player=this.game.player.getPosition();
    const hit=this.ray.intersectObjects(this.placed,true)[0];
    let object=hit?.object;while(object?.parent&&!this.placed.includes(object))object=object.parent;
    if(this.placed.includes(object)&&Math.hypot(object.position.x-player.x,object.position.z-player.z)<=4)return object;
    const ground=new THREE.Vector3();
    if(this.hovered&&this.ray.ray.intersectPlane(this.plane,ground)&&Math.hypot(ground.x-this.hovered.position.x,ground.z-this.hovered.position.z)<1.05&&Math.hypot(this.hovered.position.x-player.x,this.hovered.position.z-player.z)<=4)return this.hovered;
    return null;
  }
  setHovered(object){if(!object)this.outlinePath.setAttribute('d','');if(this.hovered===object)return;if(this.hovered)this.hovered.userData.outline.visible=false;this.hovered=object;if(object)object.userData.outline.visible=true;else this.feedback.textContent='ЛКМ — построить · R — повернуть';}
  consume(object){
    if(!this.placed.includes(object))return;
    this.game.audio.stopEntry(object.userData.audioLoop);
    this.game.combat?.fx.destroy(object);
    if(this.hovered===object)this.setHovered(null);
    this.game.sceneManager.scene.remove(object);this.outlineScene.remove(object.userData.outline);this.placed.splice(this.placed.indexOf(object),1);
    gameState.update({placedTraps:gameState.get().placedTraps.filter(t=>t.id!==object.userData.trapId)});
    this.game.sceneManager.moonLight.shadow.needsUpdate=true;
  }
  clearAfterWave(){
    this.setHovered(null);
    for(const trap of this.placed){
      this.game.audio.stopEntry(trap.userData.audioLoop);
      if(trap.userData.timerEl)trap.userData.timerEl.remove();
      this.game.sceneManager.scene.remove(trap);
      if(trap.userData.outline)this.outlineScene.remove(trap.userData.outline);
    }
    this.placed.length=0;
    for(const icon of this.manualIcons.values())icon.remove();
    this.manualIcons.clear();this.outlinePath.setAttribute('d','');
    gameState.update({placedTraps:[]});
    this.game.sceneManager.moonLight.shadow.needsUpdate=true;
  }
  remove(object){
    this.game.audio.stopEntry(object.userData.audioLoop);
    this.game.combat?.fx.destroy(object);
    this.setHovered(null);this.game.sceneManager.scene.remove(object);this.outlineScene.remove(object.userData.outline);this.placed.splice(this.placed.indexOf(object),1);
    gameState.update({seeds:gameState.get().seeds+(object.userData.cost||0),placedTraps:gameState.get().placedTraps.filter(t=>t.id!==object.userData.trapId)});
    this.game.sceneManager.moonLight.shadow.needsUpdate=true;this.feedback.textContent='Ловушка убрана';
    this.game.audio.cue('choose',object.position);
  }
  renderOutline(renderer,camera){
    if(!this.hovered||!this.hovered.userData.outline.visible){this.outlinePath.setAttribute('d','');return;}
    const points=[],v=new THREE.Vector3();this.hovered.updateWorldMatrix(true,true);
    this.hovered.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;let vertices=this.outlinePoints.get(mesh.geometry);
      if(!vertices){vertices=[];const seen=new Set(),pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);const key=[v.x,v.y,v.z].map(x=>Math.round(x*1000)).join(',');if(!seen.has(key)){seen.add(key);vertices.push(v.clone());}}this.outlinePoints.set(mesh.geometry,vertices);}
      for(const point of vertices){v.copy(point).applyMatrix4(mesh.matrixWorld).project(camera);if(v.z>=-1&&v.z<=1)points.push({x:Math.round((v.x*.5+.5)*innerWidth*2)/2,y:Math.round((-v.y*.5+.5)*innerHeight*2)/2});}
    });
    points.sort((a,b)=>a.x-b.x||a.y-b.y);if(points.length<3)return;
    const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x),lower=[],upper=[];
    for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
    for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
    lower.pop();upper.pop();const hull=lower.concat(upper);this.outlinePath.setAttribute('d',hull.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+'Z');
  }
  update(dt=1/60){
    for(const [trap,icon] of this.manualIcons)if(!this.placed.includes(trap)){icon.remove();this.manualIcons.delete(trap);}
    for(const trap of this.placed){
      const manual=['packet','log','flamethrower','cannon'].includes(trap.userData.key)&&!trap.userData.triggered;
      let icon=this.manualIcons.get(trap);if(manual&&!icon){icon=document.createElement('div');icon.className='manual-trap-icon';icon.innerHTML='<img src="./assets/icons/trap-lightning.svg" alt="">';document.body.append(icon);this.manualIcons.set(trap,icon);}
      if(icon){const v=trap.position.clone();v.y+=1.8;v.project(this.game.sceneManager.camera);icon.style.display=manual&&!this.game.editor.active&&v.z<1?'':'none';icon.style.left=`${(v.x*.5+.5)*innerWidth}px`;icon.style.top=`${(-v.y*.5+.5)*innerHeight}px`;}
    }
    for(const trap of this.placed){const target=trap.userData.rotationTarget;if(target!==undefined&&!trap.userData.rolling&&this.enabled()){const difference=target-trap.rotation.y;trap.rotation.y+=difference*(1-Math.exp(-18*dt));if(Math.abs(difference)>.001)this.game.sceneManager.moonLight.shadow.needsUpdate=true;}}
    if(!this.hovered)this.outlinePath.setAttribute('d','');
    const enabled=this.enabled();this.wallet.hidden=this.game.editor.active;this.feedback.hidden=!enabled;
    if(!enabled){this.marker.visible=false;this.setHovered(null);if(this.menuOpen)this.close();return;}
    if(!this.pointerValid){this.marker.visible=false;this.setHovered(null);return;}
    this.ray.setFromCamera(this.pointer,this.game.sceneManager.camera);
    this.setHovered(this.menuOpen?null:this.findHovered());
    if(this.hovered){this.marker.visible=false;this.feedback.textContent='ЛКМ — убрать ловушку';return;}
    if(!this.menuOpen&&!this.ray.ray.intersectPlane(this.plane,this.point)){this.marker.visible=false;return;}
    const p=this.menuOpen?this.menuPoint:this.point,valid=this.valid(p);this.marker.position.set(p.x,.12,p.z);this.marker.rotation.y=this.angle;this.marker.visible=true;
    const color=valid?0xe9d39b:0xd45d51;this.ring.material.color.setHex(color);this.cross.material.color.setHex(color);
  }
}
