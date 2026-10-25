import type {
  GameConfig,
  RoomAiDifficulty,
  RoomGamePreset,
  RoomSaveSummary,
} from '@catanx/protocol';
import {
  MultiplayerChatMessage,
  MultiplayerRoomPlayer,
  MultiplayerRoomSummary,
} from '../../network/MultiplayerClient';
import { MultiplayerChat } from '../HUD/MultiplayerChat';
import { Button, Panel } from '../../ui';

export interface MultiplayerLobbyConfig {
  preset: RoomGamePreset;
  boardLayout: 'fixed' | 'random';
  enableSeasons: boolean;
  enableCitiesKnights: boolean;
  enableUndergroundSky: boolean;
  enablePactsEmbassies: boolean;
  enableEvents: boolean;
  enableTechTree: boolean;
  enableDiplomacy: boolean;
  enableMilitary: boolean;
  worldCouncil: boolean;
  fogOfWar: boolean;
  enableBarbarians: boolean;
  victoryPointTarget: number;
  aiDifficulty: RoomAiDifficulty;
}

interface MultiplayerLobbyProps {
  connected: boolean;
  connecting: boolean;
  serverUrl: string;
  roomId: string;
  seatId: string | null;
  roomName: string;
  playerName: string;
  maxPlayers: number;
  lobbyConfig: MultiplayerLobbyConfig;
  joinAsSpectator: boolean;
  isHost: boolean;
  rooms: MultiplayerRoomSummary[];
  savedRooms: RoomSaveSummary[];
  roomPlayers: MultiplayerRoomPlayer[];
  chatMessages: MultiplayerChatMessage[];
  error: string | null;
  inviteHint?: string | null;
  hasActiveGame?: boolean;
  onServerUrlChange: (value: string) => void;
  onRoomIdChange: (value: string) => void;
  onRoomNameChange: (value: string) => void;
  onPlayerNameChange: (value: string) => void;
  onMaxPlayersChange: (value: number) => void;
  onLobbyConfigChange: (patch: Partial<MultiplayerLobbyConfig>) => void;
  onJoinAsSpectatorChange: (value: boolean) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefreshRooms: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (id?: string) => void;
  onStartGame: () => void;
  onSetReady: (ready: boolean) => void;
  onAddAi: () => void;
  onRemoveAi: (seatId: string) => void;
  onCopyInvite: () => void;
  onResumeSavedRoom: (roomId: string) => void;
  onDiscardSavedRoom: (roomId: string) => void;
  onRefreshSavedRooms: () => void;
  onBack: () => void;
  onSendChat: (text: string) => void;
}

function canStartLobby(
  preset: RoomGamePreset,
  seatedCount: number,
  isHost: boolean,
  roomCapacity?: number,
): { ok: boolean; reason?: string } {
  if (!isHost) return { ok: false };
  if (preset === 'classic') {
    if (typeof roomCapacity === 'number' && roomCapacity < 3) {
      return {
        ok: false,
        reason: 'Salon trop petit pour le classique (recréez avec 3 ou 4 places).',
      };
    }
    if (seatedCount < 3 || seatedCount > 4) {
      return { ok: false, reason: 'Classique : 3 ou 4 joueurs (humains + IA).' };
    }
  } else if (seatedCount < 2) {
    return { ok: false, reason: 'Au moins 2 joueurs (humains + IA).' };
  }
  return { ok: true };
}

