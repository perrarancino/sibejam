/**
 * Бестиарий (типы врагов, характеристики и поведенческие паттерны).
 *
 * Призрак материализуется в луче камер; автоматические ловушки его
 * не замечают в призрачной фазе. Пугало перепрыгивает ловушки раз в 10 секунд.
 * Джек — единственный босс последней, пятой ночи.
 */
export const BESTIARY_CONFIG = {
  ghost: {
    id: 'ghost',
    name: 'Призрак',
    hp: 20,
    behavior: 'Вне света камер полупрозрачен: не запускает автоматические ловушки и не получает от них урон. Ручные ловушки действуют и в призрачной фазе. В луче любой рабочей камеры становится плотным и уязвимым для всех ловушек.',
    phases: ['semiTransparent', 'revealed'],
    revealedBy: 'cameraLight',
    immuneToAutomaticTrapsWhileSpectral: true,
    vulnerableToManualTraps: true,
    dropsSeeds: 4
  },
  kamikaze: {
    id: 'kamikaze',
    name: 'Гнилой прыгун (Камикадзе)',
    hp: 25,
    behavior: 'Двигается зигзагами, перепрыгивая через шипы. Игнорирует священные тыквы! Его цель — камеры.',
    target: 'cameras',
    onCameraContact: 'Взрывается и заливает объектив жижей, сектор гаснет, туман мгновенно поглощает эту зону, а ловушки отключаются.',
    dropsSeeds: 5
  },
  pumpkinhead: {
    id: 'pumpkinhead',
    name: 'Тыквоголовый',
    hp: 40,
    behavior: 'Человекоподобный зомби с тыквой вместо головы. Идёт прямо к игроку и наносит урон в ближнем бою.',
    type: 'humanoid-zombie',
    dropsSeeds: 8
  },
  scarecrow: {
    id: 'scarecrow',
    name: 'Пугало',
    hp: 80,
    behavior: 'Перепрыгивает ловушки не чаще раза в 10 секунд. Ограды, могилы и здания обходит по маршруту.',
    canJumpTraps: true,
    jumpCooldownSec: 10,
    jumpHeight: 1.5,
    maxJumpDistance: 3.2,
    dropsSeeds: 16
  },
  jackPumpkin: {
    id: 'jackPumpkin',
    name: 'Джек тыква',
    hp: 500,
    isBoss: true,
    behavior: 'Большая человекоподобная тыква с косой, аналог смерти. Босс игры.',
    type: 'boss',
    weapon: 'scythe',
    immuneToRage: true, // пушка ярости не берёт босса
    dropsSeeds: 120
  }
};
