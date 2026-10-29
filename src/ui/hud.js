/**
 * Управление интерфейсом пользователя (HUD, модальное окно GDD, индикатор скорости).
 */
import { GAME_DESIGN } from '../config/index.js';
import { gameState } from '../state/gameState.js';

export class HudManager {
  constructor() {
    this.hpBar = document.querySelector('#hp-bar');
    this.hpText = document.querySelector('#hp-text');
    this.seedsText = document.querySelector('#seeds-text');
    this.camsText = document.querySelector('#cams-text');
    this.speedDot = document.querySelector('#speed-dot');
    this.speedText = document.querySelector('#speed-text');

    this.modal = document.querySelector('#gdd-modal');
    this.modalContent = document.querySelector('#modal-gdd-content');

    this.initListeners();
    this.initModal();

    // Подписка на обновление состояния
    gameState.subscribe((state) => this.renderState(state));
  }

  initListeners() {
    document.querySelector('#btn-gdd-data')?.addEventListener('click', () => {
      this.modal.classList.add('show');
    });

    document.querySelector('#btn-modal-close')?.addEventListener('click', () => {
      this.modal.classList.remove('show');
    });

    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.modal.classList.remove('show');
      }
    });
  }

  updateMovementStatus(isMoving, isRunning) {
    if (!this.speedDot || !this.speedText) return;

    if (isRunning) {
      this.speedDot.classList.add('running');
      this.speedText.textContent = `Бег (${GAME_DESIGN.heroine.runSpeed} м/с)`;
      this.speedText.style.color = '#ffab40';
    } else {
      this.speedDot.classList.remove('running');
      this.speedText.textContent = isMoving
        ? `Ходьба (${GAME_DESIGN.heroine.walkSpeed} м/с)`
        : 'Покой (0 м/с)';
      this.speedText.style.color = '#c7dcd0';
    }
  }

  renderState(state) {
    if (this.hpBar) {
      const pct = Math.max(0, Math.min(100, (state.hp / GAME_DESIGN.heroine.maxHp) * 100));
      this.hpBar.style.width = `${pct}%`;
    }
    if (this.hpText) {
      this.hpText.textContent = `${state.hp} HP`;
    }
    if (this.seedsText) {
      this.seedsText.textContent = `🌰 ${state.seeds}`;
    }
    if (this.camsText) {
      this.camsText.textContent = `📷 ${state.freeCameras} free`;
    }
  }

  initModal() {
    if (!this.modalContent) return;

    const gdd = GAME_DESIGN;
    this.modalContent.innerHTML = `
      <div class="gdd-section">
        <h4>👤 Главная героиня: ${gdd.heroine.name}</h4>
        <div class="gdd-grid">
          <div class="gdd-item"><div class="gdd-key">Здоровье</div><div class="gdd-val">${gdd.heroine.maxHp} HP (восстановление между волнами)</div></div>
          <div class="gdd-item"><div class="gdd-key">Скорость ходьбы</div><div class="gdd-val">${gdd.heroine.walkSpeed} м/с</div></div>
          <div class="gdd-item"><div class="gdd-key">Скорость бега (Shift)</div><div class="gdd-val">${gdd.heroine.runSpeed} м/с</div></div>
          <div class="gdd-item"><div class="gdd-key">Радиус фонаря</div><div class="gdd-val">${gdd.heroine.lanternRadius} м (активирует ловушки)</div></div>
          <div class="gdd-item"><div class="gdd-key">Протирка камеры (E)</div><div class="gdd-val">${gdd.heroine.wipeCameraDuration} сек</div></div>
        </div>
      </div>

      <div class="gdd-section">
        <h4>🌰 Строительство и Экономика</h4>
        <div class="gdd-grid">
          <div class="gdd-item"><div class="gdd-key">Стартовый баланс</div><div class="gdd-val">${gdd.economy.startingSeeds} семян, ${gdd.economy.freeCameras} бесплатные камеры</div></div>
          <div class="gdd-item"><div class="gdd-key">Камера наблюдения</div><div class="gdd-val">${gdd.economy.cameraCost} семян (угол 90°, дальность 10м)</div></div>
          <div class="gdd-item"><div class="gdd-key">Освященные шипы</div><div class="gdd-val">${gdd.economy.holySpikesCost} семян (30 урона / 1.5 сек на свету)</div></div>
          <div class="gdd-item"><div class="gdd-key">Святая смола</div><div class="gdd-val">${gdd.economy.holyTarCost} семян (замедление 50%)</div></div>
        </div>
      </div>

      <div class="gdd-section">
        <h4>📷 Камеры Наблюдения и Способности</h4>
        <div class="gdd-grid">
          <div class="gdd-item"><div class="gdd-key">Конус света</div><div class="gdd-val">90°, пробивает туман на ${gdd.surveillanceCamera.rangeMeters} метров</div></div>
          <div class="gdd-item"><div class="gdd-key">Святая вспышка (Space)</div><div class="gdd-val">Стан 3 сек, отброс тумана, КД 15 сек</div></div>
          <div class="gdd-item"><div class="gdd-key">Режим просмотра</div><div class="gdd-val">Tab + 1–4, риск: Агата неподвижна в мире</div></div>
          <div class="gdd-item"><div class="gdd-key">Поломка</div><div class="gdd-val">Камикадзе заливает слизью -> сектор гаснет</div></div>
        </div>
      </div>

      <div class="gdd-section">
        <h4>🎃 Бестиарий (Враги из могильных дыр)</h4>
        <div class="gdd-grid">
          <div class="gdd-item"><div class="gdd-key">Катун (Мини-тыковка)</div><div class="gdd-val">${gdd.bestiary.katun.hp} HP, скорость в тумане x1.5, бежит к реликвиям</div></div>
          <div class="gdd-item"><div class="gdd-key">Камикадзе (Прыгун)</div><div class="gdd-val">${gdd.bestiary.kamikaze.hp} HP, цель — камеры, взрывом ослепляет объектив</div></div>
          <div class="gdd-item"><div class="gdd-key">Набухшая тыква</div><div class="gdd-val">${gdd.bestiary.swollen.hp} HP, 2 отскока, взрывает ловушки и камеры</div></div>
        </div>
      </div>

      <div class="gdd-section">
        <h4>⚙️ Дополнительные ключевые механики</h4>
        <div class="gdd-grid">
          <div class="gdd-item"><div class="gdd-key">Детектор движения</div><div class="gdd-val">Звук вибрации/писка при атаке сзади в режиме камер</div></div>
          <div class="gdd-item"><div class="gdd-key">Сборщик семян</div><div class="gdd-val">Между волнами семена намагничиваются к Агате</div></div>
          <div class="gdd-item"><div class="gdd-key">Туман войны</div><div class="gdd-val">До волны поле открыто; в волне наползает с краев</div></div>
        </div>
      </div>
    `;
  }
}

export const hud = new HudManager();
export default hud;
