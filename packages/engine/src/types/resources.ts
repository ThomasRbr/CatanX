// ============================================================
// RESSOURCES — 16 types + chaînes de production
// ============================================================

export type ResourceType =
  // Ressources de base (collecte directe)
  | 'wood' // Bois — forêt
  | 'clay' // Argile — collines
  | 'wheat' // Blé — plaines
  | 'sheep' // Laine — pâturage
  | 'ore' // Minerai — montagne
  | 'stone' // Pierre — montagne/collines
  | 'coal' // Charbon — collines profondes
  | 'gold' // Or — mines d'or
  | 'fish' // Poisson — côtes/lacs
  | 'spice' // Épices — jungles
  | 'water' // Eau — rivières/lacs
  | 'herbs' // Herbes — marécages
  | 'fur' // Fourrures — toundra
  | 'gems' // Gemmes — montagnes rares
  | 'obsidian' // Obsidienne — volcans
  | 'amber' // Ambre — forêts nordiques
  // Ressources transformées (via bâtiments)
  | 'lumber' // Bois scié (bois x2 + scierie)
  | 'brick' // Brique (argile + four)
  | 'flour' // Farine (blé + moulin)
  | 'bread' // Pain (farine + boulangerie) — nourriture
  | 'cloth' // Tissu (laine + filature)
  | 'iron' // Fer (minerai + forge)
  | 'steel' // Acier (fer + charbon + forge avancée)
  | 'glass' // Verre (sable + four)
  | 'tools' // Outils (fer + artisan)
  | 'weapons' // Armes (acier + forge militaire)
  | 'armor' // Armures (acier + atelier)
  | 'paper' // Papier (bois + moulin à papier)
  | 'books' // Livres (papier + encre + scriptorium)
  | 'coins' // Pièces (or + monnaie)
  | 'gems_cut' // Gemmes taillées (gemmes + atelier bijoutier)
  | 'medicine' // Médecine (herbes + laboratoire)
  | 'gunpowder' // Poudre à canon (charbon + soufre + atelier)
  | 'cannon_ball' // Boulets (fonte + forge)
  | 'ship_material' // Matériaux navals (bois + corde + goudron)
  | 'faith' // Foi — ressource abstraite (temples)
  | 'science' // Science — ressource abstraite (universités)
  | 'culture' // Culture — ressource abstraite (monuments)
  | 'influence'; // Influence — ressource diplomatique

export type ResourceBundle = Partial<Record<ResourceType, number>>;

export interface ResourceMarket {
  prices: Record<ResourceType, number>; // prix actuel en "coins"
  supply: Record<ResourceType, number>; // offre totale visible
  demand: Record<ResourceType, number>; // demande accumulée ce tour
  history: MarketEntry[];
}

export interface MarketEntry {
  turn: number;
  resource: ResourceType;
  price: number;
  volume: number;
  event?: string;
}

// Recettes de transformation
export interface ProductionRecipe {
  id: string;
  name: string;
  input: ResourceBundle;
  output: ResourceBundle;
  requiredBuilding: string;
  requiredTech?: string;
  turns: number; // tours de production nécessaires
  workerSlots: number; // nombre d'unités ouvrières requises
}

export const PRODUCTION_RECIPES: ProductionRecipe[] = [
  {
    id: 'lumber_mill',
    name: 'Sciage du bois',
    input: { wood: 2 },
    output: { lumber: 3 },
    requiredBuilding: 'sawmill',
    turns: 1,
    workerSlots: 1,
  },
  {
    id: 'brick_kiln',
    name: 'Fabrication brique',
    input: { clay: 2, coal: 1 },
    output: { brick: 3 },
    requiredBuilding: 'kiln',
    turns: 1,
    workerSlots: 1,
  },
  {
    id: 'flour_mill',
    name: 'Mouture farine',
    input: { wheat: 2 },
    output: { flour: 3 },
    requiredBuilding: 'windmill',
    turns: 1,
    workerSlots: 1,
  },
  {
    id: 'bakery',
    name: 'Cuisson pain',
    input: { flour: 2, water: 1 },
    output: { bread: 3 },
    requiredBuilding: 'bakery',
    turns: 1,
    workerSlots: 1,
  },
  {
    id: 'weaving',
    name: 'Tissage laine',
    input: { sheep: 2 },
    output: { cloth: 3 },
    requiredBuilding: 'loom',
    turns: 1,
    workerSlots: 1,
  },
  {
    id: 'smelting_iron',
    name: 'Fonte du fer',
    input: { ore: 2, coal: 1 },
    output: { iron: 2 },
    requiredBuilding: 'forge',
    turns: 1,
    workerSlots: 2,
  },
  {
    id: 'smelting_steel',
    name: 'Fabrication acier',
    input: { iron: 2, coal: 2 },
    output: { steel: 2 },
    requiredBuilding: 'advanced_forge',
    requiredTech: 'metallurgy',
    turns: 2,
    workerSlots: 2,
  },
  {
    id: 'tools_craft',
    name: 'Fabrication outils',
    input: { iron: 1, wood: 1 },
    output: { tools: 2 },
    requiredBuilding: 'workshop',
    turns: 1,
    workerSlots: 1,
  },
  {
    id: 'weapons_craft',
    name: 'Forge armes',
    input: { steel: 2, wood: 1 },
    output: { weapons: 2 },
    requiredBuilding: 'armory',
    requiredTech: 'iron_working',
    turns: 2,
    workerSlots: 2,
  },
  {
    id: 'armor_craft',
    name: 'Forge armures',
    input: { steel: 3 },
    output: { armor: 2 },
    requiredBuilding: 'armory',
    requiredTech: 'iron_working',
    turns: 2,
    workerSlots: 2,
  },
  {
    id: 'paper_mill',
    name: 'Fabrication papier',
    input: { wood: 3, water: 1 },
    output: { paper: 3 },
    requiredBuilding: 'paper_mill',
    requiredTech: 'writing',
    turns: 1,
    workerSlots: 1,
  },
  {
    id: 'books_scriptorium',
    name: 'Copie livres',
    input: { paper: 3 },
    output: { books: 2, science: 1 },
    requiredBuilding: 'scriptorium',
    requiredTech: 'writing',
    turns: 2,
    workerSlots: 1,
  },
  {
    id: 'minting',
    name: 'Frappe monnaie',
    input: { gold: 2 },
    output: { coins: 5 },
    requiredBuilding: 'mint',
    requiredTech: 'currency',
    turns: 1,
    workerSlots: 1,
  },
  {
    id: 'medicine_brew',
    name: 'Préparation médicament',
    input: { herbs: 3, water: 1 },
    output: { medicine: 2 },
    requiredBuilding: 'apothecary',
    requiredTech: 'herbalism',
    turns: 1,
    workerSlots: 1,
  },
  {
    id: 'gunpowder_mix',
    name: 'Fabrication poudre',
    input: { coal: 2, ore: 1 },
    output: { gunpowder: 2 },
    requiredBuilding: 'alchemist',
    requiredTech: 'chemistry',
    turns: 2,
    workerSlots: 1,
  },
  {
    id: 'ship_build',
    name: 'Construction navale',
    input: { lumber: 4, cloth: 2, iron: 1 },
    output: { ship_material: 3 },
    requiredBuilding: 'shipyard',
    requiredTech: 'navigation',
    turns: 3,
    workerSlots: 3,
  },
];
