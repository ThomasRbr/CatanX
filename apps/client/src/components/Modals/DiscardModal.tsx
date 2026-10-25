import { useState } from 'react';
import { motion } from 'framer-motion';
import { ResourceType } from '@catanx/engine';
import type { CkCommodity, UndergroundSkyMaterial } from '@catanx/engine';
import { frCommodity, frResource } from '../../i18n/fr';

const CLASSIC_RESOURCES: ResourceType[] = ['wood', 'clay', 'wheat', 'sheep', 'ore'];
const CK_COMMODITIES: CkCommodity[] = ['ck_paper', 'ck_cloth', 'ck_coin'];
const US_MATERIALS: UndergroundSkyMaterial[] = ['us_crystal', 'us_aether'];

const MATERIAL_LABELS: Record<UndergroundSkyMaterial, string> = {
  us_crystal: 'Cristal',
  us_aether: 'Éther',
};

export interface DiscardSelection {
  resources: Partial<Record<ResourceType, number>>;
  commodities: Partial<Record<CkCommodity, number>>;
  undergroundSkyMaterials?: Partial<Record<UndergroundSkyMaterial, number>>;
}

interface DiscardModalProps {
  required: number;
  available: Partial<Record<ResourceType, number>>;
  availableCommodities?: Partial<Record<CkCommodity, number>>;
  availableMaterials?: Partial<Record<UndergroundSkyMaterial, number>>;
  playerName?: string;
  /** Seuil avant défausse (7, ou 7+2×murailles en C&K). */
  handLimit?: number;
  onConfirm: (discard: DiscardSelection) => void;
}

export function DiscardModal({
  required,
  available,
  availableCommodities = {},
  availableMaterials = {},
  playerName,
  handLimit = 7,
  onConfirm,
}: DiscardModalProps) {
  const [selectedResources, setSelectedResources] = useState<
    Partial<Record<ResourceType, number>>
  >({});
  const [selectedCommodities, setSelectedCommodities] = useState<
    Partial<Record<CkCommodity, number>>
  >({});
  const [selectedMaterials, setSelectedMaterials] = useState<
    Partial<Record<UndergroundSkyMaterial, number>>
  >({});

  const selectedTotal =
    Object.values(selectedResources).reduce((sum, value) => sum + (value ?? 0), 0) +
    Object.values(selectedCommodities).reduce((sum, value) => sum + (value ?? 0), 0) +
    Object.values(selectedMaterials).reduce((sum, value) => sum + (value ?? 0), 0);
  const canConfirm = selectedTotal === required;

  const adjustResource = (resource: ResourceType, delta: number): void => {
    setSelectedResources((prev) => {
      const current = prev[resource] ?? 0;
      const max = available[resource] ?? 0;
      const next = Math.max(0, Math.min(max, current + delta));
      const copy = { ...prev };
      if (next === 0) delete copy[resource];
      else copy[resource] = next;
      return copy;
    });
  };

  const adjustCommodity = (commodity: CkCommodity, delta: number): void => {
    setSelectedCommodities((prev) => {
      const current = prev[commodity] ?? 0;
      const max = availableCommodities[commodity] ?? 0;
      const next = Math.max(0, Math.min(max, current + delta));
      const copy = { ...prev };
      if (next === 0) delete copy[commodity];
      else copy[commodity] = next;
      return copy;
    });
  };

  const adjustMaterial = (material: UndergroundSkyMaterial, delta: number): void => {
    setSelectedMaterials((prev) => {
      const current = prev[material] ?? 0;
      const max = availableMaterials[material] ?? 0;
      const next = Math.max(0, Math.min(max, current + delta));
      const copy = { ...prev };
      if (next === 0) delete copy[material];
      else copy[material] = next;
      return copy;
    });
  };

  const hasCommodities = CK_COMMODITIES.some((c) => (availableCommodities[c] ?? 0) > 0);
  const hasMaterials = US_MATERIALS.some((m) => (availableMaterials[m] ?? 0) > 0);

  return (
    <motion.div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0,0,0,0.55)',
        pointerEvents: 'auto',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="hud-panel"
        style={{ width: 'min(420px, 92vw)', padding: 20 }}
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <h3 style={{ marginTop: 0 }}>Défausse obligatoire</h3>
        <p style={{ opacity: 0.85, marginBottom: 12 }}>
          {playerName ? `${playerName} — ` : ''}
          Main au-dessus de {handLimit}. Défaussez exactement{' '}
          <strong>{required}</strong> carte{required > 1 ? 's' : ''} (
          {selectedTotal}/{required}).
        </p>

        <div style={{ display: 'grid', gap: 8 }}>
          {CLASSIC_RESOURCES.filter((r) => (available[r] ?? 0) > 0).map((resource) => {
            const max = available[resource] ?? 0;
            const value = selectedResources[resource] ?? 0;
            return (
              <motion.div
                key={resource}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span>
                  {frResource(resource)} ({max})
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => adjustResource(resource, -1)}
                    disabled={value <= 0}
                  >
                    -
                  </button>
                  <strong>{value}</strong>
                  <button
                    type="button"
                    onClick={() => adjustResource(resource, 1)}
                    disabled={value >= max || selectedTotal >= required}
                  >
                    +
                  </button>
                </div>
              </motion.div>
            );
          })}

          {hasCommodities &&
            CK_COMMODITIES.filter((c) => (availableCommodities[c] ?? 0) > 0).map((commodity) => {
              const max = availableCommodities[commodity] ?? 0;
              const value = selectedCommodities[commodity] ?? 0;
              return (
                <motion.div
                  key={commodity}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span>
                    {frCommodity(commodity)} ({max})
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => adjustCommodity(commodity, -1)}
                      disabled={value <= 0}
                    >
                      -
                    </button>
                    <strong>{value}</strong>
                    <button
                      type="button"
                      onClick={() => adjustCommodity(commodity, 1)}
                      disabled={value >= max || selectedTotal >= required}
                    >
                      +
                    </button>
                  </div>
                </motion.div>
              );
            })}

          {hasMaterials &&
            US_MATERIALS.filter((m) => (availableMaterials[m] ?? 0) > 0).map((material) => {
              const max = availableMaterials[material] ?? 0;
              const value = selectedMaterials[material] ?? 0;
              return (
                <motion.div
                  key={material}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span>
                    {MATERIAL_LABELS[material]} ({max})
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => adjustMaterial(material, -1)}
                      disabled={value <= 0}
                    >
                      -
                    </button>
                    <strong>{value}</strong>
                    <button
                      type="button"
                      onClick={() => adjustMaterial(material, 1)}
                      disabled={value >= max || selectedTotal >= required}
                    >
                      +
                    </button>
                  </div>
                </motion.div>
              );
            })}
        </div>

        <button
          className="command-button primary"
          style={{ marginTop: 16, width: '100%' }}
          disabled={!canConfirm}
          onClick={() =>
            onConfirm({
              resources: selectedResources,
              commodities: selectedCommodities,
              undergroundSkyMaterials: selectedMaterials,
            })
          }
        >
          Confirmer la défausse
        </button>
      </motion.div>
    </motion.div>
  );
}
