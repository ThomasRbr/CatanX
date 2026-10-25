import { describe, expect, it } from 'vitest';
import {
  RENDER_QUALITY_PROFILES,
  dprRangeForProfile,
  resolveAutoVisualQuality,
  resolveRenderQualityProfile,
} from '../renderQuality';

describe('realistic render quality profiles', () => {
  it('keeps constrained devices on the realistic low tier', () => {
    expect(resolveAutoVisualQuality({ deviceMemoryGb: 2, hardwareConcurrency: 8 })).toBe('low');
  });

  it('selects balanced for unknown or mainstream hardware', () => {
    expect(resolveAutoVisualQuality({})).toBe('balanced');
    expect(resolveAutoVisualQuality({ deviceMemoryGb: 6, hardwareConcurrency: 6 })).toBe('balanced');
  });

  it('reserves ultra for capable hardware', () => {
    expect(resolveAutoVisualQuality({ deviceMemoryGb: 16, hardwareConcurrency: 12 })).toBe('ultra');
  });

  it('caps integrated GPUs at balanced whatever the CPU says', () => {
    const intel = 'ANGLE (Intel, Intel(R) UHD Graphics (0x0000A788) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    const rtx = 'ANGLE (NVIDIA, NVIDIA RTX 3500 Ada Generation Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)';
    expect(resolveAutoVisualQuality({ deviceMemoryGb: 16, hardwareConcurrency: 16, gpuRenderer: intel })).toBe('balanced');
    expect(resolveAutoVisualQuality({ deviceMemoryGb: 16, hardwareConcurrency: 16, gpuRenderer: rtx })).toBe('ultra');
  });

  it('keeps explicit profiles and their DPR budgets', () => {
    expect(resolveRenderQualityProfile('low')).toBe(RENDER_QUALITY_PROFILES.low);
    expect(dprRangeForProfile(RENDER_QUALITY_PROFILES.high)).toEqual([1.25, 1.75]);
    expect(dprRangeForProfile(RENDER_QUALITY_PROFILES.ultra)).toEqual([1, 1.25]);
    expect(dprRangeForProfile(RENDER_QUALITY_PROFILES.ultra, { capture: true })).toEqual([1.5, 2]);
  });
});
