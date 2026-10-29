/**
 * Главный агрегатор конфигураций игры.
 */
import { HEROINE_CONFIG } from './heroine.js';
import { ECONOMY_CONFIG } from './economy.js';
import { CAMERA_CONFIG } from './cameras.js';
import { TRAPS_CONFIG } from './traps.js';
import { BESTIARY_CONFIG } from './bestiary.js';
import { ENVIRONMENT_CONFIG } from './environment.js';

export {
  HEROINE_CONFIG,
  ECONOMY_CONFIG,
  CAMERA_CONFIG,
  TRAPS_CONFIG,
  BESTIARY_CONFIG,
  ENVIRONMENT_CONFIG
};

export const GAME_DESIGN = {
  heroine: HEROINE_CONFIG,
  economy: ECONOMY_CONFIG,
  surveillanceCamera: CAMERA_CONFIG,
  traps: TRAPS_CONFIG,
  bestiary: BESTIARY_CONFIG,
  environment: ENVIRONMENT_CONFIG,
  fogOfWar: ENVIRONMENT_CONFIG.fogOfWar,
  specialMechanics: ENVIRONMENT_CONFIG.specialMechanics
};

export default GAME_DESIGN;
