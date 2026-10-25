import { useState } from 'react';
import { DevelopmentCard, ResourceType } from '@catanx/engine';
import { frResource } from '../../i18n/fr';

const CLASSIC_RESOURCES: ResourceType[] = ['wood', 'clay', 'wheat', 'sheep', 'ore'];

const CARD_LABELS: Record<string, string> = {
  knight: 'Chevalier',
  road_building: 'Construction de routes',
  year_of_plenty: "Année d'abondance",
  monopoly: 'Monopole',
  victory_point: 'Point de victoire',
};

type PlayResult = { ok: boolean; reason?: string };

interface DevCardPanelProps {
  cards: DevelopmentCard[];
  canBuy: boolean;
  buyReason?: string;
  classicMode?: boolean;
  /** left = classique ; right = CatanX (évite le chevauchement saison/tech). */
  layout?: 'left' | 'right';
  currentTurn: number;
  playedDevThisTurn: boolean;
  onBuy: () => PlayResult;
  onPlayKnight: (cardId: string, tileId: string, targetPlayerId: string) => PlayResult;
  onPlayRoadBuilding: (cardId: string) => PlayResult;
  onPlayYearOfPlenty: (cardId: string, resource1: ResourceType, resource2: ResourceType) => PlayResult;
  onPlayMonopoly: (cardId: string, resource: ResourceType) => PlayResult;
  onPlayVictoryPoint?: (cardId: string) => PlayResult;
  robberTileOptions: { id: string; label: string }[];
  stealTargets: { id: string; name: string }[];
  bankStock?: Partial<Record<ResourceType, number>>;
}

function yopBankAllows(
  bankStock: Partial<Record<ResourceType, number>> | undefined,
  a: ResourceType,
  b: ResourceType,
): boolean {
  // Sans stock connu : bloquer si le jeu est censé avoir une banque (évite inventaire illimité).
  if (!bankStock) return false;
  if (a === b) return (bankStock[a] ?? 0) >= 2;
  return (bankStock[a] ?? 0) >= 1 && (bankStock[b] ?? 0) >= 1;
}

