import { createContext, useContext, type PropsWithChildren } from 'react';
import type { RenderQualityProfile } from './renderQuality';
import { RENDER_QUALITY_PROFILES } from './renderQuality';

const RenderQualityContext = createContext<RenderQualityProfile>(RENDER_QUALITY_PROFILES.balanced);

export function RenderQualityProvider({
  profile,
  children,
}: PropsWithChildren<{ profile: RenderQualityProfile }>) {
  return <RenderQualityContext.Provider value={profile}>{children}</RenderQualityContext.Provider>;
}

export function useRenderQuality(): RenderQualityProfile {
  return useContext(RenderQualityContext);
}
