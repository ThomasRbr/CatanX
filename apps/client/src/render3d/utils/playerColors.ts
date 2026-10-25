/** Shared player heraldry colors for 3D entities (matches Pixi HexBoard). */
export const PLAYER_COLOR_HEX: Record<string, string> = {
  red: '#d62828',
  blue: '#1d4ed8',
  green: '#2a9d8f',
  orange: '#f77f00',
  purple: '#7b2cbf',
  white: '#e5e5e5',
  brown: '#7f5539',
  cyan: '#00bcd4',
};

export function playerColor(colorKey: string | undefined | null, fallback = '#94a3b8'): string {
  if (!colorKey) return fallback;
  return PLAYER_COLOR_HEX[colorKey] ?? fallback;
}
