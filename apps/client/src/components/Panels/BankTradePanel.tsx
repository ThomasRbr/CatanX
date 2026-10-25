import { useEffect, useMemo, useState } from 'react';
import {
  ResourceType,
  type UndergroundSkyMaterial,
  type UndergroundSkyMaterialBundle,
} from '@catanx/engine';
import { frResource } from '../../i18n/fr';
import { Icon, type CatanXIconName } from '../../ui';
import styles from './TradePanel.module.css';

const CLASSIC_RESOURCES: ResourceType[] = ['wood', 'clay', 'wheat', 'sheep', 'ore'];
const US_MATERIALS: UndergroundSkyMaterial[] = ['us_crystal', 'us_aether'];
const RESOURCE_ICONS: Record<string, CatanXIconName> = {
  wood: 'wood',
  clay: 'brick',
  wheat: 'wheat',
  sheep: 'sheep',
  ore: 'ore',
};
const MATERIAL_LABELS: Record<UndergroundSkyMaterial, string> = {
  us_crystal: 'Cristal',
  us_aether: 'Éther',
};

type TradeAsset =
  | { kind: 'resource'; key: ResourceType }
  | { kind: 'material'; key: UndergroundSkyMaterial };

interface BankTradePanelProps {
  getRatio: (giveResource: ResourceType) => number;
  getMaterialRatio?: () => number;
  available: Partial<Record<ResourceType, number>>;
  availableMaterials?: UndergroundSkyMaterialBundle;
  bankStock?: Partial<Record<ResourceType, number>>;
  materialBankStock?: UndergroundSkyMaterialBundle;
  tradeEnabled?: boolean;
  tradeDisabledReason?: string;
  onTrade: (
    give: Partial<Record<ResourceType, number>>,
    receive: Partial<Record<ResourceType, number>>,
    options?: {
      giveMaterials?: UndergroundSkyMaterialBundle;
      receiveMaterials?: UndergroundSkyMaterialBundle;
    },
  ) => { ok: boolean; reason?: string };
}

function assetKey(asset: TradeAsset): string {
  return `${asset.kind}:${asset.key}`;
}

function parseAsset(value: string): TradeAsset {
  const [kind, key] = value.split(':');
  if (kind === 'material') {
    return { kind: 'material', key: key as UndergroundSkyMaterial };
  }
  return { kind: 'resource', key: key as ResourceType };
}

