import { useEffect, useMemo, useState } from 'react';
import {
  chancellorScore,
  delegateCount,
  evaluateMandateCondition,
  getDelegates,
  getResolutionById,
  isPactsEmbassiesEnabled,
  maxActivePactsForPlayer,
  type GameState,
  type PactClauseKind,
  type PeCouncilProposal,
} from '@catanx/engine';
import { Icon } from '../../ui';
import styles from './PactsEmbassiesPanel.module.css';

type PeTab = 'relations' | 'ambassades' | 'conseil' | 'mandats';
type PeIconName = PeTab | 'influence' | 'reputation' | 'delegates' | 'seal' | 'alert';

interface PactsEmbassiesPanelProps {
  gameState: GameState;
  playerId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  canAct?: boolean;
  onBuildEmbassy?: (intersectionId: string) => void;
  onProposePact?: (toPlayerId: string, clauses: PactClauseKind[]) => void;
  onCounterPact?: (offerId: string, clauses: PactClauseKind[]) => void;
  onAcceptPact?: (offerId: string) => void;
  onRejectPact?: (offerId: string) => void;
  onBreakPact?: (pactId: string) => void;
  onProposeMutualDissolution?: (pactId: string) => void;
  onAcceptMutualDissolution?: (pactId: string) => void;
  onSponsorResolution?: (proposalId: string) => void;
  onCastCouncilVote?: (proposalId: string, variantId: string, extraVotes?: number) => void;
  onLobbyNeutralDelegation?: (delegationId: string, amount: number) => void;
  onContributeToCrisis?: (
    classic?: Record<string, number>,
    commodities?: Record<string, number>,
    materials?: Record<string, number>,
  ) => void;
  onClaimMandate?: (mandateId: string) => void;
}

const TABS: Array<{ id: PeTab; label: string; short: string }> = [
  { id: 'relations', label: 'Pactes & relations', short: 'Pactes' },
  { id: 'ambassades', label: 'Ambassades', short: 'Ambassades' },
  { id: 'conseil', label: 'Conseil mondial', short: 'Conseil' },
  { id: 'mandats', label: 'Mandats', short: 'Mandats' },
];

const TAB_GUIDES: Record<PeTab, { eyebrow: string; title: string; copy: string; step: string }> = {
  relations: {
    eyebrow: 'Diplomatie bilatérale',
    title: 'Scellez des alliances utiles',
    copy: 'Choisissez un partenaire, négociez jusqu’à deux clauses et honorez votre parole.',
    step: '1 Influence est déposée par signataire',
  },
  ambassades: {
    eyebrow: 'Réseau diplomatique',
    title: 'Étendez votre représentation',
    copy: 'Une ambassade se bâtit sur l’une de vos villes et ajoute un délégué au Conseil.',
    step: 'Maximum 3 ambassades par joueur',
  },
  conseil: {
    eyebrow: 'Décisions mondiales',
    title: 'Façonnez les règles de l’île',
    copy: 'Examinez les propositions, défendez une variante puis engagez vos délégués au vote.',
    step: 'Une session suit cinq phases lisibles',
  },
  mandats: {
    eyebrow: 'Prestige diplomatique',
    title: 'Transformez vos actes en victoire',
    copy: 'Remplissez les conditions publiques, revendiquez jusqu’à deux mandats et visez la chancellerie.',
    step: 'Chaque mandat vaut 1 PV permanent',
  },
};

const CLAUSE_INFO: Record<PactClauseKind, { label: string; description: string; mark: string }> = {
  trade_accord: {
    label: 'Accord commercial',
    description: 'Premier échange allié : +1 Influence chacun.',
    mark: '↔',
  },
  port_charter: {
    label: 'Charte portuaire',
    description: 'Utilisez son port 3:1, une fois par ronde.',
    mark: '⚓',
  },
  open_borders: {
    label: 'Frontières ouvertes',
    description: 'Vos routes peuvent traverser son réseau.',
    mark: '⌁',
  },
  shared_reserve: {
    label: 'Réserve commune',
    description: '+1 carte à votre limite de main.',
    mark: '◇',
  },
  underground_passage: {
    label: 'Passage souterrain',
    description: 'Vos tunnels empruntent son réseau souterrain.',
    mark: '▽',
  },
  trade_winds: {
    label: 'Alizés partagés',
    description: 'Vos trajets empruntent son réseau céleste.',
    mark: '△',
  },
};

