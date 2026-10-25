import type {
  PlayerAccessoryId,
  PlayerAuraId,
  PlayerBannerId,
  PlayerCardMaterialId,
  PlayerColor,
  PlayerDiceStyleId,
  PlayerEmblemId,
  PlayerExpressionId,
  PlayerFrameId,
  PlayerHairColorId,
  PlayerOutfitId,
  PlayerPieceFinishId,
  PlayerPortraitId,
  PlayerProfile,
  PlayerSkinToneId,
  PlayerTitleId,
} from '@catanx/engine';

export type ResolvedPlayerProfile = Required<PlayerProfile>;

export const PIECE_COLORS: Array<{ id: PlayerColor; label: string; hex: string }> = [
  { id: 'blue', label: 'Bleu azur', hex: '#4e9dff' },
  { id: 'red', label: 'Corail', hex: '#ff6b5f' },
  { id: 'green', label: 'Jade', hex: '#57c785' },
  { id: 'orange', label: 'Solaire', hex: '#ffae42' },
  { id: 'purple', label: 'Violet', hex: '#8b6cff' },
  { id: 'cyan', label: 'Turquoise', hex: '#1fc8c4' },
  { id: 'white', label: 'Ivoire', hex: '#f7f8fc' },
  { id: 'brown', label: 'Terre', hex: '#9a6845' },
];

export const PORTRAITS: Array<{ id: PlayerPortraitId; label: string; hint: string }> = [
  { id: 'navigator', label: 'Navigatrice', hint: 'Audacieuse et maritime' },
  { id: 'architect', label: 'Architecte', hint: 'Précis et visionnaire' },
  { id: 'merchant', label: 'Marchande', hint: 'Élégante et persuasive' },
  { id: 'scholar', label: 'Érudit', hint: 'Curieux et méthodique' },
  { id: 'guardian', label: 'Gardienne', hint: 'Calme et résolue' },
  { id: 'explorer', label: 'Explorateur', hint: 'Libre et téméraire' },
  { id: 'cartographer', label: 'Cartographe', hint: 'Attentive et inventive' },
  { id: 'diplomat', label: 'Diplomate', hint: 'Sereine et charismatique' },
  { id: 'artisan', label: 'Artisane', hint: 'Créative et déterminée' },
  { id: 'ranger', label: 'Éclaireuse', hint: 'Vive et indépendante' },
  { id: 'commander', label: 'Commandant', hint: 'Direct et stratégique' },
  { id: 'astronomer', label: 'Astronome', hint: 'Rêveuse et brillante' },
];

export const SKIN_TONES: Array<{ id: PlayerSkinToneId; label: string; hex: string }> = [
  { id: 'porcelain', label: 'Porcelaine', hex: '#f3c8ae' },
  { id: 'sand', label: 'Sable', hex: '#e7b28d' },
  { id: 'honey', label: 'Miel', hex: '#cf9168' },
  { id: 'olive', label: 'Olive', hex: '#bd845f' },
  { id: 'bronze', label: 'Bronze', hex: '#a96848' },
  { id: 'cocoa', label: 'Cacao', hex: '#81503d' },
  { id: 'ebony', label: 'Ébène', hex: '#5b382f' },
  { id: 'rose', label: 'Rose', hex: '#efb49e' },
];

export const HAIR_COLORS: Array<{ id: PlayerHairColorId; label: string; hex: string }> = [
  { id: 'midnight', label: 'Minuit', hex: '#17283a' },
  { id: 'chestnut', label: 'Châtain', hex: '#613d31' },
  { id: 'copper', label: 'Cuivré', hex: '#b85e3f' },
  { id: 'gold', label: 'Doré', hex: '#d8ad57' },
  { id: 'silver', label: 'Argent', hex: '#cbd4dc' },
  { id: 'teal', label: 'Lagon', hex: '#177f81' },
  { id: 'coral', label: 'Corail', hex: '#cc5d62' },
  { id: 'plum', label: 'Prune', hex: '#684064' },
];

