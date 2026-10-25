import { useEffect, useRef, useState } from 'react';
import type {
  CkCommodity,
  CkCommodityBundle,
  ResourceBundle,
  UndergroundSkyMaterial,
  UndergroundSkyMaterialBundle,
} from '@catanx/engine';
import { frCommodity, frResource } from '../../i18n/fr';
import { Icon, Tooltip, type CatanXIconName } from '../../ui';
import styles from './ResourceBar.module.css';

interface ResourceBarProps {
  resources: ResourceBundle;
  production?: ResourceBundle;
  commodities?: CkCommodityBundle;
  materials?: UndergroundSkyMaterialBundle;
}

const RESOURCE_ICONS: Partial<Record<keyof ResourceBundle, CatanXIconName>> = {
  wood: 'wood',
  clay: 'brick',
  sheep: 'sheep',
  wheat: 'wheat',
  ore: 'ore',
};
const CATAN_RESOURCES: Array<keyof ResourceBundle> = ['wood', 'clay', 'sheep', 'wheat', 'ore'];
const COMMODITY_PRESENTATION: Record<
  CkCommodity,
  { icon: CatanXIconName; track: string; tone: string }
> = {
  ck_cloth: { icon: 'ckCloth', track: 'Commerce', tone: 'trade' },
  ck_coin: { icon: 'ckCoin', track: 'Politique', tone: 'politics' },
  ck_paper: { icon: 'ckPaper', track: 'Science', tone: 'science' },
};
const CK_COMMODITY_ORDER: readonly CkCommodity[] = ['ck_cloth', 'ck_coin', 'ck_paper'];
const MATERIAL_LABELS: Record<UndergroundSkyMaterial, string> = {
  us_crystal: 'Cristal',
  us_aether: 'Éther',
};
const MATERIAL_ORDER: readonly UndergroundSkyMaterial[] = ['us_crystal', 'us_aether'];

export function listHeldCatanResources(resources: ResourceBundle) {
  return CATAN_RESOURCES.map((key) => [key, resources[key] ?? 0] as const).filter(
    ([, amount]) => amount > 0,
  );
}

export function listCkCommodityCounters(commodities: CkCommodityBundle) {
  return CK_COMMODITY_ORDER.map((key) => [key, Math.floor(commodities[key] ?? 0)] as const);
}

export function listUsMaterialCounters(materials: UndergroundSkyMaterialBundle) {
  return MATERIAL_ORDER.map((key) => [key, Math.floor(materials[key] ?? 0)] as const).filter(
    ([, amount]) => amount > 0,
  );
}

export function ResourceBar({
  resources,
  production,
  commodities,
  materials,
}: ResourceBarProps) {
  const [gained, setGained] = useState<Set<string>>(new Set());
  const previous = useRef<Record<string, number>>({});

  useEffect(() => {
    const next = new Set<string>();
    Object.entries(resources).forEach(([key, amount]) => {
      if ((amount ?? 0) > (previous.current[key] ?? 0)) next.add(key);
    });
    if (materials) {
      for (const key of MATERIAL_ORDER) {
        const amount = materials[key] ?? 0;
        if (amount > (previous.current[key] ?? 0)) next.add(key);
      }
    }
    previous.current = {
      ...Object.fromEntries(
        Object.entries(resources).map(([key, amount]) => [key, amount ?? 0]),
      ),
      ...(materials
        ? Object.fromEntries(MATERIAL_ORDER.map((key) => [key, materials[key] ?? 0]))
        : {}),
    };
    if (!next.size) return;
    setGained(next);
    const timeout = window.setTimeout(() => setGained(new Set()), 720);
    return () => window.clearTimeout(timeout);
  }, [resources, materials]);

  // The whole hand is always on screen: a missing chip reads as "no resource"
  // only if the player already knows the five, and the empty hand at the start
  // of a game used to hide the bar entirely.
  const entries = CATAN_RESOURCES.map((key) => [key, resources[key] ?? 0] as const);
  const handTotal = entries.reduce((sum, [, value]) => sum + Math.floor(value), 0);
  const commodityEntries = commodities ? listCkCommodityCounters(commodities) : [];
  const materialEntries = materials ? listUsMaterialCounters(materials) : [];

  return (
    <div className={styles.bar} data-hud-zone="resources">
      <div className={styles.resourceCards} aria-label="Ressources en main">
        <div className={styles.handTotal} aria-label={`${handTotal} cartes en main`}>
          <strong>{handTotal}</strong>
          <small>en main</small>
        </div>
        {entries.map(([key, value]) => {
          const label = frResource(key);
          const icon = RESOURCE_ICONS[key as keyof ResourceBundle];
          return (
            <Tooltip
              key={key}
              content={`${label} — par tour : ${(production?.[key as keyof ResourceBundle] ?? 0) >= 0 ? '+' : ''}${production?.[key as keyof ResourceBundle] ?? 0}`}
            >
              <div
                className={`${styles.chip} ${gained.has(key) ? styles.gained : ''}`}
                data-resource={key}
                data-empty={Math.floor(value) <= 0 ? 'true' : undefined}
                aria-label={`${label} : ${Math.floor(value ?? 0)}`}
              >
                <span className={styles.cardArt} aria-hidden="true">
                  {icon && <Icon name={icon} size={22} title={label} />}
                </span>
                <span className={styles.label}>{label}</span>
                <strong className={styles.amount}>{Math.floor(value ?? 0)}</strong>
              </div>
            </Tooltip>
          );
        })}
      </div>

      {commodityEntries.length > 0 && (
        <div className={styles.commodityShelf} aria-label="Marchandises Villes et Chevaliers">
          {commodityEntries.map(([key, value]) => {
            const presentation = COMMODITY_PRESENTATION[key];
            const label = frCommodity(key);
            return (
              <Tooltip
                key={key}
                content={`${label} — amélioration ${presentation.track} : ${value}`}
              >
                <div
                  className={`${styles.commodityChip} ${styles[presentation.tone]}`}
                  data-commodity={key}
                  data-track={presentation.track}
                  aria-label={`${label}, amélioration ${presentation.track} : ${value}`}
                >
                  <span className={styles.commodityIcon} aria-hidden="true">
                    <Icon name={presentation.icon} size={19} title={label} />
                  </span>
                  <span className={styles.commodityCopy}>
                    <small>{presentation.track}</small>
                    <span>{label}</span>
                  </span>
                  <strong aria-hidden="true">{value}</strong>
                </div>
              </Tooltip>
            );
          })}
        </div>
      )}

      {materialEntries.length > 0 && (
        <div className={styles.materialShelf} aria-label="Matériaux Souterrain et Ciel">
          {materialEntries.map(([key, value]) => {
            const label = MATERIAL_LABELS[key];
            return (
              <Tooltip key={key} content={`${label} — matériau Souterrain & Ciel`}>
                <div
                  className={styles.materialChip}
                  data-material={key}
                  aria-label={`${label} : ${value}`}
                >
                  <span className={styles.materialGem} aria-hidden="true" />
                  <span className={styles.materialCopy}>
                    <small>{key === 'us_crystal' ? 'Profondeurs' : 'Alizés'}</small>
                    <span>{label}</span>
                  </span>
                  <strong className={gained.has(key) ? styles.gained : undefined} aria-hidden="true">
                    {value}
                  </strong>
                </div>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}
