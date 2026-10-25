/**
 * Réseaux dormants après expiration / rupture de pacte.
 */

import type { GameState } from '../../types/game';
import type { PactsEmbassiesState, PeDormantSegment } from '../../types/pactsEmbassies';
import { queuePeEvents } from './events';

/**
 * Marque les segments dont la connectivité dépendait du pacte comme dormants.
 * Les pièces restent construites ; production / maîtrise / prolongation bloquées
 * jusqu’à reconnexion personnelle (gérée côté validation).
 */
export function markDormantForPact(
  state: GameState,
  pe: PactsEmbassiesState,
  pactId: string,
): void {
  const pact = pe.pacts.find((p) => p.id === pactId);
  if (!pact) return;

  // Segments déjà tagués via roundUsage / clause usage — placeholder structure.
  // Les validations de connectivité lisent pe.dormantSegments + pact status.
  const existing = pe.dormantSegments.filter((d) => d.pactId === pactId);
  if (existing.length === 0) {
    // Enregistrer un marqueur générique pour forcer le recalcul côté hooks
    const markers: PeDormantSegment[] = [
      {
        kind: 'road',
        ownerId: pact.partnerA,
        refId: `pact:${pactId}:open_borders`,
        pactId,
      },
      {
        kind: 'tunnel',
        ownerId: pact.partnerA,
        refId: `pact:${pactId}:underground`,
        pactId,
      },
      {
        kind: 'sky_route',
        ownerId: pact.partnerA,
        refId: `pact:${pactId}:trade_winds`,
        pactId,
      },
    ];
    pe.dormantSegments.push(...markers);
  }

  queuePeEvents(state, [
    {
      type: 'pe_networks_dormant',
      payload: { pactId, partners: [pact.partnerA, pact.partnerB] },
    },
  ]);
}

export function isPactConnectivityActive(
  pe: PactsEmbassiesState,
  pactId: string,
): boolean {
  const pact = pe.pacts.find((p) => p.id === pactId);
  return Boolean(pact && pact.status === 'active');
}

export function clearDormantIfReconnected(
  pe: PactsEmbassiesState,
  ownerId: string,
  kind: PeDormantSegment['kind'],
  refId: string,
): void {
  pe.dormantSegments = pe.dormantSegments.filter(
    (d) => !(d.ownerId === ownerId && d.kind === kind && d.refId === refId),
  );
}
