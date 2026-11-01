import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const TYPES = [
  ['select','↖ Выбор'],['grass','Трава'],['bush','Куст'],['pumpkin','Тыква'],['jack','Тыква-светильник'],
  ['candles','Свечи'],['lamppost','Фонарь'],['broadleaf','Дерево'],['pine','Сосна'],['tall','Высокое дерево'],
  ['bare','Сухое дерево'],['cave','Пещера'],['fence','Железный забор'],['stoneFence','Каменный забор'],['pillar','Столб'],['cameraPillar','Столб с камерой'],['church','Храм']
];

export class MapEditor {
  constructor(game) {
    this.game=game;this.active=false;this.ready=false;this.mode='select';this.selected=null;this.dragging=false;this.stroke=null;this.fenceStart=null;this.fenceEnd=null;this.fenceAngle=0;this.erasing=false;this.lastErase=null;
    this.focus=new THREE.Vector3();this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.point=new THREE.Vector3();
    this.light=new THREE.AmbientLight(0xffffff,1.05);this.light.visible=false;game.sceneManager.scene.add(this.light);
    const marker=new THREE.Mesh(new THREE.RingGeometry(0.32,0.37,32),new THREE.MeshBasicMaterial({color:0xffd473,transparent:true,opacity:0.85,depthTest:false}));
    marker.rotation.x=-Math.PI/2;marker.position.y=0.06;marker.renderOrder=100;marker.visible=false;game.sceneManager.scene.add(marker);this.marker=marker;
    const guideGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
    this.guide=new THREE.Line(guideGeometry,new THREE.LineBasicMaterial({color:0xffce78,depthTest:false}));
    this.guide.renderOrder=101;this.guide.visible=false;game.sceneManager.scene.add(this.guide);
    this.buildUI();
    game.decorations.ready.then(()=>{this.ready=true;this.status.textContent='Выбери объект или инструмент.';}).catch(()=>{this.status.textContent='Ошибка загрузки объектов.';});
    const canvas=game.sceneManager.renderer.domElement;
    canvas.addEventListener('pointerdown',e=>this.down(e));
    canvas.addEventListener('contextmenu',e=>{if(this.active)e.preventDefault();});
    window.addEventListener('pointermove',e=>this.move(e));
    window.addEventListener('pointerup',e=>this.finish(e));
    window.addEventListener('keydown',e=>this.key(e));
  }
  buildUI() {
    const css=document.createElement('style');css.textContent=`
      #map-editor{position:fixed;z-index:100;top:14px;left:14px;width:260px;max-height:calc(100vh - 28px);overflow:auto;background:rgba(20,18,27,.96);color:#f2eadb;border:1px solid #62564c;border-radius:12px;padding:14px;font:13px/1.4 system-ui;box-shadow:0 10px 35px #0009;user-select:none}
      #map-editor[hidden]{display:none} #map-editor h2{font-size:17px;margin:0 0 5px} #map-editor p{color:#bdb3aa;margin:4px 0 10px} #map-editor .tools{display:grid;grid-template-columns:1fr 1fr;gap:5px}
      #map-editor button,#map-editor input{font:inherit;color:#f1e7d8;background:#34303a;border:1px solid #64585a;border-radius:6px;padding:7px;cursor:pointer} #map-editor button:hover,#map-editor button.active{background:#735b47;border-color:#d4ae79}
      #map-editor .settings{margin:8px 0;padding:8px;background:#29252e;border-radius:7px} #map-editor .settings label{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:5px 0} #map-editor .settings input[type=range]{width:115px;padding:0} #map-editor .actions{display:grid;gap:5px;margin-top:10px} #map-editor .actions button{width:100%} #map-editor .row{display:flex;gap:6px;margin:8px 0;align-items:center} #map-editor input[type=number]{width:76px;cursor:text;user-select:text} #map-editor small{display:block;color:#c5b9ab;margin-top:8px} #map-editor .primary{background:#725037}
    `;document.head.appendChild(css);
    this.panel=document.createElement('section');this.panel.id='map-editor';this.panel.hidden=true;
    this.panel.innerHTML=`<h2>Редактор карты</h2><p>Tab — открыть / закрыть · WASD — камера · колёсико — масштаб</p><details class="settings"><summary>Размер карты и освещение</summary><label>Размер карты <input data-setting="mapSize" type="number" min="16" max="80" step="1"></label><label>Общий свет <input data-setting="ambient" type="range" min="0" max="2" step="0.01"></label><label>Свет неба <input data-setting="sky" type="range" min="0" max="2" step="0.01"></label><label>Лунный свет <input data-setting="moon" type="range" min="0" max="2" step="0.01"></label><label>Яркость сцены <input data-setting="exposure" type="range" min="0.2" max="2" step="0.01"></label></details><div class="tools"></div><p class="status">Загрузка объектов…</p><div class="row"><label>Размер <input class="size" type="number" min="0.1" max="5" step="0.1" value="1"></label><button class="rotate">↻ 90°</button><button class="delete">Удалить</button></div><div class="actions"><button class="save">Сохранить черновик</button><button class="draft">Открыть черновик</button><button class="load">Загрузить JSON</button><button class="publish primary">Опубликовать: скачать JSON</button></div><small>Выбор — перетаскивание. ЛКМ — рисовать / ставить, ПКМ — стирать выбранный тип. Забор: протяни несколько секций. R поворачивает. map.json положи в папку assets и закоммить.</small><input class="file" type="file" accept="application/json,.json" hidden>`;
    document.body.appendChild(this.panel);this.status=this.panel.querySelector('.status');this.size=this.panel.querySelector('.size');
    this.syncSettings();
    this.panel.querySelectorAll('[data-setting]').forEach(input=>input.addEventListener(input.type==='number'?'change':'input',()=>{
      if(input.value!=='')this.game.applySettings({[input.dataset.setting]:Number(input.value)});
    }));
    const tools=this.panel.querySelector('.tools');
    for(const [id,label] of TYPES){const b=document.createElement('button');b.textContent=label;b.dataset.mode=id;b.classList.toggle('active',id===this.mode);b.onclick=()=>{this.mode=id;tools.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));this.selected=null;this.marker.visible=false;this.status.textContent=id==='select'?'Нажми на объект и перетащи.':id==='grass'?'Зажми мышь и рисуй траву.':(id==='fence'||id==='stoneFence')?'Нажми для одной секции или протяни линию. R — повернуть.':'Нажми на землю, чтобы добавить.';};tools.appendChild(b);}
    this.size.onchange=()=>{if(this.selected)this.mutate({scale:Math.max(0.1,Math.min(5,Number(this.size.value)||1))});};
    this.panel.querySelector('.rotate').onclick=()=>{if(this.mode==='fence'||this.mode==='stoneFence'){this.fenceAngle=(this.fenceAngle+Math.PI/2)%Math.PI;this.status.textContent='Направление забора изменено.';}else this.rotate();};this.panel.querySelector('.delete').onclick=()=>this.remove();
    this.panel.querySelector('.save').onclick=()=>{try{localStorage.setItem('sibejam-map-draft',JSON.stringify(this.game.decorations.snapshot()));this.status.textContent='Черновик сохранён в этом браузере.';}catch(e){this.status.textContent='Не удалось сохранить черновик.';}};
    this.panel.querySelector('.draft').onclick=()=>{try{const raw=localStorage.getItem('sibejam-map-draft');if(!raw)throw Error('Нет черновика');this.load(JSON.parse(raw));}catch(e){this.status.textContent=e.message;}};
    const file=this.panel.querySelector('.file');this.panel.querySelector('.load').onclick=()=>file.click();file.onchange=async()=>{try{if(file.files[0])this.load(JSON.parse(await file.files[0].text()));}catch(e){this.status.textContent='Не удалось прочитать JSON карты.';}file.value='';};
    this.panel.querySelector('.publish').onclick=()=>{const blob=new Blob([JSON.stringify(this.game.decorations.snapshot(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='map.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.status.textContent='Скачано! Замени assets/map.json и закоммить.';};
  }
  syncSettings(){if(this.panel)this.panel.querySelectorAll('[data-setting]').forEach(input=>{input.value=this.game.settings[input.dataset.setting];});}
  load(data){this.game.decorations.applyMap(data);this.syncSettings();this.selected=null;this.marker.visible=false;this.status.textContent='Карта загружена.';}
  toggle(){if(!this.ready){this.status.textContent='Подожди, объекты ещё загружаются.';return;}this.active=!this.active;this.panel.hidden=!this.active;this.light.visible=this.active;this.marker.visible=this.active&&!!this.selected;if(this.active){this.game.decorations.clearBatches();this.focus.copy(this.game.player.getPosition());this.game.input.keys.clear();}else{this.game.decorations.buildBatches();this.dragging=false;this.stroke=null;this.fenceStart=null;this.erasing=false;this.lastErase=null;this.guide.visible=false;this.game.input.keys.clear();} }
  key(e){if(this.game.story?.dialog || (!this.active && this.game.story && this.game.story.gameStatePhaseIsBattle?.()))return;if(e.key==='Tab' && !e.repeat && !/INPUT|TEXTAREA/.test(e.target.tagName)){e.preventDefault();this.toggle();return;}if(!this.active || /INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();this.remove();}if(e.key.toLowerCase()==='r'){if(this.mode==='fence'||this.mode==='stoneFence'){this.fenceAngle=(this.fenceAngle+Math.PI/2)%Math.PI;this.status.textContent='Направление забора изменено.';}else this.rotate();}if(e.key==='Escape'){this.selected=null;this.marker.visible=false;}}
  rayAt(e){const rect=this.game.sceneManager.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);this.ray.setFromCamera(this.pointer,this.game.sceneManager.camera);return this.ray.ray.intersectPlane(this.plane,this.point);}
  down(e){
    if(!this.active||!this.ready||!this.rayAt(e))return;
    if(e.button===2 && this.mode!=='select'){
      e.preventDefault();this.erasing=true;this.lastErase=null;this.eraseAt(this.point.x,this.point.z);return;
    }
    if(e.button!==0)return;
    e.preventDefault();const d=this.game.decorations;
    if(this.mode!=='select'){const limit=this.game.map.halfField-0.5;this.point.x=THREE.MathUtils.clamp(this.point.x,-limit,limit);this.point.z=THREE.MathUtils.clamp(this.point.z,-limit,limit);}
    if(this.mode==='grass') {
      this.dragging=true;this.stroke=null;this.paintAt(this.point.x,this.point.z);return;
    }
    if(this.mode==='fence'||this.mode==='stoneFence') {
      const snap=this.snapFenceEndpoint(this.point);this.dragging=true;this.fenceStart=snap.point;this.fenceStartConnected=snap.connected;this.fenceEnd=this.point.clone();this.guide.visible=true;this.updateGuide();return;
    }
    if(this.mode!=='select'){
      const entry=d.addEditable(this.mode);if(!entry){this.status.textContent='Этот объект пока нельзя добавить.';return;}
      entry.object.position.set(this.point.x,0,this.point.z);d.syncCollider(entry);this.status.textContent='Поставлено. Нажми ещё раз, чтобы добавить.';return;
    }
    const hits=this.ray.intersectObjects(d.group.children,true);
    for(const hit of hits){
      if((hit.object===d.grassMesh||hit.object===d.paintedGrass) && hit.instanceId!==undefined){this.selected={grass:hit.instanceId,painted:hit.object===d.paintedGrass};this.showSelection();this.dragging=true;return;}
      let obj=hit.object;while(obj && obj!==d.group && !obj.userData.editorId)obj=obj.parent;
      if(obj?.userData.editorId){const entry=d.editable.find(x=>x.id===obj.userData.editorId&&x.object.visible);if(entry){this.selected={entry};this.showSelection();this.dragging=true;return;}}
    }
    this.selected=null;this.marker.visible=false;this.status.textContent='Выбери объект или инструмент.';
  }
  grassState(){const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();(this.selected.painted?this.game.decorations.paintedGrass:this.game.decorations.grassMesh).getMatrixAt(this.selected.grass,m);m.decompose(p,q,sc);return {x:p.x,z:p.z,rotation:new THREE.Euler().setFromQuaternion(q).y,scale:sc.x};}
  showSelection(){if(!this.selected)return;const data=this.selected.entry?{x:this.selected.entry.object.position.x,z:this.selected.entry.object.position.z,scale:this.selected.entry.object.scale.x}:this.grassState();this.marker.position.set(data.x,0.06,data.z);this.marker.visible=this.active;this.size.value=Math.round(data.scale*100)/100;this.status.textContent='Объект выбран. Перетащи, поверни или удали.';}
  move(e){
    if(!this.active||(!this.dragging&&!this.erasing)||!this.rayAt(e))return;
    if(this.erasing){this.eraseAt(this.point.x,this.point.z);return;}
    if(this.mode==='grass'){this.paintAt(this.point.x,this.point.z);return;}
    if(this.fenceStart){this.fenceEnd.copy(this.point);this.updateGuide();return;}
    const limit=this.game.map.halfField-0.5;
    if(this.selected)this.mutate({x:THREE.MathUtils.clamp(this.point.x,-limit,limit),z:THREE.MathUtils.clamp(this.point.z,-limit,limit)});
  }
  eraseAt(x,z){
    const d=this.game.decorations, radius=0.5, previous=this.lastErase;
    const distance=previous?Math.hypot(x-previous.x,z-previous.y):0;
    const steps=previous?Math.max(1,Math.ceil(distance/(radius*0.6))):1;
    const spots=[];
    for(let i=1;i<=steps;i++) spots.push({x:previous?THREE.MathUtils.lerp(previous.x,x,i/steps):x,z:previous?THREE.MathUtils.lerp(previous.y,z,i/steps):z});
    const nearby=(px,pz)=>spots.some(p=>Math.hypot(px-p.x,pz-p.z)<radius);
    let removed=0;
    if(this.mode==='grass'){
      const matrix=new THREE.Matrix4();
      for(const [mesh,painted] of [[d.grassMesh,false],[d.paintedGrass,true]]){
        if(!mesh)continue;
        for(let i=0;i<mesh.count;i++){
          mesh.getMatrixAt(i,matrix);const m=matrix.elements;
          if(Math.hypot(m[0],m[1],m[2])>0.001&&nearby(m[12],m[14])){
            d.setGrass(i,{x:m[12],z:m[14],rotation:0,scale:0},painted);removed++;
            if(this.selected?.grass===i&&!!this.selected.painted===painted){this.selected=null;this.marker.visible=false;}
          }
        }
      }
    }
    const matches=type=>type===this.mode || (this.mode==='fence'&&type==='fenceSection') || (this.mode==='stoneFence'&&type==='stoneFenceSection');
    // Ray hits allow deleting long fences directly at the point under the cursor.
    const hitIds=new Set();
    if(this.mode!=='grass') for(const hit of this.ray.intersectObjects(d.group.children,true)){
      let object=hit.object;while(object&&object!==d.group&&!object.userData.editorId)object=object.parent;
      if(object?.userData.editorId)hitIds.add(object.userData.editorId);
    }
    for(const entry of d.editable){
      if(entry.object.visible&&matches(entry.type)&&(nearby(entry.object.position.x,entry.object.position.z)||hitIds.has(entry.id))){
        entry.object.visible=false;d.syncCollider(entry);removed++;
        if(this.selected?.entry===entry){this.selected=null;this.marker.visible=false;}
      }
    }
    this.lastErase=new THREE.Vector2(x,z);
    this.status.textContent=removed?'Удалено объектов: '+removed+'.':'ПКМ: проведи по объектам выбранного типа.';
  }
  paintAt(x,z){
    const step=0.32, last=this.stroke;
    const distance=last?Math.hypot(x-last.x,z-last.z):0;
    if(last && distance<step)return;
    const count=last?Math.ceil(distance/step):1;
    for(let i=1;i<=count;i++) {
      const t=last?i/count:1,cx=last?THREE.MathUtils.lerp(last.x,x,t):x,cz=last?THREE.MathUtils.lerp(last.z,z,t):z;
      for(let j=0;j<3;j++){
        const angle=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*0.32;
        const px=cx+Math.cos(angle)*r,pz=cz+Math.sin(angle)*r;
        const limit=this.game.map.halfField-0.5;
        if(Math.abs(px)<=limit&&Math.abs(pz)<=limit && !this.game.decorations.isBlocked(px,pz,0.08)) this.game.decorations.paintGrass(px,pz);
      }
    }
    this.stroke=new THREE.Vector2(x,z);
    this.status.textContent='Рисуешь траву. Выбор — чтобы двигать отдельные пучки.';
  }
  snapFenceEndpoint(point,threshold=1.5){
    const d=this.game.decorations,stone=this.mode==='stoneFence';
    let best=threshold,pointResult=point.clone(),connected=false;
    for(const entry of d.editable){
      if(!entry.object.visible)continue;
      const type=entry.type;
      if(stone ? !(type==='stoneFence'||type==='stoneFenceSection') : !(type==='fence'||type==='fenceSection'))continue;
      const object=entry.object,section=type.endsWith('Section');
      let half;
      if(section) half=(stone?26/16:2)/2*object.scale.x;
      else if(entry.colliderBase) half=(Math.max(entry.colliderBase.halfX,entry.colliderBase.halfZ)-(stone?0.125:0.03))*(object.scale.x/entry.colliderBase.scale);
      else continue;
      const vx=Math.cos(object.rotation.y),vz=-Math.sin(object.rotation.y);
      for(const side of [-1,1]){
        const x=object.position.x+side*half*vx,z=object.position.z+side*half*vz;
        const dist=Math.hypot(point.x-x,point.z-z);
        if(dist<best){best=dist;pointResult.set(x,0,z);connected=true;}
      }
    }
    return {point:pointResult,connected};
  }
  fencePlan(){
    const dx=this.fenceEnd.x-this.fenceStart.x,dz=this.fenceEnd.z-this.fenceStart.z;
    const dragged=Math.hypot(dx,dz)>0.35;
    const alongZ=dragged?Math.abs(dz)>Math.abs(dx):Math.abs(Math.sin(this.fenceAngle))>0.5;
    const length=alongZ?dz:dx,span=this.mode==='stoneFence'?26/16:2;
    const count=Math.min(15,Math.max(1,Math.round(Math.abs(length)/span)));
    const sign=length<0?-1:1,end=this.fenceStart.clone();
    if(alongZ)end.z+=sign*count*span;else end.x+=sign*count*span;
    const endConnected=this.snapFenceEndpoint(end,0.08).connected;
    return {alongZ,sign,count,span,end,endConnected};
  }
  updateGuide(){
    const plan=this.fencePlan(),positions=this.guide.geometry.attributes.position;
    positions.setXYZ(0,this.fenceStart.x,0.15,this.fenceStart.z);positions.setXYZ(1,plan.end.x,0.15,plan.end.z);positions.needsUpdate=true;
    this.status.textContent=`Секций: ${plan.count}. ${this.fenceStartConnected?'Привязано к столбику. ':'Отпусти мышь, чтобы построить.'}`;
  }
  finish(e){
    if(e?.button===2){this.erasing=false;this.lastErase=null;return;}
    if(this.active&&this.dragging&&this.fenceStart){
      const plan=this.fencePlan(),type=this.mode==='stoneFence'?'stoneFenceSection':'fenceSection';
      for(let i=0;i<plan.count;i++){
        const atStart=i>0||this.fenceStartConnected,atEnd=i===plan.count-1&&plan.endConnected;
        // Local X always grows towards +X or +Z; a reversed run meets its previous post on the right.
        const joinLeft=plan.sign>0?atStart:atEnd,joinRight=plan.sign<0?atStart:atEnd;
        const entry=this.game.decorations.addFenceSection(type,undefined,joinLeft,joinRight);if(!entry)break;
        const offset=plan.sign*(i+0.5)*plan.span;
        entry.object.position.set(this.fenceStart.x+(plan.alongZ?0:offset),0,this.fenceStart.z+(plan.alongZ?offset:0));
        entry.object.rotation.y=plan.alongZ?-Math.PI/2:0;this.game.decorations.syncCollider(entry);
      }
      this.status.textContent=`Построено секций: ${plan.count}. Начни следующую линию у крайнего столбика.`;
    }
    this.dragging=false;this.stroke=null;this.fenceStart=null;this.fenceEnd=null;this.guide.visible=false;
  }
  mutate(change){if(!this.selected)return;const d=this.game.decorations;if(this.selected.entry){const entry=this.selected.entry,o=entry.object;if(change.x!==undefined)o.position.x=change.x;if(change.z!==undefined)o.position.z=change.z;if(change.scale!==undefined)o.scale.setScalar(change.scale);if(change.rotation!==undefined)o.rotation.y=change.rotation;d.syncCollider(entry);}else{const state={...this.grassState(),...change};d.setGrass(this.selected.grass,state,!!this.selected.painted);}this.showSelection();}
  rotate(){if(!this.selected)return;const rotation=this.selected.entry?this.selected.entry.object.rotation.y:this.grassState().rotation;this.mutate({rotation:rotation+Math.PI/2});}
  remove(){if(!this.selected)return;if(this.selected.entry){this.selected.entry.object.visible=false;this.game.decorations.syncCollider(this.selected.entry);}else this.mutate({scale:0});this.selected=null;this.marker.visible=false;this.status.textContent='Объект удалён.';}
  update(dt,input){if(!this.active)return;const speed=9*dt,limit=this.game.map.halfField-1;const camAngle=this.game.sceneManager?.cameraAngle??(Math.PI/4);const sinA=Math.sin(camAngle),cosA=Math.cos(camAngle);const dx=(input.screenX*cosA-input.screenY*sinA)*speed;const dz=(-input.screenX*sinA-input.screenY*cosA)*speed;this.focus.x=THREE.MathUtils.clamp(this.focus.x+dx,-limit,limit);this.focus.z=THREE.MathUtils.clamp(this.focus.z+dz,-limit,limit);}
}
