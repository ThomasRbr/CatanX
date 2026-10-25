/**
 * Contrats aériens — decks data-driven, mélange, deal, réservation banque.
 */

import { SeededRandom } from '../../core/rng';
import type { ResourceType } from '../../types/resources';
import type { CkCommodity } from '../../types/citiesKnights';
import type {
  SkyContract,
  SkyContractKind,
  UndergroundSkyMaterial,
  UndergroundSkyState,
} from '../../types/undergroundSky';
import { CLASSIC_RESOURCE_TYPES } from '../catan/ClassicBoard';
import { releaseReservedMaterial, reserveMaterialFromBank } from './materials';

const CLASSIC: readonly ResourceType[] = [...CLASSIC_RESOURCE_TYPES];
const CK: readonly CkCommodity[] = ['ck_paper', 'ck_cloth', 'ck_coin'];

function materialForIndex(i: number): UndergroundSkyMaterial {
  return i % 2 === 0 ? 'us_crystal' : 'us_aether';
}

function classicChoices(seed: number): ResourceType[] {
  const rotated = [
    ...CLASSIC.slice(seed % CLASSIC.length),
    ...CLASSIC.slice(0, seed % CLASSIC.length),
  ];
  return rotated.slice(0, 3);
}

function buildRegularTemplates(citiesKnightsEnabled: boolean): SkyContract[] {
  const contracts: SkyContract[] = [];
  let idx = 0;

  const push = (
    kind: SkyContractKind,
    requirements: SkyContract['requirements'],
    preferredSite?: SkyContract['preferredSite'],
  ) => {
    contracts.push({
      id: `us_reg_${idx}`,
      kind,
      isMajor: false,
      requirements,
      preferredSite: preferredSite ?? null,
      rewardMaterial: materialForIndex(idx),
      rewardClassicChoices: classicChoices(idx),
      masteryPoints: 1,
      victoryPoints: 0,
    });
    idx += 1;
  };

  // 4 ravitaillement → Jardin flottant
  for (let i = 0; i < 4; i += 1) {
    push('supply', { resources: { wheat: 2, sheep: 1 } }, 'floating_garden');
  }
  // 4 construction → Bazar des vents
  for (let i = 0; i < 4; i += 1) {
    push('construction', { resources: { wood: 2, clay: 1 } }, 'wind_bazaar');
  }
  // 4 métallurgie → Ruines suspendues
  for (let i = 0; i < 4; i += 1) {
    push('metallurgy', { resources: { ore: 2, clay: 1 } }, 'hanging_ruins');
  }
  // 4 artisanat → Observatoire
  for (let i = 0; i < 4; i += 1) {
    const res = CLASSIC[i % CLASSIC.length]!;
    push(
      'craft',
      {
        resources: { [res]: 2 },
        materials: { us_crystal: 1 },
      },
      'observatory',
    );
  }
  // 4 énergie → Source d’Éther
  for (let i = 0; i < 4; i += 1) {
    const res = CLASSIC[(i + 2) % CLASSIC.length]!;
    push(
      'energy',
      {
        resources: { [res]: 2 },
        materials: { us_aether: 1 },
      },
      'aether_source',
    );
  }

  // 4 logistique CK → Bazar des vents (sinon artisanat Observatoire)
  if (citiesKnightsEnabled) {
    for (let i = 0; i < 4; i += 1) {
      const a = CK[i % CK.length]!;
      const b = CK[(i + 1) % CK.length]!;
      push(
        'ck_logistics',
        {
          commodities: a === b ? { [a]: 2 } : { [a]: 1, [b]: 1 },
        },
        'wind_bazaar',
      );
    }
  } else {
    for (let i = 0; i < 4; i += 1) {
      const res = CLASSIC[(i + 1) % CLASSIC.length]!;
      push(
        'craft',
        {
          resources: { [res]: 2 },
          materials: { us_crystal: 1 },
        },
        'observatory',
      );
    }
  }

  return contracts;
}

