import { describe, expect, it } from 'vitest';
import { GameRoom, RoomManager } from '../RoomManager';

describe('Phase 6 RoomManager', () => {
  it('creates rooms and lists summaries', () => {
    const manager = new RoomManager();
    const room = manager.create('Test', 4);
    expect(room.id).toMatch(/^R/);
    expect(manager.list().some((entry) => entry.id === room.id)).toBe(true);
  });

  it('rejects a third seat when maxPlayers is 2', () => {
    const room = new GameRoom('Duel', 2);
    expect(room.addSeat('s1', 'Alice', false).ok).toBe(true);
    expect(room.addSeat('s2', 'Bob', false).ok).toBe(true);
    const third = room.addSeat('s3', 'Carol', false);
    expect(third.ok).toBe(false);
  });

  it('starts a classic game with 3 humans and rejects foreign player commands', () => {
    const room = new GameRoom('Match', 4);
    const a = room.addSeat('sockA', 'Alice', false);
    const b = room.addSeat('sockB', 'Bob', false);
    const c = room.addSeat('sockC', 'Carol', false);
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;

    const started = room.startGame('sockA', { preset: 'classic' });
    expect(started.ok).toBe(true);
    expect(room.status).toBe('playing');
    expect(room.state).toBeTruthy();
    expect(a.seat.gamePlayerId).toBeTruthy();

    const illegal = room.applyPlayerCommand('sockB', {
      type: 'roll_dice',
      playerId: a.seat.gamePlayerId!,
    });
    expect(illegal.ok).toBe(false);
    if (!illegal.ok) {
      expect(illegal.code).toBe('wrong_player');
    }

    const okRoll = room.applyPlayerCommand('sockA', {
      type: 'roll_dice',
      playerId: a.seat.gamePlayerId!,
    });
    expect(typeof okRoll.ok).toBe('boolean');
  });

  it('rejects classic start with only 2 humans', () => {
    const room = new GameRoom('TooFew', 4);
    room.addSeat('a', 'A', false);
    room.addSeat('b', 'B', false);
    const started = room.startGame('a', { preset: 'classic' });
    expect(started.ok).toBe(false);
  });

  it('starts catanx with 1 human + 1 AI', () => {
    const room = new GameRoom('Hybrid', 4);
    const human = room.addSeat('sockA', 'Alice', false);
    expect(human.ok).toBe(true);
    if (!human.ok) return;
    const ai = room.addAiSeat('sockA', { difficulty: 'medium' });
    expect(ai.ok).toBe(true);
    if (!ai.ok) return;
    expect(ai.seat.kind).toBe('ai');

    const started = room.startGame('sockA', {
      preset: 'catanx',
      config: {
        enableSeasons: true,
        victoryPointTarget: 15,
      },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(room.state?.config.mode).not.toBe('classic');
    const aiPlayer = room.state!.players.get(ai.seat.gamePlayerId!);
    expect(aiPlayer?.type).toBe('ai');
  });

  it('advances version when AI takes a step', () => {
    const room = new GameRoom('AIStep', 4);
    const human = room.addSeat('sockA', 'Alice', false);
    expect(human.ok).toBe(true);
    if (!human.ok) return;
    const ai = room.addAiSeat('sockA', { name: 'Bot', difficulty: 'easy' });
    expect(ai.ok).toBe(true);
    if (!ai.ok) return;

    expect(
      room.startGame('sockA', {
        preset: 'catanx',
        config: { mapSeed: 42 },
      }).ok,
    ).toBe(true);
    expect(room.state).toBeTruthy();

    const aiPlayerId = ai.seat.gamePlayerId!;
    room.state!.phase = 'playing';
    room.state!.turnPhase = 'start_of_turn';
    room.state!.currentPlayerIndex = room.state!.turnOrder.indexOf(aiPlayerId);
    room.state!.sevenFlow = null;
    room.state!.pendingPlayerTrade = null;

    const before = room.version;
    expect(room.needsAIStep()).toBe(true);
    const step = room.applyServerAIStep();
    expect(step.ok).toBe(true);
    if (step.ok) expect(step.acted).toBe(true);
    expect(room.version).toBeGreaterThan(before);
  });

  it('reconnects a seat with token and restores binding', () => {
    const room = new GameRoom('Reco', 3);
    const joined = room.addSeat('oldSock', 'Dana', false);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    room.markDisconnected('oldSock');
    expect(joined.seat.connected).toBe(false);

    const reco = room.reconnect(joined.seat.reconnectToken, 'newSock');
    expect(reco.ok).toBe(true);
    if (!reco.ok) return;
    expect(reco.seat.connected).toBe(true);
    expect(reco.seat.socketId).toBe('newSock');
  });

  it('serializes wire state after start', () => {
    const room = new GameRoom('Wire', 3);
    room.addSeat('a', 'A', false);
    room.addSeat('b', 'B', false);
    room.addAiSeat('a', { name: 'IA Wire' });
    expect(room.startGame('a', { preset: 'classic' }).ok).toBe(true);
    const wire = room.wireState();
    expect(wire).toBeTruthy();
    expect(Array.isArray(wire?.map)).toBe(true);
    expect(Array.isArray(wire?.players)).toBe(true);
  });

  it('projects private views per seat (hides opponent hands + deck)', () => {
    const room = new GameRoom('Privacy', 3);
    const a = room.addSeat('sockA', 'Alice', false);
    const b = room.addSeat('sockB', 'Bob', false);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(room.addAiSeat('sockA', { name: 'IA Priv' }).ok).toBe(true);
    expect(room.startGame('sockA', { preset: 'classic' }).ok).toBe(true);

    const aliceId = a.seat.gamePlayerId!;
    const bobId = b.seat.gamePlayerId!;
    room.state!.players.get(aliceId)!.resources = { wood: 3, clay: 2 };
    room.state!.players.get(bobId)!.resources = { ore: 9 };
    room.state!.players.get(bobId)!.devCards = [
      { id: 'c1', type: 'victory_point', acquiredTurn: 1, played: false },
    ];
    room.state!.devDeck = ['knight', 'monopoly', 'road_building'];

    const aliceWire = room.wireStateForViewer(aliceId);
    const bobEntry = aliceWire?.players.find(([id]) => id === bobId)?.[1];
    expect(bobEntry?.resources).toEqual({});
    expect(bobEntry?.publicResourceCount).toBe(9);
    expect(bobEntry?.devCards).toEqual([]);
    expect(bobEntry?.publicDevCardCount).toBe(1);
    expect(aliceWire?.devDeck).toEqual([]);
    expect(aliceWire?.publicDevDeckCount).toBe(3);

    const aliceSelf = aliceWire?.players.find(([id]) => id === aliceId)?.[1];
    expect(aliceSelf?.resources.wood).toBe(3);

    expect(room.state!.players.get(bobId)!.resources.ore).toBe(9);
    expect(room.state!.devDeck).toHaveLength(3);
  });

  it('reclaims a disconnected seat by player name', () => {
    const room = new GameRoom('Reclaim', 3);
    const first = room.addSeat('sock1', 'Eve', false);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const token = first.seat.reconnectToken;
    room.markDisconnected('sock1');

    const reclaim = room.addSeat('sock2', 'Eve', false);
    expect(reclaim.ok).toBe(true);
    if (!reclaim.ok) return;
    expect(reclaim.seat.seatId).toBe(first.seat.seatId);
    expect(reclaim.seat.reconnectToken).toBe(token);
    expect(reclaim.seat.connected).toBe(true);
    expect(room.seats).toHaveLength(1);
  });

  it('does not make a spectator the host', () => {
    const room = new GameRoom('Spec', 4);
    const spec = room.addSeat('s0', 'Watcher', true);
    expect(spec.ok).toBe(true);
    if (!spec.ok) return;
    expect(spec.seat.isHost).toBe(false);

    const host = room.addSeat('s1', 'Host', false);
    expect(host.ok).toBe(true);
    if (!host.ok) return;
    expect(host.seat.isHost).toBe(true);
  });

  it('only host can add/remove AI seats', () => {
    const room = new GameRoom('HostAI', 4);
    room.addSeat('host', 'Host', false);
    room.addSeat('guest', 'Guest', false);
    expect(room.addAiSeat('guest', {}).ok).toBe(false);
    expect(room.addAiSeat('host', { name: 'Bot1' }).ok).toBe(true);
    const aiId = room.seats.find((s) => s.kind === 'ai')!.seatId;
    expect(room.removeAiSeat('guest', aiId).ok).toBe(false);
    expect(room.removeAiSeat('host', aiId).ok).toBe(true);
  });

  it('promotes next human as host and exposes isHost in playersInfo', () => {
    const room = new GameRoom('HostTransfer', 4);
    const a = room.addSeat('sockA', 'Alice', false);
    const b = room.addSeat('sockB', 'Bob', false);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.seat.isHost).toBe(true);
    room.removeSeat(a.seat.seatId);
    expect(b.seat.isHost).toBe(true);
    const info = room.playersInfo().find((p) => p.id === b.seat.seatId);
    expect(info?.isHost).toBe(true);
  });
});
