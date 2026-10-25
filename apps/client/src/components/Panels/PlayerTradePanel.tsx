import { useMemo, useState } from 'react';
import type { ResourceType } from '@catanx/engine';
import { frResource } from '../../i18n/fr';
import { Icon } from '../../ui';
import styles from './TradePanel.module.css';

const CLASSIC_RESOURCES: ResourceType[] = ['wood', 'clay', 'wheat', 'sheep', 'ore'];
const ALL_PARTNERS = '__all__';

interface PlayerOption {
  id: string;
  name: string;
}
interface PlayerTradePanelProps {
  partners: PlayerOption[];
  available: Partial<Record<ResourceType, number>>;
  pending: {
    id: string;
    fromName: string;
    toName: string;
    give: Partial<Record<ResourceType, number>>;
    receive: Partial<Record<ResourceType, number>>;
    role: 'proposer' | 'target' | 'spectator';
    termsHidden?: boolean;
  } | null;
  canPropose: boolean;
  onPropose: (
    toPlayerId: string | null,
    give: Partial<Record<ResourceType, number>>,
    receive: Partial<Record<ResourceType, number>>,
  ) => void;
  onAccept: (tradeId: string) => void;
  onReject: (tradeId: string) => void;
  onCancel: (tradeId: string) => void;
}

function formatBundle(bundle: Partial<Record<ResourceType, number>>): string {
  const parts = CLASSIC_RESOURCES.filter((resource) => (bundle[resource] ?? 0) > 0).map(
    (resource) => `${bundle[resource]} ${frResource(resource)}`,
  );
  return parts.length ? parts.join(', ') : '—';
}
function canAfford(
  available: Partial<Record<ResourceType, number>>,
  cost: Partial<Record<ResourceType, number>>,
): boolean {
  return CLASSIC_RESOURCES.every((resource) => (available[resource] ?? 0) >= (cost[resource] ?? 0));
}

