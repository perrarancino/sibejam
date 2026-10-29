/**
 * Окружение: Туман Войны, Священные Тыквы, могильные дыры и специальные механики.
 */
export const ENVIRONMENT_CONFIG = {
  fieldSize: 26, // размер поля в метрах (26x26)
  graveHoles: {
    count: 4, // 3–4 старые могильные дыры на границах кладбища
    prepPhaseVisual: 'weak_orange_smoke', // слабый оранжевый дым в фазе подготовки
    description: 'Точки спавна врагов на границах кладбища.'
  },
  sacredPumpkins: {
    name: 'Священные Тыквы (Клумба Реликвий)',
    position: { x: 0, z: 0 },
    maxHp: 100,
    witherRateInFogPerSec: 2.0, // медленно увядают, если туман добирается до них
    description: 'Центральный объект обороны. Если туман накрывает тыквы, они начинают увядать.'
  },
  fogOfWar: {
    preWaveState: 'fully_open', // до старта волны локация полностью открыта: игрок видит могильные ямы и планирует оборону
    inWaveEncrouchSpeed: 1.2, // скорость наползания тумана с краев
    playerVisionInFog: 'silhouette_and_lantern_only', // виден только силуэт Агаты и радиус её фонаря
    enemiesHiddenInFog: true, // враги невидимы, слышны лишь звуки шороха и чавканья
    visualEffects: [
      'В тумане горят только светящиеся тыквенные глаза и зловещие очертания'
    ],
    audioEffects: [
      'Туман глушит звуки шагов Агаты, но усиливает хруст лоз и чавканье врагов (игра на слух)'
    ]
  },
  specialMechanics: {
    motionDetector: {
      enabled: true,
      triggerBehindDistance: 3.5,
      soundWarning: 'urgent_vibration_beep',
      description: 'Звуковой детектор движения: если к неподвижной Агате со спины приближается враг, планшет истошно пищит и вибрирует.'
    },
    seedMagnet: {
      enabled: true,
      speed: 16.0,
      description: 'Сборщик семян: между волнами туман рассеивается, и все оставшиеся семена на карте намагничиваются к Агате.'
    }
  }
};