export const EXPRESSIONS: Array<{ id: PlayerExpressionId; label: string; glyph: string }> = [
  { id: 'calm', label: 'Sereine', glyph: '—' },
  { id: 'smile', label: 'Souriante', glyph: '⌣' },
  { id: 'focused', label: 'Concentrée', glyph: '⌁' },
  { id: 'bold', label: 'Déterminée', glyph: '⌃' },
  { id: 'joyful', label: 'Rayonnante', glyph: '◡' },
];

export const OUTFITS: Array<{ id: PlayerOutfitId; label: string; hint: string }> = [
  { id: 'voyager', label: 'Voyageur', hint: 'Cape courte et col marin' },
  { id: 'artisan', label: 'Artisan', hint: 'Tablier structuré' },
  { id: 'diplomat', label: 'Diplomate', hint: 'Veste aux lignes nettes' },
  { id: 'scholar', label: 'Érudit', hint: 'Manteau académique' },
  { id: 'guardian', label: 'Gardien', hint: 'Plastron de céramique' },
  { id: 'nomad', label: 'Nomade', hint: 'Étoffe drapée' },
  { id: 'harbormaster', label: 'Maître du port', hint: 'Uniforme contemporain' },
  { id: 'strategist', label: 'Stratège', hint: 'Veste tactique premium' },
];

export const ACCESSORIES: Array<{ id: PlayerAccessoryId; label: string }> = [
  { id: 'none', label: 'Sans accessoire' },
  { id: 'captain', label: 'Casquette de capitaine' },
  { id: 'laurel', label: 'Lauriers solaires' },
  { id: 'monocle', label: 'Lunette tactique' },
  { id: 'hood', label: 'Capuche insulaire' },
  { id: 'diadem', label: 'Diadème facetté' },
  { id: 'goggles', label: 'Lunettes d’atelier' },
  { id: 'feather', label: 'Plume de voyage' },
  { id: 'scarf', label: 'Foulard côtier' },
  { id: 'earring', label: 'Boucle solaire' },
  { id: 'headset', label: 'Visière de stratège' },
  { id: 'circlet', label: 'Cercle d’ivoire' },
  { id: 'bandana', label: 'Bandana d’exploration' },
];

export const EMBLEMS: Array<{ id: PlayerEmblemId; label: string }> = [
  { id: 'compass', label: 'Boussole' },
  { id: 'peak', label: 'Sommet' },
  { id: 'harbor', label: 'Port' },
  { id: 'sun', label: 'Soleil' },
  { id: 'oak', label: 'Chêne' },
  { id: 'star', label: 'Étoile' },
  { id: 'anchor', label: 'Ancre' },
  { id: 'wave', label: 'Vague' },
  { id: 'hammer', label: 'Marteau' },
  { id: 'wheat', label: 'Épi' },
  { id: 'shield', label: 'Rempart' },
  { id: 'moon', label: 'Lune' },
];

export const BANNERS: Array<{ id: PlayerBannerId; label: string }> = [
  { id: 'tide', label: 'Marée' },
  { id: 'facets', label: 'Facettes' },
  { id: 'topography', label: 'Relief' },
  { id: 'rays', label: 'Rayonnement' },
  { id: 'weave', label: 'Tissage' },
  { id: 'night', label: 'Nuit insulaire' },
  { id: 'archipelago', label: 'Archipel' },
  { id: 'harbor_lights', label: 'Lumières du port' },
  { id: 'aurora', label: 'Aurore boréale' },
  { id: 'sunrise', label: 'Premier soleil' },
  { id: 'terrazzo', label: 'Terrazzo collector' },
  { id: 'blueprint', label: 'Plan d’architecte' },
];

export const FRAMES: Array<{ id: PlayerFrameId; label: string }> = [
  { id: 'ceramic', label: 'Céramique' },
  { id: 'steel', label: 'Acier brossé' },
  { id: 'turquoise', label: 'Turquoise' },
  { id: 'coral', label: 'Corail' },
  { id: 'violet', label: 'Violet stratégie' },
  { id: 'obsidian', label: 'Obsidienne' },
  { id: 'solar', label: 'Solaire' },
  { id: 'jade', label: 'Jade' },
  { id: 'pearl', label: 'Nacre' },
  { id: 'prism', label: 'Prisme' },
];

