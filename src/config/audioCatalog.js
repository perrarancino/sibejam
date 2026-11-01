/**
 * Каталог всех импортированных звуковых файлов игры.
 * Звуки аккуратно структурированы по категориям и готовы к подключению к механикам.
 */
export const AUDIO_CATALOG = {
  // Звуки шагов и перемещения персонажа
  player: {
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
    ],
    // Звуки получения урона и состояния
    condition: {
      damage1: 'assets/audio/player/condition/damage1.mp3',
      damage2: 'assets/audio/player/condition/damage2.mp3',
      damageBlood: 'assets/audio/player/condition/damageblood.mp3'
    },
    // Звуки ударов
    hits: {
      swing1: 'assets/audio/player/hits/swing1.mp3',
      swing2: 'assets/audio/player/hits/swing2.mp3',
      swing3: 'assets/audio/player/hits/swing3.mp3',
      punch: 'assets/audio/player/hits/punch.mp3'
    },
    // Звуки действий персонажа
    actions: {
      woman1: 'assets/audio/player/actions/woman1.mp3',
      woman2: 'assets/audio/player/actions/woman2.mp3',
      woman3: 'assets/audio/player/actions/woman3.mp3',
      woman4: 'assets/audio/player/actions/woman4.mp3',
      woman5: 'assets/audio/player/actions/woman5.mp3',
      woman6: 'assets/audio/player/actions/woman6.mp3',
      woman7: 'assets/audio/player/actions/woman7.mp3'
    }
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

  // Звуки врагов
  enemies: {
    ghost: [
      'assets/audio/enemies/ghost/ghost1.mp3',
      'assets/audio/enemies/ghost/ghost2.mp3',
      'assets/audio/enemies/ghost/ghost3.mp3'
    ],
    zombie: [
      'assets/audio/enemies/zombie/zombie1.mp3',
      'assets/audio/enemies/zombie/zombie2.mp3',
      'assets/audio/enemies/zombie/zombie3.mp3'
    ],
    scarecrow: [
      'assets/audio/enemies/scarecrow/scarecrow1.mp3',
      'assets/audio/enemies/scarecrow/scarecrow2.mp3'
    ],
    pumpkinonlegs: [
      'assets/audio/enemies/pumpkinonlegs/pumpkinonlegs1.mp3',
      'assets/audio/enemies/pumpkinonlegs/pumpkinonlegs2.mp3',
      'assets/audio/enemies/pumpkinonlegs/pumpkinonlegs3.mp3',
      'assets/audio/enemies/pumpkinonlegs/pumpkinonlegs4.mp3'
    ],
    bossJackPumpkin: [
      'assets/audio/enemies/bossjackpumpkin/bossjackpumpkin1.mp3',
      'assets/audio/enemies/bossjackpumpkin/bossjackpumpkin2.mp3',
      'assets/audio/enemies/bossjackpumpkin/bossjackpumpkin3.mp3'
    ],
    var2: [
      'assets/audio/enemies/var2/var2monster1.mp3',
      'assets/audio/enemies/var2/var2monster2.mp3',
      'assets/audio/enemies/var2/var2monster3.mp3',
      'assets/audio/enemies/var2/var2monster4.mp3',
      'assets/audio/enemies/var2/var2monster5.mp3',
      'assets/audio/enemies/var2/var2monster6.mp3'
    ],
    var3: [
      'assets/audio/enemies/var3/var3monster1.mp3',
      'assets/audio/enemies/var3/var3monster2.mp3',
      'assets/audio/enemies/var3/var3monster3.mp3',
      'assets/audio/enemies/var3/var3monster4.mp3'
    ]
  },

  // Игровые события и фазы
  game: {
    phase: {
      fightStart: 'assets/audio/game/phase/fightstart.mp3',
      roar: 'assets/audio/game/phase/roar.mp3'
    }
  },

  // Звуки механик: камеры, инвентарь и ловушки
  mechanics: {
    cameraSwitch: 'assets/audio/mechanics/camera/camera.mp3',
    cameraShot: 'assets/audio/mechanics/camera/camerashot.mp3',
    inventoryChoose: 'assets/audio/mechanics/inventory/chooseitem.mp3',
    inventoryDrop: 'assets/audio/mechanics/inventory/dropitem.mp3',
    traps: {
      thorns: 'assets/audio/mechanics/traps/thorns/thorns.mp3',
      mine: {
        beep1: 'assets/audio/mechanics/traps/mine/beep1.mp3',
        beep2: 'assets/audio/mechanics/traps/mine/beep2.mp3',
        beep3: 'assets/audio/mechanics/traps/mine/beep3.mp3',
        explosion1: 'assets/audio/mechanics/traps/mine/explosion1.mp3',
        explosion2: 'assets/audio/mechanics/traps/mine/explosion2.mp3',
        explosion3: 'assets/audio/mechanics/traps/mine/explosion3.mp3'
      },
      log: 'assets/audio/mechanics/traps/log/log.mp3',
      liquid: {
        balloon1: 'assets/audio/mechanics/traps/liquid/balloon1.mp3',
        balloon2: 'assets/audio/mechanics/traps/liquid/balloon2.mp3',
        balloon3: 'assets/audio/mechanics/traps/liquid/balloon3.mp3'
      },
      flamethrower: 'assets/audio/mechanics/traps/flamethrower/flamethrower.mp3',
      electricFence: [
        'assets/audio/mechanics/traps/electrincfence/electricfence.mp3',
        'assets/audio/mechanics/traps/electrincfence/electricfencelong.mp3'
      ],
      dart: 'assets/audio/mechanics/traps/dart/dart.mp3',
      cannon: 'assets/audio/mechanics/traps/cannon/cannon.mp3'
    }
  }
};

export default AUDIO_CATALOG;
