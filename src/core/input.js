/**
 * Модуль управления вводом (Клавиатура: WASD, Стрелки, ЦФЫВ, Shift).
 */
export class InputController {
  constructor() {
    this.keys = new Set();
    this.isShiftPressed = false;

    this.keymap = {
      // Английская раскладка
      'w': 'up',
      's': 'down',
      'a': 'left',
      'd': 'right',
      // Русская раскладка
      'ц': 'up',
      'ы': 'down',
      'ф': 'left',
      'в': 'right',
      // Стрелки
      'arrowup': 'up',
      'arrowdown': 'down',
      'arrowleft': 'left',
      'arrowright': 'right'
    };

    this.initListeners();
  }

  initListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') {
        this.isShiftPressed = true;
      }
      const mapped = this.keymap[e.key.toLowerCase()];
      if (mapped) {
        this.keys.add(mapped);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        this.isShiftPressed = false;
      }
      const mapped = this.keymap[e.key.toLowerCase()];
      if (mapped) {
        this.keys.delete(mapped);
      }
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.isShiftPressed = false;
    });
  }

  /**
   * Возвращает экранный 2D вектор ввода: { screenX, screenY, isMoving, isRunning }
   */
  getMovementInput() {
    const screenX = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0);
    const screenY = (this.keys.has('up') ? 1 : 0) - (this.keys.has('down') ? 1 : 0);
    const isMoving = screenX !== 0 || screenY !== 0;

    return {
      screenX,
      screenY,
      isMoving,
      isRunning: isMoving && this.isShiftPressed
    };
  }
}

export const input = new InputController();
export default input;