export function DevCardPanel({
  cards,
  canBuy,
  buyReason,
  classicMode = false,
  layout = 'left',
  currentTurn,
  playedDevThisTurn,
  onBuy,
  onPlayKnight,
  onPlayRoadBuilding,
  onPlayYearOfPlenty,
  onPlayMonopoly,
  onPlayVictoryPoint,
  robberTileOptions,
  stealTargets,
  bankStock,
}: DevCardPanelProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [knightTileId, setKnightTileId] = useState('');
  const [knightTargetId, setKnightTargetId] = useState('');
  const [yopA, setYopA] = useState<ResourceType>('wood');
  const [yopB, setYopB] = useState<ResourceType>('ore');
  const [monoResource, setMonoResource] = useState<ResourceType>('ore');

  const selected = cards.find((card) => card.id === selectedCardId) ?? null;
  const selectedFresh = Boolean(selected && selected.acquiredTurn === currentTurn);
  const selectedBlockedByQuota =
    Boolean(selected) &&
    playedDevThisTurn &&
    selected?.type !== 'victory_point';

  const resetPlayUi = () => {
    setSelectedCardId(null);
    setKnightTileId('');
    setKnightTargetId('');
  };

  const bankLabel = (resource: ResourceType) =>
    typeof bankStock?.[resource] === 'number' ? ` (banque ${bankStock[resource]})` : '';

  const yopOk = yopBankAllows(bankStock, yopA, yopB);
  const canPlaySelected = !selectedFresh && !selectedBlockedByQuota;
  const panelSideStyle =
    layout === 'right'
      ? {
          right: 12,
          top: 160,
          left: 'auto' as const,
          maxHeight: 'calc(100vh - 300px)',
          overflowY: 'auto' as const,
        }
      : { left: 12, top: 220, right: 'auto' as const };

  return (
    <aside
      className="ui-panel"
      style={{
        position: 'absolute',
        width: 340,
        padding: 12,
        pointerEvents: 'auto',
        zIndex: 25,
        ...panelSideStyle,
      }}
    >
      <div style={{ fontWeight: 800 }}>Cartes de développement</div>
      <button
        type="button"
        className="command-button"
        style={{ marginTop: 8, width: '100%' }}
        disabled={!canBuy}
        onClick={() => onBuy()}
        title={buyReason}
      >
        Acheter (1 minerai, 1 blé, 1 laine)
      </button>
      {!canBuy && buyReason && (
        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72 }}>{buyReason}</div>
      )}

      <div style={{ marginTop: 10, display: 'grid', gap: 6, maxHeight: 160, overflow: 'auto' }}>
        {cards.length === 0 && (
          <div style={{ fontSize: 12, opacity: 0.8 }}>Aucune carte en main.</div>
        )}
        {cards.map((card) => {
          const fresh = card.acquiredTurn === currentTurn;
          return (
            <button
              key={card.id}
              type="button"
              className={selectedCardId === card.id ? 'command-button' : 'command-button secondary'}
              onClick={() => setSelectedCardId(card.id)}
              title={
                fresh
                  ? 'Achetée ce tour — jouable au prochain tour'
                  : CARD_LABELS[card.type] ?? card.type
              }
            >
              {CARD_LABELS[card.type] ?? card.type}
              {fresh ? ' · ce tour' : ''}
            </button>
          );
        })}
      </div>

      {selected && (selectedFresh || selectedBlockedByQuota) && (
        <p style={{ marginTop: 10, marginBottom: 0, fontSize: 12, opacity: 0.85 }}>
          {selectedFresh
            ? 'Cette carte a été achetée ce tour — elle sera jouable au prochain.'
            : 'Une seule carte de développement par tour (sauf point de victoire).'}
        </p>
      )}

      {selected?.type === 'knight' && !selected.played && (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          <select value={knightTileId} onChange={(event) => setKnightTileId(event.target.value)}>
            <option value="">Tuile du brigand</option>
            {robberTileOptions.map((tile) => (
              <option key={tile.id} value={tile.id}>
                {tile.label}
              </option>
            ))}
          </select>
          <select value={knightTargetId} onChange={(event) => setKnightTargetId(event.target.value)}>
            <option value="">Joueur à voler (optionnel)</option>
            {stealTargets.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="command-button primary"
            disabled={!knightTileId || !canPlaySelected}
            onClick={() => {
              const result = onPlayKnight(selected.id, knightTileId, knightTargetId);
              if (result.ok) resetPlayUi();
            }}
          >
            Jouer Chevalier
          </button>
        </div>
      )}

      {selected?.type === 'road_building' && !selected.played && (
        <button
          type="button"
          className="command-button primary"
          style={{ marginTop: 10, width: '100%' }}
          disabled={!canPlaySelected}
          onClick={() => {
            const result = onPlayRoadBuilding(selected.id);
            if (result.ok) resetPlayUi();
          }}
        >
          Jouer Construction de routes (+2)
        </button>
      )}

      {selected?.type === 'year_of_plenty' && !selected.played && (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>
            Prenez 2 ressources à la banque.
          </p>
          <select value={yopA} onChange={(event) => setYopA(event.target.value as ResourceType)}>
            {CLASSIC_RESOURCES.map((resource) => (
              <option key={resource} value={resource} disabled={(bankStock?.[resource] ?? 1) < 1}>
                {frResource(resource)}
                {bankLabel(resource)}
              </option>
            ))}
          </select>
          <select value={yopB} onChange={(event) => setYopB(event.target.value as ResourceType)}>
            {CLASSIC_RESOURCES.map((resource) => {
              const need = resource === yopA ? 2 : 1;
              return (
                <option
                  key={resource}
                  value={resource}
                  disabled={(bankStock?.[resource] ?? 1) < need}
                >
                  {frResource(resource)}
                  {bankLabel(resource)}
                </option>
              );
            })}
          </select>
          {!yopOk && (
            <p style={{ margin: 0, fontSize: 11, opacity: 0.75 }}>
              La banque n&apos;a pas assez pour ce choix.
            </p>
          )}
          <button
            type="button"
            className="command-button primary"
            disabled={!canPlaySelected || !yopOk}
            onClick={() => {
              const result = onPlayYearOfPlenty(selected.id, yopA, yopB);
              if (result.ok) resetPlayUi();
            }}
          >
            Jouer Année d&apos;abondance
          </button>
        </div>
      )}

      {selected?.type === 'monopoly' && !selected.played && (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>
            Prenez toutes les cartes de ce type chez les adversaires.
          </p>
          <select
            value={monoResource}
            onChange={(event) => setMonoResource(event.target.value as ResourceType)}
          >
            {CLASSIC_RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {frResource(resource)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="command-button primary"
            disabled={!canPlaySelected}
            onClick={() => {
              const result = onPlayMonopoly(selected.id, monoResource);
              if (result.ok) resetPlayUi();
            }}
          >
            Jouer Monopole
          </button>
        </div>
      )}

      {selected?.type === 'victory_point' && !selected.played && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
          {classicMode ? (
            <p style={{ margin: 0 }}>Point de victoire secret — compte déjà dans votre total.</p>
          ) : (
            <button
              type="button"
              className="command-button primary"
              style={{ width: '100%' }}
              onClick={() => {
                const result = onPlayVictoryPoint?.(selected.id);
                if (result?.ok) resetPlayUi();
              }}
            >
              Jouer Point de victoire
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