export function MultiplayerLobby({
  connected,
  connecting,
  serverUrl,
  roomId,
  seatId,
  roomName,
  playerName,
  maxPlayers,
  lobbyConfig,
  joinAsSpectator,
  isHost,
  rooms,
  savedRooms,
  roomPlayers,
  chatMessages,
  error,
  inviteHint,
  hasActiveGame = false,
  onServerUrlChange,
  onRoomIdChange,
  onRoomNameChange,
  onPlayerNameChange,
  onMaxPlayersChange,
  onLobbyConfigChange,
  onJoinAsSpectatorChange,
  onConnect,
  onDisconnect,
  onRefreshRooms,
  onCreateRoom,
  onJoinRoom,
  onStartGame,
  onSetReady,
  onAddAi,
  onRemoveAi,
  onCopyInvite,
  onResumeSavedRoom,
  onDiscardSavedRoom,
  onRefreshSavedRooms,
  onBack,
  onSendChat,
}: MultiplayerLobbyProps) {
  const inRoom = connected && Boolean(seatId);
  const seatedCount = roomPlayers.filter((player) => !player.spectator).length;
  const roomCapacity =
    rooms.find((room) => room.id === roomId)?.maxPlayers ?? maxPlayers;
  const startGate = canStartLobby(lobbyConfig.preset, seatedCount, isHost, roomCapacity);
  const canStart = startGate.ok;
  const classic = lobbyConfig.preset === 'classic';
  const placeOptions =
    lobbyConfig.preset === 'classic' ? [3, 4] : [2, 3, 4, 5, 6];

  return (
    <section
      id="catanx-main-content"
      style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', padding: 14 }}
      aria-label="Lobby multijoueur"
    >
      <Panel variant="lacquer" style={{ width: 'min(1240px, 96vw)' }}>
        <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)', color: 'var(--ivory)' }}>
          Lobby multijoueur
        </h2>
        <p style={{ marginTop: 4, fontSize: 13, opacity: 0.82 }}>
          Lancez `npm run server:online`, connectez-vous, créez un salon, puis partagez le lien
          d’invitation.
        </p>
        {inviteHint && (
          <p style={{ marginTop: 6, fontSize: 12, color: 'var(--ivory)' }}>{inviteHint}</p>
        )}
        <div
          style={{
            marginTop: 8,
            display: 'grid',
            gridTemplateColumns: 'minmax(420px, 1fr) minmax(320px, 420px)',
            gap: 12,
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <Panel variant="ivory" style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Connexion serveur</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 12 }}>
                  Serveur
                  <input
                    value={serverUrl}
                    onChange={(event) => onServerUrlChange(event.target.value)}
                    placeholder="http://127.0.0.1:4000"
                  />
                </label>
                <label style={{ fontSize: 12 }}>
                  Pseudo
                  <input
                    value={playerName}
                    onChange={(event) => onPlayerNameChange(event.target.value)}
                  />
                </label>
                <label style={{ fontSize: 12 }}>
                  Code salon
                  <input
                    value={roomId}
                    onChange={(event) => onRoomIdChange(event.target.value)}
                    placeholder="R…"
                  />
                </label>
                <label style={{ fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={joinAsSpectator}
                    onChange={(event) => onJoinAsSpectatorChange(event.target.checked)}
                  />{' '}
                  Rejoindre en mode spectateur
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!connected ? (
                    <Button variant="primary" onClick={onConnect} disabled={connecting}>
                      {connecting ? 'Connexion…' : 'Se connecter'}
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={onDisconnect}>
                      Se déconnecter
                    </Button>
                  )}
                  <Button variant="secondary" onClick={onRefreshRooms} disabled={!connected}>
                    Rafraîchir salons
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => onJoinRoom()}
                    disabled={!connected || roomId.trim().length === 0}
                  >
                    Rejoindre
                  </Button>
                </div>
                {error && (
                  <div style={{ fontSize: 12, color: '#7f1d1d', fontWeight: 700 }}>{error}</div>
                )}
              </div>
            </Panel>

            <Panel variant="ivory" style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Salons disponibles</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <input
                  value={roomName}
                  onChange={(event) => onRoomNameChange(event.target.value)}
                  placeholder="Nom du nouveau salon"
                  style={{ flex: 1, minWidth: 160 }}
                />
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Places
                  <select
                    value={inRoom ? roomCapacity : maxPlayers}
                    onChange={(event) => onMaxPlayersChange(Number(event.target.value))}
                    disabled={!connected || inRoom}
                    title={inRoom ? 'Capacité figée à la création du salon' : undefined}
                  >
                    {placeOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="primary"
                  onClick={onCreateRoom}
                  disabled={!connected || roomName.trim().length === 0}
                >
                  Créer
                </Button>
              </div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                {rooms.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Aucun salon reçu du serveur.</div>
                ) : (
                  rooms.map((room) => (
                    <Panel key={room.id} variant="lacquer" style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{room.name ?? room.id}</div>
                      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 1 }}>
                        Joueurs: {room.players ?? 0}
                        {typeof room.maxPlayers === 'number' ? ` / ${room.maxPlayers}` : ''}
                        {room.status ? ` · ${room.status}` : ''}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        style={{ marginTop: 6 }}
                        onClick={() => onJoinRoom(room.id)}
                        disabled={!connected}
                      >
                        Rejoindre ce salon
                      </Button>
                    </Panel>
                  ))
                )}
              </div>
            </Panel>

            <Panel variant="ivory" style={{ padding: 12 }}>
              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>Parties sauvegardées (serveur)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefreshSavedRooms}
                  disabled={!connected}
                >
                  Rafraîchir
                </Button>
              </div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                {savedRooms.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Aucune sauvegarde disque. L’hôte peut sauver en partie.
                  </div>
                ) : (
                  savedRooms.map((entry) => (
                    <Panel key={entry.id} variant="lacquer" style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{entry.name}</div>
                      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 1 }}>
                        {entry.id} · T{entry.turn} ·{' '}
                        {new Date(entry.savedAt).toLocaleString('fr-FR')}
                        {entry.seatNames.length > 0 ? ` · ${entry.seatNames.join(', ')}` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!connected}
                          onClick={() => onResumeSavedRoom(entry.id)}
                        >
                          Reprendre
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!connected}
                          onClick={() => onDiscardSavedRoom(entry.id)}
                        >
                          Abandonner
                        </Button>
                      </div>
                    </Panel>
                  ))
                )}
              </div>
            </Panel>

            <Panel variant="ivory" style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Règles & extensions</div>
              <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
                <label>
                  Preset
                  <select
                    value={lobbyConfig.preset}
                    disabled={!isHost || !inRoom}
                    onChange={(event) => {
                      const preset = event.target.value as RoomGamePreset;
                      onLobbyConfigChange({
                        preset,
                        ...(preset === 'classic'
                          ? {
                              enableSeasons: false,
                              enableCitiesKnights: false,
                              enableUndergroundSky: false,
                              enablePactsEmbassies: false,
                              enableEvents: false,
                              enableTechTree: false,
                              enableDiplomacy: false,
                              enableMilitary: false,
                              worldCouncil: false,
                              fogOfWar: false,
                              enableBarbarians: false,
                              victoryPointTarget: 10,
                            }
                          : {
                              enableSeasons: true,
                              enableCitiesKnights: true,
                              enableUndergroundSky: true,
                              enablePactsEmbassies: true,
                              enableEvents: true,
                              enableTechTree: true,
                              enableDiplomacy: true,
                              enableMilitary: true,
                              worldCouncil: true,
                              fogOfWar: true,
                              enableBarbarians: true,
                              victoryPointTarget: 15,
                            }),
                      });
                      if (preset === 'classic') {
                        if (maxPlayers < 3 || maxPlayers > 4) onMaxPlayersChange(4);
                      } else if (maxPlayers < 2) {
                        onMaxPlayersChange(4);
                      }
                    }}
                  >
                    <option value="classic">Base CATAN</option>
                    <option value="catanx">CatanX (extensions)</option>
                    <option value="custom">Personnalisé</option>
                  </select>
                </label>
                {classic && (
                  <label>
                    Plateau
                    <select
                      value={lobbyConfig.boardLayout}
                      disabled={!isHost || !inRoom}
                      onChange={(event) =>
                        onLobbyConfigChange({
                          boardLayout: event.target.value as 'fixed' | 'random',
                        })
                      }
                    >
                      <option value="fixed">Débutant (fixe)</option>
                      <option value="random">Variable</option>
                    </select>
                  </label>
                )}
                <label>
                  Objectif VP
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={lobbyConfig.victoryPointTarget}
                    disabled={!isHost || !inRoom}
                    onChange={(event) =>
                      onLobbyConfigChange({
                        victoryPointTarget: Number(event.target.value) || 10,
                      })
                    }
                  />
                </label>
                {!classic && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 6,
                    }}
                  >
                    {(
                      [
                        ['enableSeasons', 'Saisons'],
                        ['enableCitiesKnights', 'Villes & Chevaliers'],
                        ['enableUndergroundSky', 'Souterrain & Ciel'],
                        ['enablePactsEmbassies', 'Pactes & Ambassades'],
                        ['enableEvents', 'Événements'],
                        ['enableTechTree', 'Technologies'],
                        ['enableDiplomacy', 'Diplomatie'],
                        ['enableMilitary', 'Armées'],
                        ['worldCouncil', 'Conseil'],
                        ['fogOfWar', 'Brouillard'],
                        ['enableBarbarians', 'Barbares'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(lobbyConfig[key])}
                          disabled={!isHost || !inRoom}
                          onChange={(event) =>
                            onLobbyConfigChange({ [key]: event.target.checked })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
                <label>
                  Difficulté IA (nouveaux sièges)
                  <select
                    value={lobbyConfig.aiDifficulty}
                    disabled={!isHost || !inRoom}
                    onChange={(event) =>
                      onLobbyConfigChange({
                        aiDifficulty: event.target.value as RoomAiDifficulty,
                      })
                    }
                  >
                    <option value="easy">Facile</option>
                    <option value="medium">Moyen</option>
                    <option value="hard">Difficile</option>
                    <option value="legendary">Légendaire</option>
                  </select>
                </label>
              </div>
            </Panel>

            <Panel variant="ivory" style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Joueurs dans le salon</div>
              {inRoom && (
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: 12,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    Code : <strong>{roomId}</strong>
                    {isHost ? ' · vous êtes hôte' : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(roomId);
                    }}
                  >
                    Copier code
                  </Button>
                  <Button variant="secondary" size="sm" onClick={onCopyInvite}>
                    Copier lien d’invitation
                  </Button>
                </div>
              )}
              <div style={{ display: 'grid', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                {roomPlayers.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.72 }}>Aucun joueur visible.</div>
                ) : (
                  roomPlayers.map((player) => (
                    <div
                      key={player.id ?? player.name}
                      style={{
                        fontSize: 12,
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>
                        <strong>{player.name}</strong>{' '}
                        {player.isHost ? '· hôte ' : ''}
                        {player.kind === 'ai'
                          ? `(IA${player.aiDifficulty ? ` · ${player.aiDifficulty}` : ''})`
                          : player.spectator
                            ? '(spectateur)'
                            : '(humain)'}{' '}
                        {player.kind !== 'ai' &&
                          (player.connected === false ? '(hors ligne)' : '(en ligne)')}
                        {player.ready ? ' · prêt' : ''}
                      </span>
                      {isHost && player.kind === 'ai' && player.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveAi(player.id!)}
                        >
                          Retirer
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
              {inRoom && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    onClick={() => onSetReady(true)}
                    disabled={joinAsSpectator}
                  >
                    Prêt
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => onSetReady(false)}
                    disabled={joinAsSpectator}
                  >
                    Pas prêt
                  </Button>
                  {isHost && (
                    <Button
                      variant="secondary"
                      onClick={onAddAi}
                      disabled={seatedCount >= roomCapacity}
                    >
                      Ajouter une IA
                    </Button>
                  )}
                  {isHost && (
                    <Button
                      variant="primary"
                      onClick={onStartGame}
                      disabled={!canStart}
                      title={startGate.reason}
                    >
                      Lancer la partie ({seatedCount}/{roomCapacity})
                    </Button>
                  )}
                  {isHost && !canStart && startGate.reason && (
                    <span style={{ fontSize: 11, opacity: 0.75 }}>{startGate.reason}</span>
                  )}
                  {inRoom && (
                    <span style={{ fontSize: 11, opacity: 0.7 }}>
                      « Prêt » est indicatif — l’hôte peut lancer dès que le quota de sièges est
                      atteint.
                    </span>
                  )}
                </div>
              )}
            </Panel>
          </div>

          <MultiplayerChat
            connected={connected}
            roomId={roomId}
            playerName={playerName}
            messages={chatMessages}
            onSend={onSendChat}
          />
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onBack}>
            {hasActiveGame ? 'Retour à la partie' : 'Retour menu'}
          </Button>
        </div>
      </Panel>
    </section>
  );
}

/** Construit le Partial<GameConfig> envoyé au serveur au lancement. */
export function buildMultiplayerStartConfig(
  lobbyConfig: MultiplayerLobbyConfig,
): { preset: RoomGamePreset; config: Partial<GameConfig> } {
  const classic = lobbyConfig.preset === 'classic';
  return {
    preset: lobbyConfig.preset,
    config: {
      mode: classic ? 'classic' : 'standard',
      mapSize: classic ? 'tiny' : 'medium',
      victoryPointTarget: lobbyConfig.victoryPointTarget,
      classicBoardLayout: classic ? lobbyConfig.boardLayout : undefined,
      enableSeasons: !classic && lobbyConfig.enableSeasons,
      enableEvents: !classic && lobbyConfig.enableEvents,
      enableTechTree: !classic && lobbyConfig.enableTechTree,
      enableDiplomacy: !classic && lobbyConfig.enableDiplomacy,
      enableMilitary: !classic && lobbyConfig.enableMilitary,
      worldCouncil: !classic && lobbyConfig.worldCouncil,
      fogOfWar: !classic && lobbyConfig.fogOfWar,
      barbarianStrength: {
        enabled: !classic && lobbyConfig.enableBarbarians,
        spawnRate: 6,
        strength: 4,
        scaling: true,
        navalBarbarians: false,
      },
      extensions: {
        seasons: {
          enabled: !classic && lobbyConfig.enableSeasons,
          ruleset: 'catanx-seasons-v2',
          roundsPerSeason: 5,
          forecastDepth: 1,
          preparationMode: 'secret-simultaneous',
          maxSeverePerYear: 2,
          allowConsecutiveSevere: false,
        },
        ...(lobbyConfig.enableCitiesKnights && !classic
          ? {
              citiesKnights: {
                enabled: true,
                ruleset: 'catanx-essential-v1' as const,
                victoryPointBonus: 3 as const,
                adaptiveBarbarianTrack: true as const,
              },
            }
          : {}),
        ...(lobbyConfig.enableUndergroundSky && !classic
          ? {
              undergroundSky: {
                enabled: true,
                ruleset: 'catanx-underground-sky-v1' as const,
                victoryPointBonus: 5 as const,
                undergroundGeneration: 'surface-derived' as const,
                skyGeneration: 'adaptive-network' as const,
                flightMode: 'programmed' as const,
                interactionMode: 'soft-competitive' as const,
              },
            }
          : {}),
        ...(lobbyConfig.enablePactsEmbassies && !classic
          ? {
              pactsEmbassies: {
                enabled: true,
                ruleset: 'catanx-pacts-embassies-v1' as const,
                victoryPointBonus: 3 as const,
                roundsPerCouncilSession: lobbyConfig.enableSeasons ? 5 as const : 4 as const,
                maxActivePactsPerPlayer: 2 as const,
                maxActiveResolutions: 2 as const,
                neutralCouncilMode: 'adaptive' as const,
              },
            }
          : {}),
      },
    },
  };
}

export function buildInviteUrl(serverUrl: string, roomId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('mp', '1');
  url.searchParams.set('server', serverUrl);
  url.searchParams.set('room', roomId);
  return url.toString();
}

export const DEFAULT_MULTIPLAYER_LOBBY_CONFIG: MultiplayerLobbyConfig = {
  preset: 'classic',
  boardLayout: 'fixed',
  enableSeasons: false,
  enableCitiesKnights: false,
  enableUndergroundSky: false,
  enablePactsEmbassies: false,
  enableEvents: false,
  enableTechTree: false,
  enableDiplomacy: false,
  enableMilitary: false,
  worldCouncil: false,
  fogOfWar: false,
  enableBarbarians: false,
  victoryPointTarget: 10,
  aiDifficulty: 'medium',
};
