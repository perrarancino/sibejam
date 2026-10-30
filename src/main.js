/**
 * Главная точка входа игры (Application Entry Point).
 */
import { GAME_DESIGN } from './config/index.js';
import { gameState } from './state/gameState.js';
import { input } from './core/input.js';
import { SceneManager } from './core/scene.js?v=tile-floor-1';
import { GraveyardMap } from './entities/map.js?v=tile-arrange-1';
import { Player } from './entities/player.js?v=shadow-arrow-1';
import { Decorations } from './entities/decorations.js?v=church-3';
import { FogMistManager } from './entities/fogMist.js?v=round-fog-1';
import { hud } from './ui/hud.js';

// Экспорт в window для удобной отладки в консоли браузера
window.GAME_DESIGN = GAME_DESIGN;
window.GAME_STATE = gameState.get();
window.gameStateManager = gameState;

class Game {
  constructor() {
    const container = document.querySelector('#game-canvas-container');
    this.sceneManager = new SceneManager(container);
    this.map = new GraveyardMap(this.sceneManager.scene);
    this.player = new Player(this.sceneManager.scene);
    this.fogMist = new FogMistManager(this.sceneManager.scene, 56);
    this.decorations = new Decorations(this.sceneManager.scene, this.fogMist);
    this.hud = hud;

    // Кнопки зума (если присутствуют)
    document.querySelector('#btn-zoom-in')?.addEventListener('click', () => {
      this.sceneManager.setZoom(this.sceneManager.zoomLevel * 1.15);
    });
    document.querySelector('#btn-zoom-out')?.addEventListener('click', () => {
      this.sceneManager.setZoom(this.sceneManager.zoomLevel / 1.15);
    });

    this.lastTime = performance.now();
    this.boundLimit = this.map.getBoundaryLimit(this.player.radius);

    // Первоначальный рендер HUD (если элементы есть)
    this.hud.renderState(gameState.get());

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  animate(now) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    // Опрос ввода
    const inputData = input.getMovementInput();
    gameState.update({ isRunning: inputData.isRunning });

    // Обновление состояния персонажа
    this.player.update(inputData, this.boundLimit, dt, now);

    // Обновление анимаций карты (пульсация святыни)
    this.map.update(now);
    this.decorations.update(now);

    // Обновление живой дымки и колышущегося тумана
    this.fogMist.update(this.player.getPosition(), dt, now);

    // Обновление UI (если есть)
    this.hud.updateMovementStatus(inputData.isMoving, inputData.isRunning);

    // Следование камеры за Агатой
    this.sceneManager.updateCameraTracking(this.player.getPosition(), dt);
    this.player.bodyCube.quaternion.copy(this.sceneManager.camera.quaternion);

    // Отрисовка кадра
    this.sceneManager.render();
    this.fogMist.renderOverlay(this.sceneManager.renderer, this.sceneManager.camera);

    requestAnimationFrame(this.animate);
  }
}

// Запуск игры после загрузки DOM
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Game();
});
