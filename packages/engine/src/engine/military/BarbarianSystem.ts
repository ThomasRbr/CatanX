import { GameState, BarbarianGroup } from '../../types/game';
import { nextId } from '../../core/ids';
import { now } from '../../core/clock';
import { hexAllNeighbors, hexDistance, hexToId } from '../hex/HexMath';
import { CubeCoord } from '../../types/hex';
import { subtractResources, totalResources } from '../resources/ResourceSystem';
import { ResourceType } from '../../types/resources';

function logBarbarian(
  state: GameState,
  description: string,
  data: Record<string, unknown>,
): void {
  state.actionLog.push({
    id: nextId('log'),
    turn: state.currentTurn,
    playerId: 'system',
    type: 'system',
    description,
    data,
    timestamp: now(),
  });
}

function landTiles(state: GameState) {
  return [...state.map.values()].filter((tile) => tile.terrain !== 'ocean');
}

function tileDefense(state: GameState, tileId: string): number {
  const tile = state.map.get(tileId);
  if (!tile) return 0;
  let defense = 0;
  for (const unitId of tile.units) {
    const unit = state.units.get(unitId);
    if (!unit) continue;
    defense += unit.stats.defense + Math.floor(unit.stats.currentHealth / 20);
  }
  if (tile.owner) {
    const owner = state.players.get(tile.owner);
    if (owner) defense += Math.floor(owner.stats.militaryStrength / 8);
  }
  return defense;
}

function moveBarbarianToward(
  group: BarbarianGroup,
  target: CubeCoord,
  state: GameState,
): void {
  const neighbors = hexAllNeighbors(group.position);
  let best = group.position;
  let bestDist = hexDistance(group.position, target);
  for (const neighbor of neighbors) {
    const tileId = hexToId(neighbor);
    const tile = state.map.get(tileId);
    if (!tile || tile.terrain === 'ocean') continue;
    const dist = hexDistance(neighbor, target);
    if (dist < bestDist) {
      bestDist = dist;
      best = neighbor;
    }
  }
  group.position = { ...best };
}

function pickRaidTarget(state: GameState, group: BarbarianGroup): string | null {
  const from = group.position;
  const owned = landTiles(state).filter((tile) => Boolean(tile.owner));
  if (owned.length === 0) return null;

  owned.sort((a, b) => {
    const da = hexDistance(from, a.coord);
    const db = hexDistance(from, b.coord);
    if (da !== db) return da - db;
    const defA = tileDefense(state, a.id);
    const defB = tileDefense(state, b.id);
    return defA - defB;
  });
  return owned[0]?.id ?? null;
}

function applyRaidLoot(state: GameState, playerId: string, strength: number): void {
  const player = state.players.get(playerId);
  if (!player) return;
  const lootTypes: ResourceType[] = ['wheat', 'wood', 'sheep', 'clay', 'ore', 'coins', 'gold'];
  let remaining = Math.max(1, Math.floor(strength / 2));
  for (const resource of lootTypes) {
    if (remaining <= 0) break;
    const have = Number(player.resources[resource] ?? 0);
    if (have <= 0) continue;
    const take = Math.min(have, remaining);
    player.resources = subtractResources(player.resources, { [resource]: take });
    remaining -= take;
  }
}

function damageBuildingsOnTile(state: GameState, tileId: string, damage: number): void {
  const tile = state.map.get(tileId);
  if (!tile) return;
  for (const buildingId of tile.buildings) {
    const building = state.buildings.get(buildingId);
    if (!building) continue;
    building.health = Math.max(0, building.health - damage);
    if (building.health <= 0) {
      building.isActive = false;
    }
  }
}

/**
 * Spawn périodique + déplacement + raids contre les territoires les plus faibles.
 */
export function advanceBarbarians(state: GameState): void {
  const cfg = state.config.barbarianStrength;
  if (!cfg.enabled) return;

  const spawnEvery = Math.max(4, cfg.spawnRate);
  if (state.currentTurn > 0 && state.currentTurn % spawnEvery === 0) {
    const emptyTiles = landTiles(state).filter(
      (tile) => !tile.owner && tile.units.length === 0,
    );
    if (emptyTiles.length > 0) {
      const tile = emptyTiles[state.currentTurn % emptyTiles.length];
      const strength =
        cfg.strength + (cfg.scaling ? Math.floor(state.currentTurn / spawnEvery) : 0);
      const id = nextId('barb');
      state.barbarians.set(id, {
        id,
        position: { ...tile.coord },
        unitIds: [],
        strength,
        isRaiding: false,
      });
      logBarbarian(state, `Barbares apparus près de ${tile.id}`, {
        barbarianId: id,
        tileId: tile.id,
        strength,
      });
    }
  }

  // Raids / déplacement
  for (const [id, group] of [...state.barbarians.entries()]) {
    const targetTileId = pickRaidTarget(state, group);
    if (!targetTileId) continue;
    const targetTile = state.map.get(targetTileId);
    if (!targetTile || !targetTile.owner) continue;

    const dist = hexDistance(group.position, targetTile.coord);
    if (dist > 1) {
      moveBarbarianToward(group, targetTile.coord, state);
      group.isRaiding = false;
      group.target = targetTile.owner;
      // Si le déplacement atteint la cible, raid immédiat
      if (hexDistance(group.position, targetTile.coord) > 1) {
        continue;
      }
    }

    // Adjacent ou sur place : raid
    group.isRaiding = true;
    group.target = targetTile.owner;
    const defense = tileDefense(state, targetTileId);
    const raidPower = group.strength;

    if (defense >= raidPower) {
      group.strength = Math.max(0, group.strength - Math.ceil(defense / 2));
      logBarbarian(state, `Raid barbare repoussé sur ${targetTileId}`, {
        barbarianId: id,
        tileId: targetTileId,
        defense,
        remaining: group.strength,
      });
      if (group.strength <= 0) {
        state.barbarians.delete(id);
        const defender = state.players.get(targetTile.owner);
        if (defender) {
          defender.stats.battlesWon += 1;
          defender.resources.influence = (defender.resources.influence ?? 0) + 1;
        }
      }
      continue;
    }

    const damage = Math.max(5, raidPower - defense);
    applyRaidLoot(state, targetTile.owner, raidPower);
    damageBuildingsOnTile(state, targetTileId, damage);
    group.strength = Math.max(1, group.strength - 1);

    const victim = state.players.get(targetTile.owner);
    logBarbarian(
      state,
      `Raid barbare sur ${victim?.name ?? targetTile.owner} (${targetTileId})`,
      {
        barbarianId: id,
        tileId: targetTileId,
        damage,
        victimResources: victim ? totalResources(victim.resources) : 0,
      },
    );
  }
}
