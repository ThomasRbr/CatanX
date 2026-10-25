import type { UnitType } from '@catanx/engine';

export type UnitKind = 'worker' | 'scout' | 'melee' | 'ranged' | 'fallback';

export function resolveUnitKind(type: UnitType | string): UnitKind {
  if (type === 'worker') return 'worker';
  if (type === 'explorer') return 'scout';
  if (type === 'archer' || type === 'crossbowman' || type === 'longbowman') return 'ranged';
  if (
    type === 'warrior' ||
    type === 'spearman' ||
    type === 'swordsman' ||
    type === 'knight' ||
    type === 'cavalry'
  ) {
    return 'melee';
  }
  return 'fallback';
}
