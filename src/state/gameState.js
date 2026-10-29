/**
 * Управление состоянием игрового процесса (Runtime State).
 */
import { HEROINE_CONFIG, ECONOMY_CONFIG } from '../config/index.js';

export class GameStateManager {
  constructor() {
    this.state = {
      hp: HEROINE_CONFIG.maxHp,
      seeds: ECONOMY_CONFIG.startingSeeds,
      freeCameras: ECONOMY_CONFIG.freeCameras,
      placedCameras: [],
      placedTraps: [],
      wave: 0,
      phase: 'PREPARATION', // 'PREPARATION' | 'WAVE_ACTIVE' | 'WAVE_CLEAR'
      isViewingCamera: false,
      activeCameraIndex: 0,
      isRunning: false
    };

    this.listeners = new Set();
  }

  get() {
    return this.state;
  }

  update(partial) {
    Object.assign(this.state, partial);
    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        console.error('Error in state listener:', e);
      }
    }
  }
}

export const gameState = new GameStateManager();
export default gameState;
