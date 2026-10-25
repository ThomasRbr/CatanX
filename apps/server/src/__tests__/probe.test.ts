import { it } from 'vitest';
import { pickNextAIStep, serializeMaps, deserializeMaps } from '@catanx/engine';
import { GameRoom } from '../RoomManager';

/* eslint-disable @typescript-eslint/no-explicit-any */
function run(preset: 'classic' | 'catanx', humans: number, ais: number, seed: number, config: any = {}) {
  const room = new GameRoom('P', 6);
  for (let i = 0; i < humans; i++) room.addSeat('s' + i, 'H' + i, false);
  for (let i = 0; i < ais; i++) room.addAiSeat('s0', {});
  const r = room.startGame('s0', { preset, config: { mapSeed: seed, ...config } });
  if (!r.ok) return console.log('start fail', r);
  const sockOf = new Map(
    room.seats.filter((s) => s.kind === 'human').map((s) => [s.gamePlayerId!, s.socketId!]),
  );
  let steps = 0;
  let stalls = 0;
  const rejects: Record<string, number> = {};
  const t0 = Date.now();
  while (room.status === 'playing' && steps < 8000) {
    steps++;
    const clone = deserializeMaps(serializeMaps(room.state!));
    for (const p of clone.players.values()) p.type = 'ai';
    const step = pickNextAIStep(clone);
    if (!step) {
      console.log('NO STEP', room.state!.phase, room.state!.turnPhase);
      break;
    }
    const pid = step.kind === 'command' ? (step.command as any).playerId : step.playerId;
    const sock = sockOf.get(pid);
    if (sock) {
      if (step.kind !== 'command') {
        console.log('human build step unsupported', step);
        break;
      }
      const res = room.applyPlayerCommand(sock, step.command);
      if (!res.ok) {
        const k = step.command.type + ':' + res.code;
        rejects[k] = (rejects[k] ?? 0) + 1;
        stalls++;
        if (stalls > 30) {
          console.log('STALL human', JSON.stringify(step.command), res, room.state!.phase, room.state!.turnPhase);
          break;
        }
      } else stalls = 0;
    } else {
      const res = room.applyServerAIStep();
      if (!(res.ok && 'acted' in res && res.acted)) {
        stalls++;
        if (stalls > 30) {
          console.log('STALL ai', JSON.stringify(step).slice(0, 300), room.state!.phase, room.state!.turnPhase);
          break;
        }
      } else stalls = 0;
    }
  }
  const s = room.state!;
  console.log(
    preset, JSON.stringify(Object.keys(config.extensions ?? {})), 'h', humans, 'ai', ais, 'seed', seed,
    'status', room.status, 'phase', s.phase, s.turnPhase, 'turn', s.currentTurn, 'steps', steps,
    'winner', s.winner, 'VP', [...s.players.values()].map((p) => p.stats.victoryPoints),
    'rejects', JSON.stringify(rejects), 'ms', Date.now() - t0,
  );
}

const ext = (o: any = {}) => ({
  mode: 'standard', mapSize: 'medium', victoryPointTarget: 15,
  enableSeasons: o.seasons ?? true, enableEvents: true, enableTechTree: true, enableDiplomacy: true,
  enableMilitary: true, worldCouncil: true, fogOfWar: o.fog ?? false,
  barbarianStrength: { enabled: true, spawnRate: 6, strength: 4, scaling: true, navalBarbarians: false },
  extensions: {
    seasons: { enabled: o.seasons ?? true, ruleset: 'catanx-seasons-v2', roundsPerSeason: 5, forecastDepth: 1, preparationMode: 'secret-simultaneous', maxSeverePerYear: 2, allowConsecutiveSevere: false },
    ...(o.ck ? { citiesKnights: { enabled: true, ruleset: 'catanx-essential-v1', victoryPointBonus: 3, adaptiveBarbarianTrack: true } } : {}),
    ...(o.us ? { undergroundSky: { enabled: true, ruleset: 'catanx-underground-sky-v1', victoryPointBonus: 5, undergroundGeneration: 'surface-derived', skyGeneration: 'adaptive-network', flightMode: 'programmed', interactionMode: 'soft-competitive' } } : {}),
    ...(o.pe ? { pactsEmbassies: { enabled: true, ruleset: 'catanx-pacts-embassies-v1', victoryPointBonus: 3, roundsPerCouncilSession: 5, maxActivePactsPerPlayer: 2, maxActiveResolutions: 2, neutralCouncilMode: 'adaptive' } } : {}),
  },
});

it('probe', () => {
  run('catanx', 2, 1, 1, ext());
  run('catanx', 2, 1, 2, ext({ ck: true }));
  run('catanx', 2, 1, 3, ext({ us: true }));
  run('catanx', 2, 1, 4, ext({ pe: true }));
  run('catanx', 3, 1, 5, ext({ ck: true, us: true, pe: true }));
}, 600000);
