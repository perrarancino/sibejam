/**
 * Каталог всех импортированных звуковых файлов игры.
 * Звуки аккуратно структурированы по категориям и готовы к подключению к механикам.
 */
export const AUDIO_CATALOG = {
  // Звуки шагов и перемещения персонажа
  player: {
    walkEcho: [
      'assets/audio/player/walk_echo/echowalk1.mp3',
      'assets/audio/player/walk_echo/echowalk2.mp3',
      'assets/audio/player/walk_echo/echowalk3.mp3',
      'assets/audio/player/walk_echo/echowalk4.mp3',
      'assets/audio/player/walk_echo/echowalk5.mp3'
    ],
    walkWood: [
      'assets/audio/player/walk_wood/woodwalk1.mp3',
      'assets/audio/player/walk_wood/woodwalk2.mp3',
      'assets/audio/player/walk_wood/woodwalk3.mp3',
      'assets/audio/player/walk_wood/woodwalk4.mp3',
      'assets/audio/player/walk_wood/woodwalk5.mp3',
      'assets/audio/player/walk_wood/woodwalk6.mp3'
    ],
    runHeel: [
      'assets/audio/player/run_heel/heelrun1.mp3',
      'assets/audio/player/run_heel/heelrun2.mp3',
      'assets/audio/player/run_heel/heelrun3.mp3',
      'assets/audio/player/run_heel/heelrun4.mp3',
      'assets/audio/player/run_heel/heelrun5.mp3',
      'assets/audio/player/run_heel/heelrun6.mp3',
      'assets/audio/player/run_heel/heelrun7.mp3'
    ],
    runWood: [
      'assets/audio/player/run_wood/woodrun1.mp3',
      'assets/audio/player/run_wood/woodrun2.mp3',
      'assets/audio/player/run_wood/woodrun3.mp3',
      'assets/audio/player/run_wood/woodrun4.mp3',
      'assets/audio/player/run_wood/woodrun5.mp3',
      'assets/audio/player/run_wood/woodrun6.mp3',
      'assets/audio/player/run_wood/woodrun7.mp3'
    ],
    runGeneral: [
      'assets/audio/player/run_general/run1.mp3',
      'assets/audio/player/run_general/run2.mp3',
      'assets/audio/player/run_general/run3.mp3',
      'assets/audio/player/run_general/run4.mp3',
      'assets/audio/player/run_general/run5.mp3',
      'assets/audio/player/run_general/run6.mp3'
    ]
  },

  // Атмосферные звуки кладбища и тумана
  environment: {
    crowsNormal: [
      'assets/audio/environment/crows/crow1.mp3',
      'assets/audio/environment/crows/crow2.mp3',
      'assets/audio/environment/crows/crow3.mp3',
      'assets/audio/environment/crows/crow4.mp3',
      'assets/audio/environment/crows/crow5.mp3'
    ],
    crowsAggressive: [
      'assets/audio/environment/crows/crowhard1.mp3',
      'assets/audio/environment/crows/crowhard2.mp3',
      'assets/audio/environment/crows/crowhard3.mp3'
    ],
    creaksAndSticks: [
      'assets/audio/environment/creaks/stick1.mp3',
      'assets/audio/environment/creaks/stick2.mp3',
      'assets/audio/environment/creaks/stick3.mp3',
      'assets/audio/environment/creaks/stick4.mp3',
      'assets/audio/environment/creaks/stick5.mp3',
      'assets/audio/environment/creaks/stickhard.mp3'
    ]
  },

  // Звуки механик: камеры и инвентарь/строительство
  mechanics: {
    cameraSwitch: 'assets/audio/mechanics/camera/camera.mp3',
    inventoryChoose: 'assets/audio/mechanics/inventory/chooseitem.mp3',
    inventoryDrop: 'assets/audio/mechanics/inventory/dropitem.mp3'
  }
};

export default AUDIO_CATALOG;