export function PlayerTradePanel({
  partners,
  available,
  pending,
  canPropose,
  onPropose,
  onAccept,
  onReject,
  onCancel,
}: PlayerTradePanelProps) {
  const [toPlayerId, setToPlayerId] = useState(partners.length > 1 ? ALL_PARTNERS : (partners[0]?.id ?? ''));
  const [giveResource, setGiveResource] = useState<ResourceType>('wood');
  const [receiveResource, setReceiveResource] = useState<ResourceType>('ore');
  const [giveAmount, setGiveAmount] = useState(1);
  const [receiveAmount, setReceiveAmount] = useState(1);
  const partnerId = useMemo(() => {
    if (toPlayerId === ALL_PARTNERS && partners.length > 0) return ALL_PARTNERS;
    if (partners.some((p) => p.id === toPlayerId)) return toPlayerId;
    return partners.length > 1 ? ALL_PARTNERS : (partners[0]?.id ?? '');
  }, [partners, toPlayerId]);
  const maxGive = Math.max(1, available[giveResource] ?? 1);
  const clampedGive = Math.min(giveAmount, maxGive);
  const canSubmit =
    canPropose &&
    !pending &&
    Boolean(partnerId) &&
    giveResource !== receiveResource &&
    (available[giveResource] ?? 0) >= clampedGive;
  const targetCanAccept = pending?.role === 'target' && canAfford(available, pending.receive);

  return (
    <aside
      className={`ui-panel ${styles.panel}`}
      data-trade-panel="players"
      aria-label="Commerce entre joueurs"
    >
      <header className={styles.header}>
        <span className={styles.headerIcon}>
          <Icon name="trade" size={22} />
        </span>
        <div>
          <span className={styles.eyebrow}>TABLE DES NÉGOCIATIONS</span>
          <h3>Échange joueurs</h3>
        </div>
      </header>

      {pending ? (
        <div className={styles.pendingCard}>
          {pending.termsHidden || pending.role === 'spectator' ? (
            <>
              <strong>{pending.fromName}</strong> et <strong>{pending.toName}</strong> négocient.
              <p className={styles.notice}>Les termes restent privés jusqu’à la réponse.</p>
            </>
          ) : pending.role === 'target' ? (
            <>
              <strong>{pending.fromName}</strong> vous fait une proposition
              {pending.toName === 'tout le monde' ? ' (ouverte à tous)' : ''}.
              <div className={styles.bundle}>
                <span>
                  Vous donnez<strong>{formatBundle(pending.receive)}</strong>
                </span>
                <span>
                  Vous recevez<strong>{formatBundle(pending.give)}</strong>
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.tradeButton}
                  disabled={!targetCanAccept}
                  onClick={() => onAccept(pending.id)}
                >
                  Accepter
                </button>
                <button
                  type="button"
                  className={`${styles.secondaryButton} ${styles.danger}`}
                  onClick={() => onReject(pending.id)}
                >
                  Refuser
                </button>
              </div>
            </>
          ) : (
            <>
              Offre envoyée à <strong>{pending.toName}</strong>.
              <div className={styles.bundle}>
                <span>
                  Vous donnez<strong>{formatBundle(pending.give)}</strong>
                </span>
                <span>
                  Vous demandez<strong>{formatBundle(pending.receive)}</strong>
                </span>
              </div>
              {pending.role === 'proposer' && (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => onCancel(pending.id)}
                  >
                    Annuler l’offre
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : partners.length === 0 ? (
        <p className={styles.notice}>Aucun partenaire disponible pour le moment.</p>
      ) : (
        <>
          <div className={styles.offerGrid}>
            <label className={`${styles.field} ${styles.partnerField}`}>
              Partenaire
              <select
                value={partnerId}
                onChange={(event) => setToPlayerId(event.target.value)}
                disabled={!canPropose}
              >
                {partners.length > 1 && (
                  <option value={ALL_PARTNERS}>Tout le monde</option>
                )}
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Vous donnez
              <div className={styles.fieldRow}>
                <select
                  value={giveResource}
                  disabled={!canPropose}
                  onChange={(event) => setGiveResource(event.target.value as ResourceType)}
                >
                  {CLASSIC_RESOURCES.map((resource) => (
                    <option key={resource} value={resource}>
                      {frResource(resource)} · {available[resource] ?? 0}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Quantité donnée"
                  type="number"
                  min={1}
                  max={maxGive}
                  value={clampedGive}
                  disabled={!canPropose}
                  onChange={(event) =>
                    setGiveAmount(Math.min(maxGive, Math.max(1, Number(event.target.value) || 1)))
                  }
                />
              </div>
            </label>
            <label className={styles.field}>
              Vous demandez
              <div className={styles.fieldRow}>
                <select
                  value={receiveResource}
                  disabled={!canPropose}
                  onChange={(event) => setReceiveResource(event.target.value as ResourceType)}
                >
                  {CLASSIC_RESOURCES.map((resource) => (
                    <option key={resource} value={resource}>
                      {frResource(resource)}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Quantité demandée"
                  type="number"
                  min={1}
                  max={19}
                  value={receiveAmount}
                  disabled={!canPropose}
                  onChange={(event) =>
                    setReceiveAmount(Math.max(1, Number(event.target.value) || 1))
                  }
                />
              </div>
            </label>
          </div>
          {giveResource === receiveResource && (
            <p className={styles.notice}>Choisissez deux ressources différentes.</p>
          )}
          <button
            type="button"
            className={styles.tradeButton}
            disabled={!canSubmit}
            onClick={() =>
              onPropose(
                partnerId === ALL_PARTNERS ? null : partnerId,
                { [giveResource]: clampedGive },
                { [receiveResource]: receiveAmount },
              )
            }
          >
            <Icon name="trade" size={17} /> Envoyer la proposition
          </button>
        </>
      )}
    </aside>
  );
}
