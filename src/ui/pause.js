export class PauseMenu {
  constructor(game){
    this.game=game;
    const style=document.createElement('style');style.textContent=`
      #pause-menu{position:fixed;inset:0;z-index:190;display:grid;place-items:center;background:#08070de8;padding:20px;color:#f2e5cb}
      #pause-menu[hidden]{display:none}#pause-menu .card{width:min(780px,100%);max-height:95vh;overflow:auto;padding:28px 32px;background:#211b21;border:1px solid #a78a5e;box-shadow:0 15px 70px #000;text-align:center}
      #pause-menu h1{font-size:38px;margin:0 0 10px}#pause-menu h2{font-size:25px;margin:10px 0}#pause-menu .options{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      #pause-menu button{cursor:pointer;background:#332c30;color:#f3dfb7;border:1px solid #796647;padding:12px;font-size:24px}#pause-menu .options button{min-height:105px}#pause-menu button:hover,#pause-menu button.active,#pause-menu button:focus-visible{background:#594537;border-color:#e3bd7d}
      #pause-menu small{display:block;font-size:16px;color:#c6b59a;margin-top:5px}#pause-menu .volume{display:grid;grid-template-columns:120px 1fr 48px;align-items:center;gap:12px;margin:9px auto;font-size:22px;max-width:480px;text-align:left}#pause-menu input{width:100%;accent-color:#d2aa6f}#pause-menu .resume{margin-top:15px;min-width:180px}
      @media(max-width:600px){#pause-menu .card{padding:18px}#pause-menu .options{grid-template-columns:1fr}#pause-menu .options button{min-height:50px;padding:5px;font-size:20px}#pause-menu .volume{grid-template-columns:90px 1fr 42px}}
    `;document.head.appendChild(style);
    const settings=document.createElement('button');settings.type='button';settings.setAttribute('aria-label','Настройки');settings.title='Настройки';settings.innerHTML='<svg viewBox="0 0 24 24" width="25" height="25" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94a7.5 7.5 0 0 0 0-1.88l2.03-1.58-1.92-3.32-2.39.96a7.2 7.2 0 0 0-1.63-.94L14.87 3h-3.84l-.36 2.18c-.59.23-1.14.55-1.64.94l-2.39-.96-1.92 3.32 2.03 1.58a7.5 7.5 0 0 0 0 1.88L4.72 14.52l1.92 3.32 2.39-.96c.5.39 1.05.71 1.64.94l.36 2.18h3.84l.36-2.18c.59-.23 1.13-.55 1.63-.94l2.39.96 1.92-3.32zM12.95 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7"/></svg>';settings.style.cssText='position:fixed;top:20px;left:125px;z-index:90;width:50px;height:50px;cursor:pointer;background:#211a20e8;color:#f4dfba;border:1px solid #a78a5e;border-radius:5px';settings.addEventListener('click',()=>this.setPaused(!this.game.paused));document.body.append(settings);
    this.overlay=document.createElement('div');this.overlay.id='pause-menu';this.overlay.hidden=true;
    this.overlay.innerHTML=`<div class="card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><h1 id="pause-title">Пауза</h1><h2>Графика</h2><div class="options"><button data-preset="potato">Картошка<small>60% · без травы и теней</small></button><button data-preset="normal">Нормальный<small>75% · трава и тени</small></button><button data-preset="good">Хороший<small>100% · все эффекты</small></button></div><h2>Звук</h2><label class="volume">Музыка <input type="range" min="0" max="100" aria-label="Громкость музыки" data-channel="music"><output></output></label><label class="volume">Звуки <input type="range" min="0" max="100" aria-label="Громкость звуков" data-channel="effects"><output></output></label><button class="resume">Продолжить</button></div>`;
    document.body.appendChild(this.overlay);
    for(const event of ['pointerdown','pointermove','pointerup','wheel','keydown'])this.overlay.addEventListener(event,e=>e.stopPropagation());
    this.overlay.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{this.game.sceneManager.applyGraphicsPreset(button.dataset.preset);this.game.pauseNeedsRender=true;this.updatePreset();}));
    this.overlay.querySelectorAll('input').forEach(input=>{input.value=Math.round(game.audio.volumes[input.dataset.channel]*100);const update=()=>{game.audio.setVolume(input.dataset.channel,input.value/100);input.nextElementSibling.textContent=`${input.value}%`;};input.addEventListener('input',update);update();});
    this.overlay.querySelector('.resume').addEventListener('click',()=>this.setPaused(false));
    window.addEventListener('keydown',e=>{
      if(e.key!=='Escape'||e.repeat||game.sceneManager.awaitingPreset)return;
      if(game.paused){e.preventDefault();e.stopImmediatePropagation();this.setPaused(false);return;}
      if(game.build.menuOpen){e.preventDefault();e.stopImmediatePropagation();game.build.close();return;}
      e.preventDefault();e.stopImmediatePropagation();this.setPaused(true);
    },true);
  }
  updatePreset(){const g=this.game.sceneManager.graphics;let name=g.renderScale===.6&&!g.grass?'potato':g.renderScale===.75&&g.grass?'normal':g.renderScale===1&&g.grass?'good':'';this.overlay.querySelectorAll('[data-preset]').forEach(b=>{const selected=b.dataset.preset===name;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});}
  setPaused(paused){
    this.game.paused=paused;this.overlay.hidden=!paused;document.body.classList.toggle('game-paused',paused);this.game.input.keys.clear();this.game.input.isShiftPressed=false;this.game.sceneManager.isRotating=false;this.game.sceneManager.renderer.domElement.style.cursor='';this.game.audio.setPaused(paused);this.game.lastTime=performance.now();this.game.nextRenderTime=0;
    if(paused){this.game.build.setHovered(null);this.game.build.marker.visible=false;this.game.pauseNeedsRender=true;this.updatePreset();this.overlay.querySelector('.resume').focus();}
  }
}
