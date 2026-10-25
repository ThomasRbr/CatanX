/**
 * One time uniform shared by every animated shader of the sky layer
 * (waterfalls, wind ribbons, beams). Advanced once per frame by `SkyLayer3D`
 * only while ambient animation is enabled, so a paused board is truly static.
 */
export const skyClock = { value: 0 };

/** Advance the shared clock (called once per frame by the sky layer). */
export function advanceSkyClock(delta: number): void {
  skyClock.value += Math.min(delta, 0.1);
}

/** Ask the renderer to refresh its (otherwise frozen) shadow map this frame. */
export function refreshShadowMap(gl: { shadowMap: { needsUpdate: boolean } }): void {
  gl.shadowMap.needsUpdate = true;
}