export const TITLES: Array<{ id: PlayerTitleId; label: string }> = [
  { id: 'pathfinder', label: 'Éclaireur des rivages' },
  { id: 'master_builder', label: 'Maître bâtisseur' },
  { id: 'harbor_voice', label: 'Voix des comptoirs' },
  { id: 'island_scholar', label: 'Érudit de l’île' },
  { id: 'catan_guardian', label: 'Gardien de Catan' },
  { id: 'first_settler', label: 'Premier colon' },
  { id: 'master_cartographer', label: 'Cartographe des mondes' },
  { id: 'great_diplomat', label: 'Architecte des alliances' },
  { id: 'island_artisan', label: 'Artisan de l’archipel' },
  { id: 'frontier_ranger', label: 'Éclaireur des frontières' },
  { id: 'road_commander', label: 'Commandant des routes' },
  { id: 'star_reader', label: 'Lecteur des étoiles' },
];

export const AURAS: Array<{ id: PlayerAuraId; label: string; hint: string }> = [
  { id: 'none', label: 'Pure', hint: 'Sans effet' },
  { id: 'tide', label: 'Marée', hint: 'Halo turquoise' },
  { id: 'sunrise', label: 'Aube', hint: 'Lueur solaire' },
  { id: 'ember', label: 'Braise', hint: 'Éclat corail' },
  { id: 'aurora', label: 'Aurore', hint: 'Reflets changeants' },
  { id: 'starlight', label: 'Étoiles', hint: 'Poussière lumineuse' },
];

export const CARD_MATERIALS: Array<{ id: PlayerCardMaterialId; label: string }> = [
  { id: 'acrylic', label: 'Acrylique givré' },
  { id: 'paper', label: 'Papier nuit' },
  { id: 'carbon', label: 'Carbone tissé' },
  { id: 'ceramic', label: 'Céramique mate' },
  { id: 'holographic', label: 'Holographique' },
  { id: 'velvet', label: 'Velours graphite' },
];

export const PIECE_FINISHES: Array<{ id: PlayerPieceFinishId; label: string }> = [
  { id: 'matte', label: 'Mat' },
  { id: 'gloss', label: 'Laqué' },
  { id: 'porcelain', label: 'Porcelaine' },
  { id: 'metallic', label: 'Métal brossé' },
  { id: 'frosted', label: 'Acrylique givré' },
  { id: 'marbled', label: 'Marbré collector' },
];

export const DICE_STYLES: Array<{
  id: PlayerDiceStyleId;
  label: string;
  face: string;
  pip: string;
}> = [
  { id: 'classic', label: 'Catan classique', face: '#f7e8bd', pip: '#352115' },
  { id: 'navy', label: 'Bleu nuit', face: '#18314f', pip: '#f7f8fc' },
  { id: 'turquoise', label: 'Lagon', face: '#1fc8c4', pip: '#0b1f38' },
  { id: 'coral', label: 'Corail', face: '#ff6b5f', pip: '#fff5e8' },
  { id: 'violet', label: 'Stratégie', face: '#8b6cff', pip: '#f7f8fc' },
  { id: 'solar', label: 'Solaire', face: '#ffcd4a', pip: '#4a3210' },
  { id: 'obsidian', label: 'Obsidienne', face: '#202735', pip: '#7ff3e8' },
  { id: 'ivory', label: 'Ivoire froid', face: '#f7f8fc', pip: '#0b1f38' },
];

export const PROFILE_TAGLINES = [
  'Toujours un cap d’avance.',
  'Chaque route ouvre une possibilité.',
  'L’île récompense les audacieux.',
  'Bâtir aujourd’hui, régner demain.',
  'Le prochain rivage nous attend.',
  'Un bon échange change toute la partie.',
  'Lire le terrain, façonner l’avenir.',
  'Les plus beaux empires commencent petit.',
  'La stratégie laisse toujours une trace.',
  'Transformer l’occasion en victoire.',
  'Voir plus loin que le prochain lancer.',
  'Une île, mille chemins possibles.',
] as const;