function buildMajorTemplates(citiesKnightsEnabled: boolean): SkyContract[] {
  const majors: SkyContract[] = [];
  const specs: Array<{
    resources?: Partial<Record<ResourceType, number>>;
    commodities?: Partial<Record<CkCommodity, number>>;
    materials?: Partial<Record<UndergroundSkyMaterial, number>>;
    site?: SkyContract['preferredSite'];
  }> = [
    { resources: { wheat: 2, sheep: 1, wood: 1 }, site: 'floating_garden' },
    { resources: { wood: 2, clay: 1, ore: 1 }, site: 'wind_bazaar' },
    { resources: { ore: 3, wheat: 1 }, site: 'hanging_ruins' },
    {
      resources: { sheep: 2 },
      materials: { us_crystal: 1, us_aether: 1 },
      site: 'observatory',
    },
    {
      resources: { wood: 2, ore: 1 },
      materials: { us_aether: 1 },
      site: 'aether_source',
    },
    {
      resources: { clay: 2, wheat: 1 },
      materials: { us_crystal: 1 },
      site: 'calm_mooring',
    },
    citiesKnightsEnabled
      ? {
          commodities: { ck_paper: 1, ck_cloth: 1, ck_coin: 1 },
          site: 'wind_bazaar',
        }
      : {
          resources: { wheat: 2, clay: 1 },
          materials: { us_aether: 1 },
          site: 'aether_source',
        },
    {
      resources: { wood: 2, sheep: 1 },
      materials: { us_crystal: 1 },
      site: 'turbulent_zone',
    },
  ];

  for (let i = 0; i < 8; i += 1) {
    const spec = specs[i]!;
    majors.push({
      id: `us_maj_${i}`,
      kind: spec.commodities ? 'ck_logistics' : 'supply',
      isMajor: true,
      requirements: {
        resources: spec.resources,
        commodities: spec.commodities,
        materials: spec.materials,
      },
      preferredSite: spec.site ?? null,
      rewardMaterial: materialForIndex(i + 1),
      rewardClassicChoices: classicChoices(i + 10),
      masteryPoints: 0,
      victoryPoints: 1,
    });
  }
  return majors;
}

export function buildContractDecks(
  seed: number,
  citiesKnightsEnabled: boolean,
): { regular: SkyContract[]; major: SkyContract[] } {
  const rng = new SeededRandom(seed ^ 0xc0a7_ac7);
  const regular = rng.shuffle(buildRegularTemplates(citiesKnightsEnabled));
  const major = rng.shuffle(buildMajorTemplates(citiesKnightsEnabled));
  return { regular, major };
}

/**
 * Tente de réserver le matériau de récompense ; sinon replace sous le deck.
 */
export function tryDealContractFromDeck(
  us: UndergroundSkyState,
  kind: 'regular' | 'major',
): SkyContract | null {
  const deck =
    kind === 'regular' ? us.regularContractDeck : us.majorContractDeck;
  if (deck.length === 0) return null;

  const maxAttempts = deck.length;
  for (let i = 0; i < maxAttempts; i += 1) {
    const card = deck.shift()!;
    if (reserveMaterialFromBank(us, card.rewardMaterial, 1)) {
      us._secret.reservedMaterialContractIds.push(card.id);
      return card;
    }
    // Indisponible → sous le deck (déterministe)
    deck.push(card);
  }
  return null;
}

export function dealInitialContracts(us: UndergroundSkyState): void {
  us.faceUpRegularContracts = [];
  for (let i = 0; i < 3; i += 1) {
    const card = tryDealContractFromDeck(us, 'regular');
    if (card) us.faceUpRegularContracts.push(card);
  }
  us.faceUpMajorContract = tryDealContractFromDeck(us, 'major');
}

export function replaceCompletedContract(
  us: UndergroundSkyState,
  completed: SkyContract,
): void {
  // Libérer la réservation id si encore présente
  us._secret.reservedMaterialContractIds =
    us._secret.reservedMaterialContractIds.filter((id) => id !== completed.id);

  if (completed.isMajor) {
    us.faceUpMajorContract = tryDealContractFromDeck(us, 'major');
    return;
  }
  us.faceUpRegularContracts = us.faceUpRegularContracts.filter(
    (c) => c.id !== completed.id,
  );
  const next = tryDealContractFromDeck(us, 'regular');
  if (next) us.faceUpRegularContracts.push(next);
}

export function findFaceUpContract(
  us: UndergroundSkyState,
  contractId: string,
): SkyContract | null {
  const reg = us.faceUpRegularContracts.find((c) => c.id === contractId);
  if (reg) return reg;
  if (us.faceUpMajorContract?.id === contractId) return us.faceUpMajorContract;
  return null;
}

export function releaseContractReservation(
  us: UndergroundSkyState,
  contract: SkyContract,
): void {
  if (us._secret.reservedMaterialContractIds.includes(contract.id)) {
    releaseReservedMaterial(us, contract.rewardMaterial, 1);
    us._secret.reservedMaterialContractIds =
      us._secret.reservedMaterialContractIds.filter((id) => id !== contract.id);
  }
}
