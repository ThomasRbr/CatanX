import { MultiplayerRoomPlayer } from '../../network/MultiplayerClient';

interface MultiplayerStatusPanelProps {
  connected: boolean;
  roomId: string;
  isSpectator: boolean;
  players: MultiplayerRoomPlayer[];
  onOpenLobby: () => void;
  onSaveRoom?: () => void;
  saveBusy?: boolean;
  saveHint?: string | null;
}

export function MultiplayerStatusPanel({
  connected,
  roomId,
  isSpectator,
  players,
  onOpenLobby,
  onSaveRoom,
  saveBusy = false,
  saveHint = null,
}: MultiplayerStatusPanelProps) {
  return (
    <div
      className="ui-panel"
      style={{
        position: 'absolute',
        top: 'auto',
        bottom: 96,
        left: 12,
        right: 'auto',
        width: 220,
        padding: 10,
        pointerEvents: 'auto',
        zIndex: 5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Multijoueur</strong>
        <span style={{ fontSize: 11, opacity: 0.78 }}>
          {connected ? 'Connecté' : 'Hors ligne'}
        </span>
      </div>

      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.84 }}>
        Salon: <code style={{ fontSize: 11 }}>{roomId || '—'}</code>
      </div>

      {isSpectator && (
        <div
          style={{
            marginTop: 7,
            borderRadius: 8,
            padding: '5px 7px',
            fontSize: 12,
            fontWeight: 700,
            color: '#1e3a8a',
            background: 'rgba(191, 219, 254, 0.65)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
          }}
        >
          Mode spectateur actif
        </div>
      )}

      <div style={{ marginTop: 8, display: 'grid', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
        {players.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.72 }}>Aucun joueur visible.</div>
        ) : (
          players.map((player, index) => {
            const isAi = player.kind === 'ai';
            return (
              <div
                key={`${player.id ?? player.name}-${index}`}
                style={{
                  fontSize: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>
                  {player.name}
                  {player.isHost ? ' · hôte' : ''}
                  {isAi ? ' · IA' : player.spectator ? ' · spec.' : ''}
                </span>
                <span
                  style={{
                    color: isAi
                      ? '#1e3a8a'
                      : player.connected === false
                        ? '#7f1d1d'
                        : '#14532d',
                    fontWeight: 700,
                  }}
                >
                  {isAi ? 'BOT' : player.connected === false ? 'OFF' : 'ON'}
                </span>
              </div>
            );
          })
        )}
      </div>

      <button type="button" style={{ marginTop: 8 }} onClick={onOpenLobby}>
        Ouvrir lobby
      </button>
      {onSaveRoom && (
        <button
          type="button"
          style={{ marginTop: 6 }}
          onClick={onSaveRoom}
          disabled={saveBusy || !connected}
        >
          {saveBusy ? 'Sauvegarde…' : 'Sauver (serveur)'}
        </button>
      )}
      {saveHint && (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>{saveHint}</div>
      )}
    </div>
  );
}