export function BankTradePanel({
  getRatio,
  getMaterialRatio,
  available,
  availableMaterials,
  bankStock,
  materialBankStock,
  tradeEnabled = true,
  tradeDisabledReason,
  onTrade,
}: BankTradePanelProps) {
  const materialsEnabled = Boolean(availableMaterials || materialBankStock);
  const [giveAsset, setGiveAsset] = useState<TradeAsset>({ kind: 'resource', key: 'wood' });
  const [receiveAsset, setReceiveAsset] = useState<TradeAsset>({
    kind: 'resource',
    key: 'ore',
  });

  const giveRatio =
    giveAsset.kind === 'material'
      ? (getMaterialRatio?.() ?? 4)
      : getRatio(giveAsset.key);
  const giveAmount = giveRatio;

  const hasGiveStock =
    giveAsset.kind === 'resource'
      ? (available[giveAsset.key] ?? 0) >= giveAmount
      : (availableMaterials?.[giveAsset.key] ?? 0) >= giveAmount;

  const bankHasReceive =
    receiveAsset.kind === 'resource'
      ? (bankStock?.[receiveAsset.key] ?? 0) >= 1
      : (materialBankStock?.[receiveAsset.key] ?? 0) >= 1;

  const sameAsset =
    giveAsset.kind === receiveAsset.kind && giveAsset.key === receiveAsset.key;
  const canTrade =
    tradeEnabled &&
    Boolean(bankStock || materialBankStock) &&
    hasGiveStock &&
    !sameAsset &&
    bankHasReceive;

  const disabledReason = useMemo(() => {
    if (!tradeEnabled) return tradeDisabledReason ?? 'Disponible pendant votre phase d’action.';
    if (!bankStock && !materialBankStock) return 'Banque indisponible — rechargez la partie.';
    if (sameAsset) return 'Choisissez deux biens différents.';
    if (!hasGiveStock) {
      const label =
        giveAsset.kind === 'resource'
          ? frResource(giveAsset.key)
          : MATERIAL_LABELS[giveAsset.key];
      return `Il vous faut ${giveAmount} ${label}.`;
    }
    if (!bankHasReceive) {
      const label =
        receiveAsset.kind === 'resource'
          ? frResource(receiveAsset.key)
          : MATERIAL_LABELS[receiveAsset.key];
      return `La banque n’a plus de ${label}.`;
    }
    return null;
  }, [
    bankHasReceive,
    bankStock,
    giveAmount,
    giveAsset,
    hasGiveStock,
    materialBankStock,
    receiveAsset,
    sameAsset,
    tradeDisabledReason,
    tradeEnabled,
  ]);

  useEffect(() => {
    if (!sameAsset) return;
    const fallbackResource = CLASSIC_RESOURCES.find(
      (resource) =>
        !(giveAsset.kind === 'resource' && giveAsset.key === resource) &&
        (bankStock?.[resource] ?? 1) >= 1,
    );
    if (fallbackResource) {
      setReceiveAsset({ kind: 'resource', key: fallbackResource });
      return;
    }
    if (materialsEnabled) {
      const fallbackMaterial = US_MATERIALS.find(
        (material) =>
          !(giveAsset.kind === 'material' && giveAsset.key === material) &&
          (materialBankStock?.[material] ?? 0) >= 1,
      );
      if (fallbackMaterial) {
        setReceiveAsset({ kind: 'material', key: fallbackMaterial });
      }
    }
  }, [bankStock, giveAsset, materialBankStock, materialsEnabled, sameAsset]);

  return (
    <aside
      className={`ui-panel ${styles.panel}`}
      data-trade-panel="bank"
      aria-label="Commerce avec la banque"
    >
      <header className={styles.header}>
        <span className={styles.headerIcon}>
          <Icon name="trade" size={22} />
        </span>
        <div>
          <span className={styles.eyebrow}>COMPTOIR MARITIME</span>
          <h3>Banque & ports</h3>
        </div>
        <span className={styles.ratio}>
          {giveRatio}
          <small>pour</small>1
        </span>
      </header>

      {bankStock && (
        <div className={styles.bankShelf} aria-label="Réserves de la banque">
          {CLASSIC_RESOURCES.map((resource) => (
            <span
              key={resource}
              className={styles.bankToken}
              data-resource={resource}
              title={`${frResource(resource)} : ${bankStock[resource] ?? 0}`}
            >
              <Icon name={RESOURCE_ICONS[resource]!} size={15} />
              <strong>{bankStock[resource] ?? 0}</strong>
            </span>
          ))}
          {materialsEnabled &&
            US_MATERIALS.map((material) => (
              <span
                key={material}
                className={styles.bankToken}
                data-material={material}
                title={`${MATERIAL_LABELS[material]} : ${materialBankStock?.[material] ?? 0}`}
              >
                <strong>
                  {MATERIAL_LABELS[material].slice(0, 1)}
                  {materialBankStock?.[material] ?? 0}
                </strong>
              </span>
            ))}
        </div>
      )}

      <div className={styles.exchange}>
        <label className={styles.resourcePick} data-tone="give">
          <span>Vous donnez</span>
          <div className={styles.pickValue}>
            {giveAsset.kind === 'resource' ? (
              <Icon name={RESOURCE_ICONS[giveAsset.key]!} size={22} />
            ) : (
              <strong>{MATERIAL_LABELS[giveAsset.key].slice(0, 1)}</strong>
            )}
            <strong>{giveAmount}</strong>
          </div>
          <select
            value={assetKey(giveAsset)}
            onChange={(event) => setGiveAsset(parseAsset(event.target.value))}
          >
            {CLASSIC_RESOURCES.map((resource) => (
              <option key={resource} value={`resource:${resource}`}>
                {frResource(resource)} · {available[resource] ?? 0} en main ·{' '}
                {getRatio(resource)}:1
              </option>
            ))}
            {materialsEnabled &&
              US_MATERIALS.map((material) => (
                <option key={material} value={`material:${material}`}>
                  {MATERIAL_LABELS[material]} · {availableMaterials?.[material] ?? 0} ·{' '}
                  {getMaterialRatio?.() ?? 4}:1
                </option>
              ))}
          </select>
        </label>

        <span className={styles.exchangeArrow} aria-hidden="true">
          →
        </span>

        <label className={styles.resourcePick} data-tone="receive">
          <span>Vous recevez</span>
          <div className={styles.pickValue}>
            {receiveAsset.kind === 'resource' ? (
              <Icon name={RESOURCE_ICONS[receiveAsset.key]!} size={22} />
            ) : (
              <strong>{MATERIAL_LABELS[receiveAsset.key].slice(0, 1)}</strong>
            )}
            <strong>1</strong>
          </div>
          <select
            value={assetKey(receiveAsset)}
            onChange={(event) => setReceiveAsset(parseAsset(event.target.value))}
          >
            {CLASSIC_RESOURCES.map((resource) => (
              <option
                key={resource}
                value={`resource:${resource}`}
                disabled={
                  (giveAsset.kind === 'resource' && giveAsset.key === resource) ||
                  (typeof bankStock?.[resource] === 'number' &&
                    (bankStock[resource] ?? 0) < 1)
                }
              >
                {frResource(resource)}
                {typeof bankStock?.[resource] === 'number'
                  ? ` · banque ${bankStock[resource]}`
                  : ''}
              </option>
            ))}
            {materialsEnabled &&
              US_MATERIALS.map((material) => (
                <option
                  key={material}
                  value={`material:${material}`}
                  disabled={
                    (giveAsset.kind === 'material' && giveAsset.key === material) ||
                    (materialBankStock?.[material] ?? 0) < 1
                  }
                >
                  {MATERIAL_LABELS[material]} · banque {materialBankStock?.[material] ?? 0}
                </option>
              ))}
          </select>
        </label>
      </div>

      {disabledReason && <p className={styles.notice}>{disabledReason}</p>}
      <button
        type="button"
        className={styles.tradeButton}
        disabled={!canTrade}
        onClick={() => {
          const give =
            giveAsset.kind === 'resource' ? { [giveAsset.key]: giveAmount } : {};
          const receive =
            receiveAsset.kind === 'resource' ? { [receiveAsset.key]: 1 } : {};
          if (giveAsset.kind === 'material' || receiveAsset.kind === 'material') {
            onTrade(give, receive, {
              giveMaterials:
                giveAsset.kind === 'material' ? { [giveAsset.key]: giveAmount } : undefined,
              receiveMaterials:
                receiveAsset.kind === 'material' ? { [receiveAsset.key]: 1 } : undefined,
            });
          } else {
            // Keep the historical two-argument contract for classic trades.
            onTrade(give, receive);
          }
        }}
      >
        <Icon name="trade" size={17} />
        Confirmer l’échange
      </button>
    </aside>
  );
}