const DEFAULTS: ResolvedPlayerProfile[] = [
  {
    portrait: 'navigator',
    accessory: 'captain',
    emblem: 'compass',
    banner: 'tide',
    frame: 'turquoise',
    title: 'pathfinder',
    tagline: PROFILE_TAGLINES[0],
    pieceColor: 'blue',
    skinTone: 'sand',
    hairColor: 'midnight',
    expression: 'smile',
    outfit: 'voyager',
    aura: 'tide',
    cardMaterial: 'acrylic',
    pieceFinish: 'gloss',
    diceStyle: 'navy',
  },
  {
    portrait: 'architect',
    accessory: 'laurel',
    emblem: 'peak',
    banner: 'facets',
    frame: 'coral',
    title: 'master_builder',
    tagline: 'Chaque route raconte une ambition.',
    pieceColor: 'red',
    skinTone: 'honey',
    hairColor: 'chestnut',
    expression: 'focused',
    outfit: 'artisan',
    aura: 'ember',
    cardMaterial: 'paper',
    pieceFinish: 'matte',
    diceStyle: 'coral',
  },
  {
    portrait: 'merchant',
    accessory: 'diadem',
    emblem: 'harbor',
    banner: 'rays',
    frame: 'ceramic',
    title: 'harbor_voice',
    tagline: 'Tout accord ouvre un nouveau monde.',
    pieceColor: 'green',
    skinTone: 'bronze',
    hairColor: 'plum',
    expression: 'bold',
    outfit: 'diplomat',
    aura: 'sunrise',
    cardMaterial: 'ceramic',
    pieceFinish: 'porcelain',
    diceStyle: 'turquoise',
  },
  {
    portrait: 'scholar',
    accessory: 'monocle',
    emblem: 'star',
    banner: 'topography',
    frame: 'violet',
    title: 'island_scholar',
    tagline: 'Observer, comprendre, construire.',
    pieceColor: 'orange',
    skinTone: 'porcelain',
    hairColor: 'silver',
    expression: 'calm',
    outfit: 'scholar',
    aura: 'starlight',
    cardMaterial: 'carbon',
    pieceFinish: 'metallic',
    diceStyle: 'solar',
  },
  {
    portrait: 'guardian',
    accessory: 'hood',
    emblem: 'oak',
    banner: 'weave',
    frame: 'steel',
    title: 'catan_guardian',
    tagline: 'L’île tient tant que nous tenons.',
    pieceColor: 'purple',
    skinTone: 'cocoa',
    hairColor: 'midnight',
    expression: 'bold',
    outfit: 'guardian',
    aura: 'aurora',
    cardMaterial: 'velvet',
    pieceFinish: 'frosted',
    diceStyle: 'violet',
  },
  {
    portrait: 'explorer',
    accessory: 'bandana',
    emblem: 'sun',
    banner: 'night',
    frame: 'obsidian',
    title: 'first_settler',
    tagline: 'Le prochain rivage nous attend.',
    pieceColor: 'cyan',
    skinTone: 'olive',
    hairColor: 'copper',
    expression: 'joyful',
    outfit: 'nomad',
    aura: 'none',
    cardMaterial: 'holographic',
    pieceFinish: 'marbled',
    diceStyle: 'obsidian',
  },
];

export function createDefaultProfile(index = 0): ResolvedPlayerProfile {
  return { ...DEFAULTS[index % DEFAULTS.length]! };
}

export function normalizeProfile(
  profile: Partial<PlayerProfile> | null | undefined,
  index = 0,
): ResolvedPlayerProfile {
  const definedValues = Object.fromEntries(
    Object.entries(profile ?? {}).filter(([, value]) => value !== undefined),
  ) as Partial<PlayerProfile>;
  return { ...createDefaultProfile(index), ...definedValues };
}

export function profileTitleLabel(title: PlayerTitleId): string {
  return TITLES.find((item) => item.id === title)?.label ?? 'Joueur de Catan';
}

export function pieceColorHex(color: PlayerColor): string {
  return PIECE_COLORS.find((item) => item.id === color)?.hex ?? '#4e9dff';
}

export function skinToneHex(tone: PlayerSkinToneId): string {
  return SKIN_TONES.find((item) => item.id === tone)?.hex ?? '#e7b28d';
}

export function hairColorHex(color: PlayerHairColorId): string {
  return HAIR_COLORS.find((item) => item.id === color)?.hex ?? '#17283a';
}
