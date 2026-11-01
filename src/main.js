/**
 * Главная точка входа игры (Application Entry Point).
 */
import { GAME_DESIGN } from './config/index.js';
import { gameState } from './state/gameState.js';
import { input } from './core/input.js';
import { SceneManager } from './core/scene.js?v=medium-default-20';
import { GraveyardMap } from './entities/map.js?v=map-settings-1';
import { Player } from './entities/player.js?v=steps-12';
import { Decorations } from './entities/decorations.js?v=grass-preset-1';
import { FogMistManager } from './entities/fogMist.js?v=visibility-1';
import { hud } from './ui/hud.js';
import { MapEditor } from './entities/mapEditor.js?v=editor-tab-1';
import { Story } from './entities/story.js?v=final-four-caves-19';
import { BuildManager } from './entities/build.js?v=wave-cleanup-19';
import { CombatManager } from './entities/combat.js?v=final-four-caves-19';
import { GameAudio } from './core/audio.js?v=tail-loop-21';
import { PauseMenu } from './ui/pause.js?v=settings-icon-13';

// Экспорт в window для удобной отладки в консоли браузера
window.GAME_DESIGN = GAME_DESIGN;
window.GAME_STATE = gameState.get();
window.gameStateManager = gameState;

class Game {
  constructor() {
    const container = document.querySelector('#game-canvas-container');
    this.sceneManager = new SceneManager(container);
    this.sceneManager.game = this;
    this.map = new GraveyardMap(this.sceneManager.scene);
    this.player = new Player(this.sceneManager.scene);
    this.fogMist = new FogMistManager(this.sceneManager.scene, 56);
    this.decorations = new Decorations(this.sceneManager.scene, this.fogMist);
    this.decorations.grassEnabled=this.sceneManager.graphics.grass;
    this.hud = hud;
    this.input = input;
    this.settings={mapSize:this.map.fieldSize,ambient:0.36,sky:0.8,moon:0.74,exposure:1.04};
    this.decorations.getSettings=()=>({...this.settings});
    this.decorations.setSettings=settings=>this.applySettings(settings);
    this.editor = new MapEditor(this);
    this.story = new Story(this);
    this.audio = new GameAudio(this);
    this.player.audio = this.audio;
    this.build = new BuildManager(this);
    this.combat = new CombatManager(this);
    this.paused=false;
    this.pauseMenu=new PauseMenu(this);
    this.sceneManager.onGraphicsChanged=graphics=>this.decorations.setGrassEnabled(graphics.grass,this.editor.active);
    this.decorations.ready.then(()=>{if(!this.editor.active)this.decorations.buildBatches();}).catch(error=>{
      this.decorations.clearBatches();
      console.error('Не удалось собрать оптимизированную сцену:',error);
    });

    // Кнопки зума (если присутствуют)
    document.querySelector('#btn-zoom-in')?.addEventListener('click', () => {
      this.sceneManager.setZoom(this.sceneManager.zoomLevel * 1.15);
    });
    document.querySelector('#btn-zoom-out')?.addEventListener('click', () => {
      this.sceneManager.setZoom(this.sceneManager.zoomLevel / 1.15);
    });

    this.lastTime = performance.now();
    this.simulationTime = this.lastTime;
    this.nextRenderTime = 0;
    document.addEventListener('visibilitychange', () => {
      this.lastTime = performance.now(); this.nextRenderTime = 0;
    });
    window.addEventListener('resize',()=>{if(this.paused)this.pauseNeedsRender=true;});
    this.boundLimit = this.map.getBoundaryLimit(this.player.radius);

    // Первоначальный рендер HUD (если элементы есть)
    this.hud.renderState(gameState.get());

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  applySettings(values) {
    const defaults={mapSize:26,ambient:0.36,sky:0.8,moon:0.74,exposure:1.04};
    const ranges={mapSize:[16,80],ambient:[0,2],sky:[0,2],moon:[0,2],exposure:[0.2,2]};
    for(const key of Object.keys(defaults)) {
      const value=Number(values[key]);
      if(Number.isFinite(value)) this.settings[key]=Math.max(ranges[key][0],Math.min(ranges[key][1],value));
    }
    this.map.setFieldSize(this.settings.mapSize);
    this.boundLimit=this.map.getBoundaryLimit(this.player.radius);
    this.player.group.position.x=Math.max(-this.boundLimit,Math.min(this.boundLimit,this.player.group.position.x));
    this.player.group.position.z=Math.max(-this.boundLimit,Math.min(this.boundLimit,this.player.group.position.z));
    const manager=this.sceneManager;
    manager.ambientLight.intensity=this.settings.ambient;
    manager.skyLight.intensity=this.settings.sky;
    manager.moonLight.intensity=this.settings.moon;
    manager.renderer.toneMappingExposure=this.settings.exposure;
    const shadowExtent=Math.max(25,this.settings.mapSize*0.75);
    Object.assign(manager.moonLight.shadow.camera,{left:-shadowExtent,right:shadowExtent,top:shadowExtent,bottom:-shadowExtent});
    manager.moonLight.shadow.camera.updateProjectionMatrix();
    if(this.editor)this.editor.syncSettings();
  }

  animate(now) {
    requestAnimationFrame(this.animate);
    if (document.hidden) return;
    if(this.paused){
      this.lastTime=now;
      if(this.pauseNeedsRender){this.pauseNeedsRender=false;this.sceneManager.updateShadows(this.player.flashlight,true);this.sceneManager.render();if(!this.editor.active)this.fogMist.renderOverlay(this.sceneManager.renderer,this.sceneManager.camera);}
      return;
    }
    const cap = this.sceneManager.graphics.frameLimit;
    const interval = cap ? 1000 / cap : 0;
    if (interval && now + 0.1 < this.nextRenderTime) return;
    this.nextRenderTime = interval ? now + interval - Math.max(0, Math.min(interval, now - this.nextRenderTime)) : now;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.simulationTime += dt*1000;
    const gameNow=this.simulationTime;

    // Опрос ввода
    const blocked = this.sceneManager.awaitingPreset || !!this.story.dialog || gameState.get().phase === 'WAVE_ACTIVE';
    const inputData = blocked ? { screenX:0, screenY:0, isMoving:false, isRunning:false } : input.getMovementInput();
    if (gameState.get().isRunning !== inputData.isRunning) gameState.update({ isRunning: inputData.isRunning });

    // Обновление состояния персонажа
    if (this.editor.active) this.editor.update(dt, inputData);
    else this.player.update(inputData, this.boundLimit, dt, this.decorations, this.sceneManager.cameraAngle);

    // Обновление анимаций карты (пульсация святыни)
    this.map.update(gameNow);
    if (!this.editor.active && gameState.get().phase === 'WAVE_ACTIVE') {
      const item=this.story.getCameras()[gameState.get().activeCameraIndex];
      const aim=this.story.getCameraAim();
      this.decorations.aimCamera(item,aim,dt);
    }
    this.decorations.update(gameNow, this.player.getPosition(), this.sceneManager.camera);
    this.story.update(gameNow);
    this.combat.update(dt);
    this.build.update(dt);
    const viewTarget = gameState.get().phase === 'WAVE_ACTIVE' ? this.story.cameraTarget() : this.player.getPosition();
    const visibilityChanged = !this.editor.active && this.decorations.updateOptimizedVisibility(viewTarget, gameNow, this.sceneManager.camera);

    // Обновление живой дымки и колышущегося тумана
    const inCameraMode = gameState.get().phase === 'WAVE_ACTIVE';
    this.player.group.visible = !inCameraMode;
    this.fogMist.update(inCameraMode ? this.sceneManager.cameraTarget : this.player.getPosition(), dt, gameNow);

    // Обновление UI (если есть)
    this.hud.updateMovementStatus(inputData.isMoving, inputData.isRunning);

    // Следование камеры за Агатой
    this.sceneManager.updateCameraTracking(this.editor.active ? this.editor.focus : viewTarget, dt);
    this.player.updateFlashlight(this.sceneManager.camera);
    this.audio.update(this.sceneManager.camera,dt,this.sceneManager.cameraTarget);
    this.sceneManager.updateShadows(this.player.flashlight, this.editor.active || visibilityChanged);

    // Отрисовка кадра
    this.sceneManager.render();
    if (!this.editor.active) this.fogMist.renderOverlay(this.sceneManager.renderer, this.sceneManager.camera);
    this.build.renderOutline(this.sceneManager.renderer,this.sceneManager.camera);
    this.sceneManager.finishFrame(now);

  }
}

// Запуск игры после загрузки DOM
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Game();
});
