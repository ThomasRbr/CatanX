export type AITurnSpeed = 'slow' | 'normal' | 'fast';
/**
 * `diorama` is the production renderer. `threeLegacy` deliberately remains a
 * separate escape hatch for one full release while the visual projection is
 * rolled out. The old persisted `three` value is migrated transparently.
 */
export type MapRenderer = 'pixi' | 'threeLegacy' | 'diorama';
export type GraphicsBackend = 'auto' | 'webgpu' | 'webgl2';
/** Rendering tiers for the realistic diorama renderer. */
export type VisualQuality = 'auto' | 'low' | 'balanced' | 'high' | 'ultra';
