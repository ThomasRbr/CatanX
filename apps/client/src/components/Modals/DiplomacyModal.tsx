import { useMemo, useState } from 'react';
import { ActionLogEntry } from '@catanx/engine';
import { DiplomaticStatus, Player, TreatyType } from '@catanx/engine';
import { DiplomacyActionType } from '@catanx/engine';
import { frDiplomaticStatus } from '../../i18n/fr';

interface DiplomacyModalProps {
  players: Player[];
  currentPlayerId: string;
  currentTurn: number;
  actionLog: ActionLogEntry[];
  onAction: (toPlayerId: string, action: DiplomacyActionType) => void;
  onClose: () => void;
}

const STATUS_COLORS: Record<DiplomaticStatus, string> = {
  war: '#dc2626',
  hostile: '#ea580c',
  neutral: '#6b7280',
  friendly: '#10b981',
  allied: '#0284c7',
  vassal: '#7c3aed',
  overlord: '#9333ea',
};

function treatyLabel(type: TreatyType): string {
  const raw = type.replace(/_/g, ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function relationLineWidth(score: number): number {
  const intensity = Math.min(1, Math.abs(score) / 100);
  return 1.4 + intensity * 2.6;
}

export function DiplomacyModal({
  players,
  currentPlayerId,
  currentTurn,
  actionLog,
  onAction,
  onClose,
}: DiplomacyModalProps) {
  const currentPlayer = useMemo(
    () => players.find((p) => p.id === currentPlayerId) ?? null,
    [currentPlayerId, players],
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const selectedPlayer = useMemo(() => {
    const fallback = players.find((p) => p.id !== currentPlayerId) ?? null;
    if (!selectedPlayerId) return fallback;
    return players.find((p) => p.id === selectedPlayerId) ?? fallback;
  }, [currentPlayerId, players, selectedPlayerId]);

  const selectedRelation = selectedPlayer ? currentPlayer?.relations[selectedPlayer.id] : undefined;

  const graph = useMemo(() => {
    const width = 420;
    const height = 280;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 98;
    const nodes = players.map((player, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, players.length);
      return {
        id: player.id,
        name: player.name,
        x: centerX + Math.cos(angle - Math.PI / 2) * radius,
        y: centerY + Math.sin(angle - Math.PI / 2) * radius,
      };
    });

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edges: Array<{ from: string; to: string; status: DiplomaticStatus; score: number }> = [];
    const seen = new Set<string>();

    for (const player of players) {
      for (const [otherId, relation] of Object.entries(player.relations)) {
        if (!nodeById.has(otherId) || otherId === player.id) continue;
        const key = [player.id, otherId].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          from: player.id,
          to: otherId,
          status: relation.status,
          score: relation.score,
        });
      }
    }

    return { width, height, nodes, edges, nodeById };
  }, [players]);

  const diplomacyHistory = useMemo(() => {
    if (!selectedPlayer) return [];
    return actionLog
      .filter((entry) => {
        if (entry.type !== 'diplomacy') return false;
        const toId = typeof entry.data?.toId === 'string' ? entry.data.toId : null;
        return entry.playerId === selectedPlayer.id || toId === selectedPlayer.id;
      })
      .slice(-8)
      .reverse();
  }, [actionLog, selectedPlayer]);

  if (!currentPlayer || !selectedPlayer) {
    return (
      <div className="modal-backdrop">
        <div className="modal-card">
          <h2 style={{ marginTop: 0 }}>Salle du conseil</h2>
          <p>Aucune relation disponible.</p>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    );
  }

  const status = selectedRelation?.status ?? 'neutral';
  const statusColor = STATUS_COLORS[status];
  const treaties = selectedRelation?.treaties ?? [];

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ width: 'min(1220px, 95vw)' }}>
        <h2 style={{ marginTop: 0 }}>Salle du conseil</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 430px) 1fr',
            gap: 12,
            marginTop: 10,
          }}
        >
          <div className="ui-panel" style={{ padding: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Graphe des relations</div>
            <svg
              width={graph.width}
              height={graph.height}
              viewBox={`0 0 ${graph.width} ${graph.height}`}
            >
              {graph.edges.map((edge) => {
                const from = graph.nodeById.get(edge.from);
                const to = graph.nodeById.get(edge.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={`${edge.from}-${edge.to}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={STATUS_COLORS[edge.status]}
                    strokeWidth={relationLineWidth(edge.score)}
                    opacity={0.72}
                  />
                );
              })}

              {graph.nodes.map((node) => {
                const isCurrent = node.id === currentPlayerId;
                const isSelected = node.id === selectedPlayer.id;
                const player = players.find((entry) => entry.id === node.id);
                const fill = isCurrent ? '#f59e0b' : isSelected ? '#60a5fa' : '#e6dcc7';
                const stroke = isCurrent ? '#7c3f00' : isSelected ? '#1e3a8a' : '#5d4a36';
                return (
                  <g
                    key={node.id}
                    style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                    onClick={() => {
                      if (isCurrent) return;
                      setSelectedPlayerId(node.id);
                    }}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isCurrent ? 20 : 17}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={2}
                    />
                    <text
                      x={node.x}
                      y={node.y + 4}
                      fontSize={10}
                      textAnchor="middle"
                      fill="#1f1a14"
                      fontWeight={800}
                    >
                      {player?.name.slice(0, 3).toUpperCase() ?? '---'}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div style={{ fontSize: 12, opacity: 0.82 }}>
              Cliquez un noeud pour inspecter ses traites et son historique.
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div className="ui-panel" style={{ padding: 10 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedPlayer.name}</div>
                <span
                  style={{
                    background: statusColor,
                    color: '#fff',
                    borderRadius: 999,
                    padding: '2px 9px',
                    fontSize: 11,
                    textTransform: 'capitalize',
                    fontWeight: 700,
                  }}
                >
                  {frDiplomaticStatus(status)}
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                Score relation: {selectedRelation?.score ?? 0}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>
                Derniere interaction: tour {selectedRelation?.lastInteractionTurn ?? '-'}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => onAction(selectedPlayer.id, 'propose_alliance')}>
                  Alliance
                </button>
                <button onClick={() => onAction(selectedPlayer.id, 'propose_peace')}>Paix</button>
                <button onClick={() => onAction(selectedPlayer.id, 'declare_war')}>Guerre</button>
                <button onClick={() => onAction(selectedPlayer.id, 'gift_resources')}>Don</button>
                <button onClick={() => onAction(selectedPlayer.id, 'denounce')}>Denoncer</button>
              </div>
            </div>

            <div className="ui-panel" style={{ padding: 10 }}>
              <div style={{ fontWeight: 700 }}>Traites actifs</div>
              {treaties.length === 0 ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>Aucun traite actif.</div>
              ) : (
                <div
                  style={{
                    marginTop: 8,
                    display: 'grid',
                    gap: 6,
                    maxHeight: 150,
                    overflowY: 'auto',
                  }}
                >
                  {treaties.map((treaty) => {
                    const turnsLeft =
                      typeof treaty.expirationTurn === 'number'
                        ? Math.max(0, treaty.expirationTurn - currentTurn)
                        : null;
                    return (
                      <div
                        key={treaty.id}
                        style={{
                          border: '1px solid rgba(76,57,34,0.25)',
                          borderRadius: 8,
                          padding: '7px 8px',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 12 }}>
                          {treatyLabel(treaty.type)}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.82, marginTop: 2 }}>
                          Etabli tour {treaty.establishedTurn}
                          {turnsLeft === null
                            ? ' - permanent'
                            : ` - ${turnsLeft} tour(s) restant(s)`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ui-panel" style={{ padding: 10 }}>
              <div style={{ fontWeight: 700 }}>Historique diplomatique</div>
              <div
                style={{ marginTop: 8, display: 'grid', gap: 6, maxHeight: 160, overflowY: 'auto' }}
              >
                {selectedRelation?.trustHistory
                  ?.slice(-5)
                  .reverse()
                  .map((event, index) => (
                    <div key={`trust-${index}`} style={{ fontSize: 12 }}>
                      <strong>T{event.turn}</strong> {event.event} ({event.delta >= 0 ? '+' : ''}
                      {event.delta})
                    </div>
                  ))}

                {diplomacyHistory.map((entry) => (
                  <div key={entry.id} style={{ fontSize: 12 }}>
                    <strong>T{entry.turn}</strong> {entry.description}
                  </div>
                ))}

                {(selectedRelation?.trustHistory?.length ?? 0) === 0 &&
                  diplomacyHistory.length === 0 && (
                    <div style={{ fontSize: 12, opacity: 0.72 }}>Aucun evenement recent.</div>
                  )}
              </div>
            </div>
          </div>
        </div>

        <button style={{ marginTop: 14 }} onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}
