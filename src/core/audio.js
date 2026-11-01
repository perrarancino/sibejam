import {AUDIO_CATALOG} from '../config/audioCatalog.js';
import {gameState} from '../state/gameState.js';
export function spatialMix(source,listener,right={x:1,z:0}){
 const dx=source.x-listener.x,dz=source.z-listener.z,distance=Math.hypot(dx,dz);
 const fade=Math.max(0,1-distance/36);return {gain:fade/(1+(distance/9)**2),pan:distance>.01?Math.max(-1,Math.min(1,(dx*right.x+dz*right.z)/distance)):0,distance};
}
const C=AUDIO_CATALOG;
export const SOUND_GROUPS={
 walkWood:C.player.walkWood,runWood:C.player.runWood,runHeel:C.player.runHeel,runGeneral:C.player.runGeneral,
 action:Object.values(C.player.actions),hurt:[C.player.condition.damage1,C.player.condition.damage2],blood:[C.player.condition.damageBlood],swing:[C.player.hits.swing1,C.player.hits.swing2,C.player.hits.swing3],punch:[C.player.hits.punch],
 crows:C.environment.crowsNormal,crowsAngry:C.environment.crowsAggressive,creaks:C.environment.creaksAndSticks,
 fight:[C.game.phase.fightStart],roar:[C.game.phase.roar],camera:[C.mechanics.cameraSwitch],flash:[C.mechanics.cameraShot],choose:[C.mechanics.inventoryChoose],drop:[C.mechanics.inventoryDrop],
 spikes:[C.mechanics.traps.thorns],mineBeep:[C.mechanics.traps.mine.beep1,C.mechanics.traps.mine.beep2,C.mechanics.traps.mine.beep3],explosion:[C.mechanics.traps.mine.explosion1,C.mechanics.traps.mine.explosion2,C.mechanics.traps.mine.explosion3],
 log:[C.mechanics.traps.log],liquid:[C.mechanics.traps.liquid.balloon1,C.mechanics.traps.liquid.balloon2,C.mechanics.traps.liquid.balloon3],flame:[C.mechanics.traps.flamethrower],electric:C.mechanics.traps.electricFence,dart:[C.mechanics.traps.dart],cannon:[C.mechanics.traps.cannon],
 ...Object.fromEntries(Object.entries(C.enemies).map(([name,files])=>['enemy.'+name,files]))
};
export class GameAudio {
 constructor(game=null){
  this.game=game;this.volumes={music:.3,effects:.05};this.active=new Set();this.paused=false;this.listener={x:0,z:6};this.right={x:1,z:0};this.buffers=new Map();this.preloadQueue=new Set();this.decodeJobs=[];this.decoding=0;this.ambientTime=3;this.voiceTime=0;
  try{const saved=JSON.parse(localStorage.getItem('sibejam-audio-v3')||'null');for(const key of ['music','effects'])if(Number.isFinite(saved?.[key]))this.volumes[key]=Math.max(0,Math.min(1,saved[key]));}catch{}
  this.ready=fetch('./assets/audio/normalization.json').then(r=>{if(!r.ok)throw Error('Нет нормализованного каталога звуков');return r.json();}).then(data=>{this.manifest=data.sounds;return data;});
  this.ready.catch(error=>console.error('Звук:',error));
  const unlock=()=>this.unlock();window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);document.addEventListener('visibilitychange',()=>{if(!this.context)return;if(document.hidden){this.context.suspend();}else if(!this.paused)this.context.resume().then(()=>this.syncMusic(gameState.get().phase)).catch(()=>{});});
  this.previousPhase=gameState.get().phase;this.previousHP=gameState.get().hp;this.musicTrack=null;
  gameState.subscribe(state=>{
   if(state.hp<this.previousHP){this.cue(state.hp<this.previousHP-15?'blood':'hurt',this.game?.player.getPosition());this.action(this.game?.player.getPosition());}
   if(state.phase!==this.previousPhase){if(state.phase==='WAVE_ACTIVE')this.cue('fight');if(state.phase==='WAVE_CLEAR')this.cue('action',this.game?.player.getPosition());this.syncMusic(state.phase);}
   this.previousHP=state.hp;this.previousPhase=state.phase;
  });
 }
 async unlock(){
  if(!this.context){
   const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
   this.context=new Context();this.compressor=this.context.createDynamicsCompressor();this.compressor.threshold.value=-8;this.compressor.knee.value=8;this.compressor.ratio.value=8;this.compressor.attack.value=.003;this.compressor.release.value=.15;this.compressor.connect(this.context.destination);
   this.buses={};for(const channel of ['music','effects']){const bus=this.context.createGain();bus.gain.value=this.volumes[channel];bus.connect(this.compressor);this.buses[channel]=bus;}
   this.musicBuffers=new Map();this.musicNodes=new Set();this.musicRevision=0;
   for(const url of this.preloadQueue)this.loadBuffer(url).catch(()=>{});
  }
  if(!this.paused&&!document.hidden&&this.context.state!=='running')await this.context.resume().catch(()=>{});
  this.syncMusic(gameState.get().phase);
 }
 canonical(url){return url.replace(/^\.\//,'');}
 async loadBuffer(url){
  url=this.canonical(url);if(this.buffers.has(url))return this.buffers.get(url);
  const promise=(async()=>{await this.ready;const record=this.manifest[url];if(!record)throw Error('Неизвестный звук: '+url);
   await new Promise(resolve=>{this.decodeJobs.push(resolve);this.pumpDecodes();});
   try{const response=await fetch('./'+record.url);if(!response.ok)throw Error('Не загружен '+record.url);return await this.context.decodeAudioData(await response.arrayBuffer());}
   finally{this.decoding--;this.pumpDecodes();}
  })();this.buffers.set(url,promise);return promise;
 }
 pumpDecodes(){while(this.decoding<4&&this.decodeJobs.length){this.decoding++;this.decodeJobs.shift()();}}
 preloadEffects(urls){for(const url of urls){this.preloadQueue.add(url);if(this.context)this.loadBuffer(url).catch(error=>console.error(error));}}
 setVolume(channel,value){if(!(channel in this.volumes))return;this.volumes[channel]=Math.max(0,Math.min(1,Number(value)||0));if(this.buses)this.buses[channel].gain.value=this.volumes[channel];try{localStorage.setItem('sibejam-audio-v3',JSON.stringify(this.volumes));}catch{}}
 cue(name,position=null,gain=1,group='effects'){
  const files=SOUND_GROUPS[name];if(!files?.length)return;
  this.sequences??={};const index=this.sequences[name]??Math.floor(Math.random()*files.length);this.sequences[name]=(index+1)%files.length;
  return this.playEffect(files[index%files.length],gain,group,position);
 }
 playEffect(url,gain=1,group='effects',position=null){
  let loop=false;
  if(typeof gain==='object'){const options=gain;gain=options.gain??1;group=options.group??'effects';position=options.position??null;loop=!!options.loop;}
  if(this.paused||gain<=0||!this.context)return null;
  const limit=group==='enemies'?4:group==='ambience'?2:18;if([...this.active].filter(e=>e.group===group).length>=limit||this.active.size>=28)return null;
  const entry={channel:'effects',group,gain,position,started:false,stopped:false,source:null};
  entry.audio={get paused(){return !entry.started||entry.stopped||entry.context.state!=='running';}};entry.context=this.context;this.active.add(entry);
  this.loadBuffer(url).then(buffer=>{
   if(entry.stopped)return;
   const source=this.context.createBufferSource(),volume=this.context.createGain(),pan=this.context.createStereoPanner();source.buffer=buffer;source.loop=loop;source.connect(volume);volume.connect(pan);pan.connect(this.buses.effects);
   Object.assign(entry,{source,gainNode:volume,panner:pan});this.mixEntry(entry,true);source.onended=()=>{entry.stopped=true;this.active.delete(entry);source.disconnect();volume.disconnect();pan.disconnect();};entry.started=true;source.start();
  }).catch(error=>{this.active.delete(entry);console.error('Не воспроизведён звук:',url,error);});
  return entry;
 }
 mixEntry(entry,immediate=false){
  if(!entry.gainNode)return;let mix={gain:1,pan:0};const position=entry.position?.position||entry.position;if(position)mix=spatialMix(position,this.listener,this.right);
  const time=this.context.currentTime;entry.distance=mix.distance||0;entry.effectiveGain=entry.gain*mix.gain*this.volumes[entry.channel];
  if(immediate){entry.gainNode.gain.value=entry.gain*mix.gain;entry.panner.pan.value=mix.pan;}else{entry.gainNode.gain.setTargetAtTime(entry.gain*mix.gain,time,.05);entry.panner.pan.setTargetAtTime(mix.pan,time,.05);}
 }
 loopCue(name,position){const files=SOUND_GROUPS[name];return this.playEffect(files[0],{gain:1,group:'traps',position,loop:true});}
 stopEntry(entry){if(entry&&!entry.stopped){entry.stopped=true;entry.source?.stop();this.active.delete(entry);}}
 stopEffects(group){for(const entry of this.active)if(entry.group===group){entry.stopped=true;entry.source?.stop();this.active.delete(entry);}}
 syncMusic(phase){
  if(!this.context)return;
  const battle=phase==='WAVE_ACTIVE';
  const url=battle?'./assets/audio/music/OldBloodsOldHouse.mp3?v=long-tail-21':'./assets/audio/music/violet.mp3?v=long-tail-21';
  const repeatAt=battle?10.32:15.46;
  if(this.musicTrack!==url){
   this.musicTrack=url;const revision=++this.musicRevision;
   for(const item of this.musicNodes){
    const now=this.context.currentTime;item.gain.gain.cancelScheduledValues(now);item.gain.gain.setValueAtTime(item.gain.gain.value,now);item.gain.gain.linearRampToValueAtTime(0,now+.2);
    try{item.source.stop(now+.22);}catch{}
   }
   this.musicNodes.clear();this.musicBuffer=null;
   if(!this.musicBuffers.has(url)){
    const request=fetch(url).then(response=>{if(!response.ok)throw Error('Не удалось загрузить '+url);return response.arrayBuffer();}).then(data=>this.context.decodeAudioData(data));
    this.musicBuffers.set(url,request);
   }
   this.musicBuffers.get(url).then(buffer=>{
    if(revision!==this.musicRevision)return;
    this.musicBuffer=buffer;this.musicInterval=Math.min(repeatAt,buffer.duration-.05);this.nextMusicStart=this.context.currentTime+.02;this.scheduleMusic();
   }).catch(error=>{if(revision===this.musicRevision){this.musicTrack=null;console.error('Музыка:',error);}});
  }else this.scheduleMusic();
 }
 scheduleMusic(){
  if(!this.musicBuffer||this.paused||document.hidden||this.context.state!=='running')return;
  const now=this.context.currentTime;if(this.nextMusicStart<now-.1)this.nextMusicStart=now+.02;
  while(this.nextMusicStart<now+.4){
   const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.musicBuffer;source.connect(gain);gain.connect(this.buses.music);
   const item={source,gain};this.musicNodes.add(item);source.onended=()=>{this.musicNodes.delete(item);source.disconnect();gain.disconnect();};
   source.start(this.nextMusicStart);this.nextMusicStart+=this.musicInterval;
  }
 }
 setPaused(paused){this.paused=paused;if(this.context){if(paused){this.context.suspend();}else if(!document.hidden){this.context.resume().then(()=>this.syncMusic(gameState.get().phase)).catch(()=>{});}}}
 footstep(position,running){
  const near=this.game?.decorations.editable.find(e=>e.object.visible&&Math.hypot(e.object.position.x-position.x,e.object.position.z-position.z)<3&&['church','fenceSection','fence','stoneFenceSection'].includes(e.type));
  const group=near?.type==='church'?(running?'runHeel':'walkWood'):near?.type==='fence'||near?.type==='fenceSection'?(running?'runWood':'walkWood'):running?'runGeneral':'walkWood';this.cue(group,position,1,'steps');
 }
 update(camera,dt,focus){
  if(focus){this.listener.x=focus.x;this.listener.z=focus.z;}
  const matrix=camera.matrixWorld.elements,len=Math.hypot(matrix[0],matrix[2])||1;this.right={x:matrix[0]/len,z:matrix[2]/len};
  for(const entry of this.active)this.mixEntry(entry);
  this.scheduleMusic();
  this.voiceTime=Math.max(0,this.voiceTime-dt);
  if(!this.context||this.context.state!=='running'||this.paused||!this.game||this.game.editor.active)return;
  this.ambientTime-=dt;if(this.ambientTime<=0){
   const entries=this.game.decorations.editable.filter(e=>e.object.visible&&['bare','tall','pine','broadleaf','bush'].includes(e.type));const entry=entries[Math.floor(Math.random()*entries.length)];
   const position=entry?.object.position||{x:this.listener.x+6,z:this.listener.z-5};const type=Math.random()<.45?'creaks':gameState.get().phase==='WAVE_ACTIVE'?'crowsAngry':'crows';this.cue(type,position,1,'ambience');this.ambientTime=4+Math.random()*6;
  }
 }
 action(position){if(this.voiceTime<=0){this.cue('action',position,1,'voice');this.voiceTime=4;}}
}
