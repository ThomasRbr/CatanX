/** CatanX Next tokens — shared by CSS, UI and Three.js. */
export type VisualQuality = 'auto' | 'low' | 'balanced' | 'high' | 'ultra';
export type SeasonToken = 'spring' | 'summer' | 'autumn' | 'winter';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type PanelVariant = 'glass' | 'paper' | 'dock' | 'lacquer' | 'ivory';
export type BadgeVariant = 'neutral' | 'accent' | 'season' | 'danger' | 'success';

export const colors = {
  midnight: '#0B1F38',
  graphite: '#202735',
  ink: '#172033',
  inkSoft: '#526074',
  ivory: '#F7F8FC',
  cloud: '#E8EDF5',
  turquoise: '#1FC8C4',
  coral: '#FF6B5F',
  solar: '#FFCD4A',
  violet: '#8B6CFF',
  success: '#57C785',
  focusRing: 'rgba(31, 200, 196, 0.95)',
  panelGlass: 'rgba(9, 17, 24, 0.82)',
  panelGlassStrong: 'rgba(12, 22, 31, 0.94)',
  panelPaper: 'rgba(247, 248, 252, 0.96)',
  panelPaperStrong: '#F7F8FC',
  panelBorder: 'rgba(226, 235, 238, 0.16)',
  panelShadow: 'rgba(0, 5, 10, 0.56)',
  chrome: 'rgba(177, 191, 197, 0.28)',
  grain: 'rgba(255, 255, 255, 0.028)',
} as const;

export const seasonAccents: Record<SeasonToken, string> = {
  spring: '#57C785',
  summer: '#FFCD4A',
  autumn: '#FF7C56',
  winter: '#76B7FF',
};

/** High-contrast player colours; labels and silhouettes remain mandatory. */
export const playerColors = {
  red: '#FF6B5F',
  blue: '#4E9DFF',
  orange: '#FFAE42',
  white: '#F7F8FC',
  green: '#57C785',
  brown: '#8B6CFF',
} as const;

export const typography = {
  display: "'Sora', 'Inter', system-ui, sans-serif",
  ui: "'Inter', system-ui, sans-serif",
  narrative: "'Inter', system-ui, sans-serif",
  sizeXs: '11px', sizeSm: '13px', sizeMd: '15px', sizeLg: '18px', sizeXl: '24px', sizeHero: '46px',
} as const;

export const spacing = { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', xxl: '32px' } as const;
export const elevation = {
  flat: 'none',
  raised: '0 12px 30px -16px var(--panel-shadow)',
  float: '0 26px 60px -24px var(--panel-shadow)',
  inset: 'inset 0 1px 0 rgba(255,255,255,.18)',
} as const;
export const radii = { sm: '8px', md: '14px', lg: '20px', pill: '999px' } as const;
export const motion = { feedback: 140, control: 220, panel: 360, scene: 700 } as const;

/** @deprecated Compatibility aliases for surfaces not migrated yet. */
export const designTokens = {
  ink: colors.ink, inkSoft: colors.inkSoft, panelBg: colors.panelGlass,
  panelBgStrong: colors.panelGlassStrong, panelBorder: colors.panelBorder,
  accentGold: colors.solar, accentGoldBright: colors.solar, accentWar: colors.coral,
  success: colors.success, focusRing: colors.focusRing,
} as const;

export const TUTORIAL_STORAGE_KEY = 'catanx_tutoriel_termine_v2';

export function tokensToCssVars(): Record<string, string> {
  return {
    '--ink': colors.ink, '--ink-soft': colors.inkSoft, '--midnight': colors.midnight,
    '--graphite': colors.graphite, '--ivory': colors.ivory, '--cloud': colors.cloud,
    '--turquoise': colors.turquoise, '--coral': colors.coral, '--solar': colors.solar,
    '--violet': colors.violet, '--success': colors.success, '--panel-bg': colors.panelGlass,
    '--panel-bg-strong': colors.panelGlassStrong, '--panel-ivory': colors.panelPaper,
    '--panel-ivory-strong': colors.panelPaperStrong, '--panel-border': colors.panelBorder,
    '--panel-shadow': colors.panelShadow, '--accent-gold': colors.solar,
    '--accent-gold-bright': colors.solar, '--accent-iron': colors.turquoise,
    '--accent-war': colors.coral, '--focus-ring': colors.focusRing, '--grain': colors.grain,
    '--ornament': colors.chrome, '--font-display': typography.display, '--font-ui': typography.ui,
    '--font-narrative': typography.narrative, '--space-xs': spacing.xs, '--space-sm': spacing.sm,
    '--space-md': spacing.md, '--space-lg': spacing.lg, '--space-xl': spacing.xl,
    '--radius-sm': radii.sm, '--radius-md': radii.md, '--radius-lg': radii.lg,
    '--motion-feedback': `${motion.feedback}ms`, '--motion-control': `${motion.control}ms`,
    '--motion-panel': `${motion.panel}ms`, '--motion-scene': `${motion.scene}ms`,
    '--season-spring': seasonAccents.spring, '--season-summer': seasonAccents.summer,
    '--season-autumn': seasonAccents.autumn, '--season-winter': seasonAccents.winter,
  };
}