const CLAUSE_OPTIONS = Object.keys(CLAUSE_INFO) as PactClauseKind[];

const COUNCIL_PHASES = [
  { id: 'reveal', label: 'Révéler' },
  { id: 'negotiate', label: 'Débattre' },
  { id: 'confirm_ambitious', label: 'Soutenir' },
  { id: 'vote', label: 'Voter' },
  { id: 'reveal_votes', label: 'Résultat' },
] as const;

const PHASE_EXPLANATIONS: Record<string, string> = {
  reveal: 'Les propositions de cette session viennent d’être dévoilées.',
  negotiate: 'Comparez les variantes et préparez vos alliances.',
  confirm_ambitious: 'Un joueur peut parrainer la variante la plus ambitieuse.',
  vote: 'Choisissez une variante et engagez vos voix.',
  reveal_votes: 'Les suffrages sont révélés et les résolutions entrent en vigueur.',
  idle: 'Le Conseil est en pause jusqu’à la prochaine session.',
};

function PeIcon({ name, className }: { name: PeIconName; className?: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.55, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {name === 'relations' && <><path {...common} d="M4 8.5 8.2 5l3.8 2.8L15.8 5 20 8.5l-3 4.2-5 4.8-5-4.8Z" /><path {...common} d="m8.2 10.2 2.3 2.1a2.2 2.2 0 0 0 3 0l2.3-2.1" /></>}
      {name === 'ambassades' && <><path {...common} d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-6h6v6M8 10h8" /><path {...common} d="M12 5V2m0 0 4 1.5L12 5" /></>}
      {name === 'conseil' && <><circle {...common} cx="12" cy="12" r="3.2" /><circle {...common} cx="12" cy="12" r="8.2" /><path {...common} d="M12 3.8v3m0 10.4v3M3.8 12h3m10.4 0h3M6.2 6.2l2.1 2.1m7.4 7.4 2.1 2.1m0-11.6-2.1 2.1m-7.4 7.4-2.1 2.1" /></>}
      {name === 'mandats' && <><path {...common} d="M7 3.8h10v16.4l-5-2.7-5 2.7Z" /><circle {...common} cx="12" cy="10" r="2.7" /><path {...common} d="m10.8 10 1 1 1.8-2" /></>}
      {name === 'influence' && <><path {...common} d="M12 3 15 9l6 .9-4.5 4.3 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.9 9 9Z" /></>}
      {name === 'reputation' && <><circle {...common} cx="12" cy="12" r="8.5" /><path {...common} d="m8.2 12 2.4 2.4 5.2-5.2" /></>}
      {name === 'delegates' && <><circle {...common} cx="8" cy="8.2" r="2.5" /><circle {...common} cx="16.4" cy="9.2" r="2" /><path {...common} d="M3.8 19c.4-3.6 2-5.5 4.6-5.5S12.6 15.4 13 19m.2-4.2c.8-1.1 1.9-1.6 3.3-1.6 2.2 0 3.4 1.6 3.7 4.7" /></>}
      {name === 'seal' && <><circle {...common} cx="12" cy="10" r="5.2" /><path {...common} d="m9.2 14.3-1 6 3.8-2.2 3.8 2.2-1-6" /></>}
      {name === 'alert' && <><path {...common} d="M12 3.5 21 20H3Z" /><path {...common} d="M12 9v5m0 2.8v.2" /></>}
    </svg>
  );
}

function playerLabel(gameState: GameState, id: string): string {
  return gameState.players.get(id)?.name ?? id.slice(0, 6);
}

function proposalCategoryLabel(category: string): string {
  return ({ commerce: 'Commerce', infrastructure: 'Infrastructure', solidarity: 'Solidarité', vertical_world: 'Monde vertical' } as Record<string, string>)[category] ?? category;
}

function councilPhaseIndex(phase: string): number {
  return COUNCIL_PHASES.findIndex((item) => item.id === phase);
}

function MandateStatus({ ready, claimed }: { ready: boolean; claimed: boolean }) {
  return (
    <span className={styles.statusPill} data-status={claimed ? 'claimed' : ready ? 'ready' : 'progress'}>
      {claimed ? 'Revendiqué' : ready ? 'Prêt à revendiquer' : 'En progression'}
    </span>
  );
}

function ClausePills({ clauses }: { clauses: PactClauseKind[] }) {
  if (clauses.length === 0) return <span className={styles.secretClause}>Clauses confidentielles</span>;
  return (
    <div className={styles.clausePills}>
      {clauses.map((clause) => (
        <span key={clause} title={CLAUSE_INFO[clause].description}>
          <b aria-hidden="true">{CLAUSE_INFO[clause].mark}</b>
          {CLAUSE_INFO[clause].label}
        </span>
      ))}
    </div>
  );
}

function CouncilProposalCard({
  proposal,
  selectedVariant,
  canAct,
  canVote,
  onSelect,
  onSponsor,
  onVote,
}: {
  proposal: PeCouncilProposal;
  selectedVariant: string;
  canAct: boolean;
  canVote: boolean;
  onSelect: (variantId: string) => void;
  onSponsor: () => void;
  onVote: () => void;
}) {
  return (
    <article className={styles.proposalCard}>
      <div className={styles.proposalHeading}>
        <div>
          <span>{proposalCategoryLabel(proposal.category)}</span>
          <h5>{proposal.title}</h5>
        </div>
        {!proposal.ambitiousConfirmed && (
          <button type="button" className={styles.secondaryBtn} disabled={!canAct} onClick={onSponsor}>
            Parrainer
          </button>
        )}
      </div>
      <div className={styles.variantList} role="radiogroup" aria-label={`Variantes pour ${proposal.title}`}>
        {proposal.variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            role="radio"
            aria-checked={selectedVariant === variant.id}
            className={styles.variantBtn}
            data-kind={variant.kind}
            onClick={() => onSelect(variant.id)}
            disabled={!canAct || !canVote}
          >
            <span className={styles.variantDot} />
            <span>{variant.label}</span>
          </button>
        ))}
      </div>
      {canVote && (
        <button type="button" className={styles.primaryBtn} disabled={!canAct || !selectedVariant} onClick={onVote}>
          Déposer mon vote
        </button>
      )}
    </article>
  );
}

