import { Container, Graphics, Text } from 'pixi.js';
import { UnitInstance } from '@catanx/engine';
import { HexLayout, hexToPixel } from '@catanx/engine';
import { frUnit } from '../../i18n/fr';

function unitShortCode(unitType: string): string {
  return frUnit(unitType).slice(0, 2).toUpperCase();
}

export function createUnitSprite(unit: UnitInstance, layout: HexLayout, color: number): Container {
  const sprite = new Container();
  const center = hexToPixel(unit.position, layout);

  const shadow = new Graphics();
  shadow.ellipse(center.x, center.y + 12, 10, 4).fill({ color: 0x070706, alpha: 0.34 });

  const base = new Graphics();
  base.circle(center.x, center.y + 1, 10).fill({ color, alpha: 0.96 });
  base.circle(center.x, center.y + 1, 10).stroke({ color: 0xfceec9, width: 1.6, alpha: 0.95 });

  const crest = new Graphics();
  crest
    .poly([
      center.x - 4,
      center.y + 1,
      center.x,
      center.y - 5,
      center.x + 4,
      center.y + 1,
      center.x,
      center.y + 5,
    ])
    .fill({ color: 0xf7e2a4, alpha: 0.9 });

  const spear = new Graphics();
  spear
    .moveTo(center.x + 8, center.y - 10)
    .lineTo(center.x + 8, center.y + 4)
    .stroke({ color: 0x2f2c29, width: 1.2, alpha: 0.95 });
  spear
    .poly([center.x + 8, center.y - 13, center.x + 11, center.y - 8, center.x + 5, center.y - 8])
    .fill({ color: 0xddd5c6, alpha: 0.9 });

  const hpRatio = Math.max(0, unit.stats.currentHealth / Math.max(1, unit.stats.health));
  const hp = new Graphics();
  hp.roundRect(center.x - 12, center.y - 19, 24, 4, 2).fill({ color: 0x141414, alpha: 0.84 });
  hp.roundRect(center.x - 12, center.y - 19, 24 * hpRatio, 4, 2).fill({
    color: hpRatio > 0.45 ? 0x4ac47a : 0xcf6240,
  });

  const level = new Text({
    text: String(unit.level),
    style: { fill: 0x1f1610, fontSize: 9, fontWeight: '800' },
  });
  level.anchor.set(0.5);
  level.position.set(center.x, center.y + 1);

  const type = new Text({
    text: unitShortCode(unit.type),
    style: { fill: 0xf6efe3, fontSize: 8, fontWeight: '700' },
  });
  type.anchor.set(0.5);
  type.position.set(center.x, center.y + 15);

  if (unit.status === 'attacking') {
    const aura = new Graphics();
    aura.circle(center.x, center.y + 1, 14).stroke({ color: 0xe16047, width: 2, alpha: 0.8 });
    sprite.addChild(aura);
  }

  if (unit.status === 'moving') {
    const aura = new Graphics();
    aura.circle(center.x, center.y + 1, 14).stroke({ color: 0xf6d587, width: 2, alpha: 0.72 });
    sprite.addChild(aura);
  }

  sprite.addChild(shadow, base, crest, spear, hp, level, type);
  return sprite;
}
