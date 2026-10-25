import { createContext, useContext } from 'react';
import type { MapLodLevel } from '../utils/mapLod';

export const MapLodContext = createContext<MapLodLevel>(1);

export function useMapLod(): MapLodLevel {
  return useContext(MapLodContext);
}