export function PactsEmbassiesPanel({
  gameState,
  playerId,
  open: controlledOpen,
  onOpenChange,
  canAct = false,
  onBuildEmbassy,
  onProposePact,
  onCounterPact,
  onAcceptPact,
  onRejectPact,
  onBreakPact,
  onProposeMutualDissolution,
  onAcceptMutualDissolution,
  onSponsorResolution,
  onCastCouncilVote,
  onLobbyNeutralDelegation,
  onContributeToCrisis,
  onClaimMandate,
}: PactsEmbassiesPanelProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => onOpenChange ? onOpenChange(next) : setLocalOpen(next);
  const [tab, setTab] = useState<PeTab>('relations');
  const [partnerId, setPartnerId] = useState('');
  const [selectedClauses, setSelectedClauses] = useState<PactClauseKind[]>(['trade_accord']);
  const [composerOpen, setComposerOpen] = useState(false);
  const [embassyIntersectionId, setEmbassyIntersectionId] = useState('');
  const [voteByProposal, setVoteByProposal] = useState<Record<string, string>>({});
  const [councilToolsOpen, setCouncilToolsOpen] = useState(false);
  const [lobbyDelegationId, setLobbyDelegationId] = useState('');
  const [lobbyAmount, setLobbyAmount] = useState(1);

  const pe = gameState.extensions?.pactsEmbassies;
  const enabled = isPactsEmbassiesEnabled(gameState) && Boolean(pe);
  const myPending = useMemo(() => pe?.pendingChoices.filter((choice) => choice.playerId === playerId) ?? [], [pe, playerId]);
  const citySites = useMemo(() => {
    const board = gameState.classicBoard;
    if (!board || !pe) return [] as string[];
    return Object.entries(board.occupiedIntersections)
      .filter(([intersectionId, owner]) => {
        if (owner !== playerId) return false;
        const building = board.buildingByIntersection[intersectionId];
        return (building === 'city' || building === 'metropolis') && !pe.embassies.some((embassy) => embassy.intersectionId === intersectionId);
      })
      .map(([id]) => id);
  }, [gameState.classicBoard, pe, playerId]);

  const hasUrgent = myPending.length > 0;
  const badgeCount = myPending.length + (pe?.crisis && !pe.crisis.resolved ? 1 : 0);

  useEffect(() => {
    if (hasUrgent) {
      setOpen(true);
      const urgentKind = myPending[0]?.kind;
      setTab(urgentKind === 'council_vote' || urgentKind === 'crisis_contribute' ? 'conseil' : urgentKind === 'claim_mandate' ? 'mandats' : 'relations');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urgent choices open the controlled dock
  }, [hasUrgent]);

  useEffect(() => {
    setPartnerId('');
    setSelectedClauses(['trade_accord']);
    setComposerOpen(false);
    setEmbassyIntersectionId('');
  }, [playerId]);

  if (!enabled || !pe) return null;

  const me = pe.players[playerId];
  const influence = me?.influence ?? 0;
  const reputation = me?.reputation ?? 3;
  const myEmbassies = pe.embassies.filter((embassy) => embassy.playerId === playerId);
  const activeEmbassyCount = myEmbassies.filter((embassy) => !embassy.suspended).length;
  const delegates = getDelegates(pe, playerId);
  const impliedDelegates = delegateCount(activeEmbassyCount);
  const myOffers = pe.pactOffers.filter((offer) => offer.status === 'pending' && (offer.fromPlayerId === playerId || offer.toPlayerId === playerId));
  const incomingOffers = myOffers.filter((offer) => offer.toPlayerId === playerId);
  const outgoingOffers = myOffers.filter((offer) => offer.fromPlayerId === playerId);
  const activePacts = pe.pacts.filter((pact) => pact.status === 'active' && (pact.partnerA === playerId || pact.partnerB === playerId));
  const partners = gameState.turnOrder.filter((id) => id !== playerId);
  const pactCapacity = maxActivePactsForPlayer(activeEmbassyCount);
  const guide = TAB_GUIDES[tab];
  const myChancellorScore = chancellorScore(pe, playerId);
  const currentPhaseIndex = councilPhaseIndex(pe.council.phase);
  const canVote = pe.council.phase === 'vote' || pe.council.phase === 'confirm_ambitious';

  const toggleClause = (clause: PactClauseKind) => {
    setSelectedClauses((current) => {
      if (current.includes(clause)) return current.length === 1 ? current : current.filter((item) => item !== clause);
      if (current.length >= pactCapacity.maxClauses) return [...current.slice(1), clause];
      return [...current, clause];
    });
  };

  const relationsBody = (
    <>
      <div className={styles.quickStats}>
        <div><strong>{activePacts.length}/{pactCapacity.maxPacts}</strong><span>Pactes actifs</span></div>
        <div><strong>{incomingOffers.length}</strong><span>À examiner</span></div>
        <div><strong>{pactCapacity.maxClauses}</strong><span>Clauses / pacte</span></div>
      </div>

      {incomingOffers.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionTitle}><span>À traiter maintenant</span><b>{incomingOffers.length}</b></div>
          <div className={styles.cardStack}>
            {incomingOffers.map((offer) => (
              <article key={offer.id} className={styles.offerCard} data-incoming="true">
                <div className={styles.avatarToken}>{playerLabel(gameState, offer.fromPlayerId).slice(0, 1)}</div>
                <div className={styles.offerCopy}>
                  <span>Proposition de</span>
                  <h5>{playerLabel(gameState, offer.fromPlayerId)}</h5>
                  <ClausePills clauses={offer.clauses} />
                </div>
                <div className={styles.offerActions}>
                  <button type="button" className={styles.primaryBtn} disabled={!canAct || influence < 1} onClick={() => onAcceptPact?.(offer.id)}>Accepter · 1 Infl.</button>
                  <button type="button" className={styles.secondaryBtn} disabled={!canAct} onClick={() => onCounterPact?.(offer.id, selectedClauses)}>Contre-proposer</button>
                  <button type="button" className={styles.textBtn} disabled={!canAct} onClick={() => onRejectPact?.(offer.id)}>Refuser</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionTitle}><span>Vos pactes</span><small>4 rondes</small></div>
        {activePacts.length === 0 ? (
          <div className={styles.emptyState}><PeIcon name="relations" /><strong>Aucun pacte actif</strong><span>Une alliance bien choisie peut accélérer votre stratégie sans l’encombrer.</span></div>
        ) : (
          <div className={styles.cardStack}>
            {activePacts.map((pact) => {
              const partner = pact.partnerA === playerId ? pact.partnerB : pact.partnerA;
              const dissolutionRequested = pact.mutualDissolutionProposedBy && pact.mutualDissolutionProposedBy !== playerId;
              return (
                <article key={pact.id} className={styles.pactCard}>
                  <div className={styles.pactTop}><div className={styles.avatarToken}>{playerLabel(gameState, partner).slice(0, 1)}</div><div><span>Alliance avec</span><h5>{playerLabel(gameState, partner)}</h5></div><strong>R{pact.expiresAtRound}</strong></div>
                  <ClausePills clauses={pact.clauses} />
                  <div className={styles.compactActions}>
                    {dissolutionRequested ? (
                      <button type="button" className={styles.primaryBtn} disabled={!canAct} onClick={() => onAcceptMutualDissolution?.(pact.id)}>Accepter la dissolution</button>
                    ) : (
                      <button type="button" className={styles.secondaryBtn} disabled={!canAct} onClick={() => onProposeMutualDissolution?.(pact.id)}>Dissoudre ensemble</button>
                    )}
                    <button type="button" className={styles.dangerBtn} disabled={!canAct} onClick={() => onBreakPact?.(pact.id)}>Rompre · −2 Rép.</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {outgoingOffers.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionTitle}><span>En attente de réponse</span></div>
          {outgoingOffers.map((offer) => <div key={offer.id} className={styles.sentOffer}><span>À {playerLabel(gameState, offer.toPlayerId)}</span><ClausePills clauses={offer.clauses} /><small>Expire ronde {offer.expiresAtRound}</small></div>)}
        </section>
      )}

      <section className={styles.section}>
        <button type="button" className={styles.composerToggle} aria-expanded={composerOpen} onClick={() => setComposerOpen((value) => !value)}>
          <span><PeIcon name="seal" /><b>Nouveau pacte</b><small>Choisir un partenaire et ses clauses</small></span><i>{composerOpen ? '−' : '+'}</i>
        </button>
        {composerOpen && (
          <div className={styles.composer}>
            <label className={styles.field}><span><b>1</b> Partenaire</span><select value={partnerId} onChange={(event) => setPartnerId(event.target.value)} disabled={!canAct}><option value="">Choisir un joueur…</option>{partners.map((id) => <option key={id} value={id}>{playerLabel(gameState, id)}</option>)}</select></label>
            <div className={styles.field}><span><b>2</b> Clauses <em>{selectedClauses.length}/{pactCapacity.maxClauses}</em></span><p className={styles.clauseHint}>Choisissez l’effet partagé par les deux signataires.</p><div className={styles.clauseGrid}>{CLAUSE_OPTIONS.map((clause) => <button key={clause} type="button" data-selected={selectedClauses.includes(clause)} onClick={() => toggleClause(clause)} disabled={!canAct} aria-pressed={selectedClauses.includes(clause)}><i>{CLAUSE_INFO[clause].mark}</i><span><b>{CLAUSE_INFO[clause].label}</b><small>{CLAUSE_INFO[clause].description}</small></span></button>)}</div></div>
            <div className={styles.composerFooter}><span><PeIcon name="influence" /> Dépôt : <b>1 Influence</b></span><button type="button" className={styles.primaryBtn} disabled={!canAct || !partnerId || influence < 1 || activePacts.length >= pactCapacity.maxPacts} onClick={() => { onProposePact?.(partnerId, selectedClauses); setComposerOpen(false); }}>Envoyer la proposition</button></div>
          </div>
        )}
      </section>
    </>
  );

  const embassiesBody = (
    <>
      <section className={styles.embassyOverview}>
        <div className={styles.embassySlots} aria-label={`${myEmbassies.length} ambassades sur 3`}>
          {[0, 1, 2].map((slot) => <span key={slot} data-filled={slot < myEmbassies.length}><PeIcon name="ambassades" /><b>{slot < myEmbassies.length ? slot + 1 : 'Libre'}</b></span>)}
        </div>
        <div className={styles.benefitCallout}><PeIcon name="delegates" /><div><strong>{impliedDelegates} délégué{impliedDelegates > 1 ? 's' : ''} au Conseil</strong><span>1 de base + 1 par ambassade active</span></div></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><span>Votre réseau</span><small>{activeEmbassyCount} active{activeEmbassyCount > 1 ? 's' : ''}</small></div>
        {myEmbassies.length === 0 ? <div className={styles.emptyState}><PeIcon name="ambassades" /><strong>Votre première ambassade vous attend</strong><span>Améliorez d’abord une colonie en ville, puis installez-y votre représentation.</span></div> : <div className={styles.cardStack}>{myEmbassies.map((embassy, index) => <article key={embassy.id} className={styles.embassyCard} data-suspended={embassy.suspended}><span className={styles.embassyNumber}>0{index + 1}</span><div><small>{embassy.suspended ? 'Représentation suspendue' : 'Représentation active'}</small><h5>Ambassade de {playerLabel(gameState, playerId)}</h5><p>{embassy.consulatePactId ? 'Consulat relié à un pacte actif' : 'Prête à accueillir un consulat'}</p></div><span className={styles.statusLight} /></article>)}</div>}
      </section>

      <section className={styles.buildCard}>
        <div className={styles.buildHeader}><div><span>Nouvelle représentation</span><h4>Bâtir une ambassade</h4></div><div className={styles.costRow} aria-label="Coût : un mouton, un blé et un minerai"><span title="1 mouton">🐑 <b>1</b></span><span title="1 blé">🌾 <b>1</b></span><span title="1 minerai">◆ <b>1</b></span></div></div>
        <ol className={styles.howTo}><li><b>1</b><span>Posséder une ville ou métropole libre</span></li><li><b>2</b><span>Payer les trois ressources</span></li><li><b>3</b><span>Gagner immédiatement un délégué</span></li></ol>
        <label className={styles.field}><span>Emplacement disponible</span><select value={embassyIntersectionId} onChange={(event) => setEmbassyIntersectionId(event.target.value)} disabled={!canAct || citySites.length === 0}><option value="">{citySites.length === 0 ? 'Aucune ville disponible' : 'Choisir une ville…'}</option>{citySites.map((id, index) => <option key={id} value={id}>Ville {index + 1} · {id}</option>)}</select></label>
        <button type="button" className={styles.primaryBtn} disabled={!canAct || !embassyIntersectionId || myEmbassies.length >= 3} onClick={() => onBuildEmbassy?.(embassyIntersectionId)}>Construire l’ambassade</button>
      </section>
    </>
  );

  const council = pe.council;
  const crisisTotal = pe.crisis?.contributions.reduce((sum, contribution) => sum + contribution.classicPoints + contribution.commodityPoints + contribution.materialPoints, 0) ?? 0;
  const councilBody = (
    <>
      <section className={styles.councilStatus}>
        <div className={styles.sessionLabel}><span>Session {council.sessionIndex || '—'}</span><strong>Ronde {council.roundInSession}/{council.roundsPerSession}</strong></div>
        <div className={styles.phaseTrack} aria-label={`Phase du Conseil : ${COUNCIL_PHASES[currentPhaseIndex]?.label ?? 'En pause'}`}>
          {COUNCIL_PHASES.map((phase, index) => <div key={phase.id} data-state={index < currentPhaseIndex ? 'done' : index === currentPhaseIndex ? 'active' : 'next'}><span>{index < currentPhaseIndex ? '✓' : index + 1}</span><small>{phase.label}</small></div>)}
        </div>
        <p>{PHASE_EXPLANATIONS[council.phase] ?? PHASE_EXPLANATIONS.idle}</p>
      </section>

      {pe.crisis && !pe.crisis.resolved && (
        <section className={styles.crisisCard}>
          <div className={styles.crisisTop}><PeIcon name="alert" /><div><span>Crise collective</span><h4>{pe.crisis.title}</h4></div><strong>{Math.min(100, Math.round((crisisTotal / Math.max(1, pe.crisis.objective)) * 100))}%</strong></div>
          <div className={styles.progressTrack}><span style={{ width: `${Math.min(100, (crisisTotal / Math.max(1, pe.crisis.objective)) * 100)}%` }} /></div>
          <div className={styles.crisisFooter}><span>{crisisTotal} / {pe.crisis.objective} points réunis</span><button type="button" className={styles.primaryBtn} disabled={!canAct} onClick={() => onContributeToCrisis?.({ wheat: 1 })}>Contribuer · 1 blé</button></div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionTitle}><span>Propositions de la session</span><small>{delegates} voix de base</small></div>
        {council.proposals.length === 0 ? <div className={styles.emptyState}><PeIcon name="conseil" /><strong>Aucune proposition révélée</strong><span>Le prochain ordre du jour apparaîtra à l’ouverture de la session.</span></div> : <div className={styles.cardStack}>{council.proposals.map((proposal) => <CouncilProposalCard key={proposal.id} proposal={proposal} selectedVariant={voteByProposal[proposal.id] ?? ''} canAct={canAct} canVote={canVote} onSelect={(variantId) => setVoteByProposal((current) => ({ ...current, [proposal.id]: variantId }))} onSponsor={() => onSponsorResolution?.(proposal.id)} onVote={() => onCastCouncilVote?.(proposal.id, voteByProposal[proposal.id]!)} />)}</div>}
      </section>

      <section className={styles.section}>
        <button type="button" className={styles.composerToggle} aria-expanded={councilToolsOpen} onClick={() => setCouncilToolsOpen((value) => !value)}><span><PeIcon name="delegates" /><b>Influencer les délégations</b><small>Lobby optionnel avec votre Influence</small></span><i>{councilToolsOpen ? '−' : '+'}</i></button>
        {councilToolsOpen && <div className={styles.composer}><label className={styles.field}><span>Délégation neutre</span><select value={lobbyDelegationId} onChange={(event) => setLobbyDelegationId(event.target.value)} disabled={!canAct}><option value="">Choisir…</option>{council.neutralDelegations.map((delegation) => <option key={delegation.id} value={delegation.id}>{delegation.label} · {delegation.votes} voix</option>)}</select></label><label className={styles.field}><span>Mise d’Influence <em>1 à 2</em></span><input type="number" min={1} max={2} value={lobbyAmount} onChange={(event) => setLobbyAmount(Math.max(1, Math.min(2, Number(event.target.value) || 1)))} disabled={!canAct} /></label><button type="button" className={styles.primaryBtn} disabled={!canAct || !lobbyDelegationId || influence < lobbyAmount} onClick={() => onLobbyNeutralDelegation?.(lobbyDelegationId, lobbyAmount)}>Engager {lobbyAmount} Influence</button></div>}
      </section>

      {pe.activeResolutions.length > 0 && <section className={styles.section}><div className={styles.sectionTitle}><span>Résolutions en vigueur</span><small>{pe.activeResolutions.length}/2</small></div><div className={styles.resolutionGrid}>{pe.activeResolutions.map((resolution) => { const definition = getResolutionById(resolution.resolutionId); return <article key={resolution.id}><PeIcon name="seal" /><div><strong>{definition?.title ?? 'Résolution active'}</strong><span>{resolution.variantKind === 'ambitious' ? 'Variante ambitieuse' : 'Variante modérée'} · jusqu’à R{resolution.expiresAtRound}</span></div></article>; })}</div></section>}
    </>
  );

  const mandatesBody = (
    <>
      <section className={styles.chancellorCard}>
        <div className={styles.chancellorSeal}><PeIcon name="mandats" /></div>
        <div className={styles.chancellorCopy}><span>Haut Chancelier · +1 PV</span><h4>{pe.highChancellorId ? playerLabel(gameState, pe.highChancellorId) : 'Titre encore vacant'}</h4><p>Votre prestige : <b>{myChancellorScore}</b> / 8</p><div className={styles.progressTrack}><span style={{ width: `${Math.min(100, (myChancellorScore / 8) * 100)}%` }} /></div></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><span>Mandats publics</span><small>{me?.mandatesClaimed.length ?? 0}/2 revendiqués</small></div>
        <div className={styles.mandateGrid}>
          {pe.mandates.map((mandate, index) => {
            const claimed = Boolean(mandate.claimedBy);
            const mine = mandate.claimedBy === playerId;
            const ready = !claimed && evaluateMandateCondition(gameState, pe, playerId, mandate);
            return <article key={mandate.id} className={styles.mandateCard} data-ready={ready} data-claimed={claimed}><div className={styles.mandateIndex}>0{index + 1}</div><MandateStatus ready={ready} claimed={claimed} /><PeIcon name="mandats" className={styles.mandateIcon} /><h5>{mandate.title}</h5><p>{mandate.description}</p><div className={styles.mandateReward}><span><b>+1</b> PV permanent</span><span><b>+1</b> Influence</span></div>{claimed ? <small className={styles.claimedBy}>{mine ? 'Revendiqué par vous' : `Revendiqué par ${playerLabel(gameState, mandate.claimedBy!)}`}</small> : <button type="button" className={styles.primaryBtn} disabled={!canAct || !ready || (me?.mandatesClaimed.length ?? 0) >= 2} onClick={() => onClaimMandate?.(mandate.mandateId)}>{ready ? 'Revendiquez ce mandat' : 'Condition non remplie'}</button>}</article>;
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><span>Votre dossier diplomatique</span></div>
        <div className={styles.achievementGrid}><div><PeIcon name="relations" /><span>Pactes honorés</span><strong>{me?.pactsHonored ?? 0}</strong></div><div><PeIcon name="seal" /><span>Résolutions adoptées</span><strong>{me?.resolutionsSponsoredAdopted ?? 0}</strong></div><div><PeIcon name="alert" /><span>Crises soutenues</span><strong>{me?.crisisContributionsSufficient ?? 0}</strong></div><div><PeIcon name="mandats" /><span>Mandats acquis</span><strong>{me?.mandatesClaimed.length ?? 0}</strong></div></div>
      </section>
    </>
  );

  const bodyByTab: Record<PeTab, JSX.Element> = { relations: relationsBody, ambassades: embassiesBody, conseil: councilBody, mandats: mandatesBody };

  return (
    <aside className={styles.dock} data-hud-zone="extensions" data-extension="pacts-embassies" data-expanded={open ? 'true' : 'false'} aria-label="Pactes et Ambassades">
      <button type="button" className={styles.launcher} aria-expanded={open} aria-label={`${open ? 'Fermer' : 'Ouvrir'} Pactes et Ambassades`} onClick={() => { if (!open) setOpen(true); else if (!hasUrgent) setOpen(false); }}>
        <span className={styles.iconHalo}><PeIcon name="relations" /></span>
        {badgeCount > 0 && <span className={styles.pendingBadge} aria-label={`${badgeCount} alertes`}>{badgeCount}</span>}
        <span className={styles.tooltip} role="tooltip"><small>Extension</small><strong>Pactes &amp; Ambassades</strong></span>
      </button>

      {open && (
        <section className={styles.panel} aria-label="Pupitre Pactes et Ambassades" data-realm={tab}>
          <header className={styles.header}>
            <div className={styles.headerBrand}><span className={styles.headerIcon}><PeIcon name="relations" /></span><div><span>Extension CatanX</span><h3>Pactes &amp; Ambassades</h3></div></div>
            <button type="button" className={styles.collapseBtn} aria-label="Réduire le panneau" onClick={() => setOpen(false)} disabled={hasUrgent} title={hasUrgent ? 'Résolvez le choix en cours avant de réduire' : 'Réduire'}>×</button>
          </header>

          <div className={styles.statStrip}>
            <div className={styles.statChip} title="L’Influence finance les pactes et le lobby"><PeIcon name="influence" /><span><small>Influence</small><b>{influence}<i>/12</i></b></span></div>
            <div className={styles.statChip} title="La Réputation augmente votre capacité diplomatique"><PeIcon name="reputation" /><span><small>Réputation</small><b>{reputation}<i>/6</i></b></span></div>
            <div className={styles.statChip} title="Vos délégués déterminent vos voix de base"><PeIcon name="delegates" /><span><small>Délégués</small><b>{delegates}<i>/4</i></b></span></div>
          </div>

          <nav className={styles.tabs} role="tablist" aria-label="Rubriques diplomatiques">
            {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} aria-label={item.label} onClick={() => setTab(item.id)}><PeIcon name={item.id} /><span>{item.short}</span>{item.id === 'relations' && incomingOffers.length > 0 && <b>{incomingOffers.length}</b>}</button>)}
          </nav>

          <div className={styles.body}>
            <section className={styles.hero} data-art={tab}>
              <div className={styles.heroCopy}><span>{guide.eyebrow}</span><h4>{guide.title}</h4><p>{guide.copy}</p><small><i />{guide.step}</small></div>
            </section>
            {hasUrgent && <div className={styles.urgentBanner}><PeIcon name="alert" /><span><b>Décision requise</b>{myPending.length} choix diplomatique{myPending.length > 1 ? 's' : ''} attend{myPending.length > 1 ? 'ent' : ''} votre réponse.</span></div>}
            {bodyByTab[tab]}
          </div>
        </section>
      )}
    </aside>
  );
}
