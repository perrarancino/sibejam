// Единые характеристики ловушек: время в секундах, расстояние в игровых единицах.
export const TRAPS_CONFIG = {
  floorSpikes: { id:'floor_spikes', name:'Напольные шипы', mode:'auto', cost:40, damage:15, intervalSec:1, range:.8, description:'Шипы срабатывают раз в секунду, пока враг стоит на платформе.' },
  dartDevice: { id:'dart_device', name:'Устройство с дротиками', mode:'auto', cost:60, damage:12, intervalSec:1, range:7, description:'Стреляет в ближайшего врага раз в секунду.' },
  mine: { id:'mine', name:'Мина', mode:'auto', cost:25, damage:19, range:2.2, description:'Одноразовый взрыв при приближении врага.' },
  electricFence: { id:'electric_fence', name:'Забор с электрическими канатами', mode:'auto', cost:35, slowdownPercent:25, description:'Замедляет проходящих врагов на 25%.' },
  slowLiquidPacket: { id:'slow_liquid_packet', name:'Пакет с замедляющей жидкостью', mode:'manual', cost:30, slowdownPercent:50, durationSec:30, range:2.5, description:'Одноразовая лужа на 30 секунд: скорость врагов −50%.' },
  log: { id:'log', name:'Бревно', mode:'manual', cost:35, damage:18, range:12, description:'Одноразовое бревно катится вперёд и наносит урон.' },
  flamethrower: { id:'flamethrower', name:'Огнемёт', mode:'manual', cost:80, damage:10, intervalSec:.5, durationSec:30, range:3.5, description:'Вращается и выпускает огонь в четыре стороны 30 секунд.' },
  cannon: { id:'cannon', name:'Пушка (смесь ярости)', mode:'manual', cost:65, range:9, targets:3, description:'Одноразово обращает до трёх ближайших монстров на вашу сторону.' }
};
