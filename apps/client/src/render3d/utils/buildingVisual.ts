export type BuildingVisual =
  | 'settlement'
  | 'city'
  | 'metropolis'
  | 'farm'
  | 'mine'
  | 'market'
  | 'library'
  | 'barracks'
  | 'wall'
  | 'harbor'
  | 'temple'
  | 'fallback';

export function resolveBuildingVisual(definitionId: string): BuildingVisual {
  if (definitionId === 'settlement') return 'settlement';
  if (definitionId === 'city') return 'city';
  if (definitionId === 'metropolis') return 'metropolis';
  if (definitionId === 'farm') return 'farm';
  if (definitionId === 'mine') return 'mine';
  if (definitionId === 'market') return 'market';
  if (definitionId === 'library') return 'library';
  if (definitionId === 'barracks') return 'barracks';
  if (definitionId === 'wall') return 'wall';
  if (definitionId === 'harbor') return 'harbor';
  if (definitionId === 'temple') return 'temple';
  return 'fallback';
}
