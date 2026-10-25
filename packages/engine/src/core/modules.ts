import { GameModules } from './presets';

export interface ModuleDefinition {
  id: keyof GameModules;
  label: string;
  description: string;
  dependencies: (keyof GameModules)[];
  incompatibleWith: (keyof GameModules)[];
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    id: 'events',
    label: 'Événements',
    description: "Cartes et chaînes d'événements aléatoires.",
    dependencies: [],
    incompatibleWith: [],
  },
  {
    id: 'technologies',
    label: 'Technologies',
    description: 'Arbre technologique et ères.',
    dependencies: [],
    incompatibleWith: [],
  },
  {
    id: 'armies',
    label: 'Armées',
    description: 'Unités militaires et combat.',
    dependencies: [],
    incompatibleWith: [],
  },
  {
    id: 'diplomacy',
    label: 'Diplomatie',
    description: 'Traités, relations et actions diplomatiques.',
    dependencies: [],
    incompatibleWith: [],
  },
  {
    id: 'productionChains',
    label: 'Chaînes de production',
    description: 'Bâtiments avancés et marché dynamique.',
    dependencies: ['technologies'],
    incompatibleWith: [],
  },
  {
    id: 'worldCouncil',
    label: 'Conseil mondial',
    description: 'Votes internationaux à effet global.',
    dependencies: ['diplomacy'],
    incompatibleWith: [],
  },
  {
    id: 'barbarians',
    label: 'Barbares',
    description: 'Raids et menaces extérieures.',
    dependencies: ['armies'],
    incompatibleWith: [],
  },
  {
    id: 'fogOfWar',
    label: 'Brouillard de guerre',
    description: 'Vision limitée sur la carte.',
    dependencies: [],
    incompatibleWith: [],
  },
];

export interface ModuleValidationIssue {
  code: 'missing_dependency' | 'incompatible_modules';
  message: string;
  modules: (keyof GameModules)[];
}

export function validateModules(modules: GameModules): ModuleValidationIssue[] {
  const issues: ModuleValidationIssue[] = [];
  for (const def of MODULE_REGISTRY) {
    if (!modules[def.id]) continue;
    for (const dep of def.dependencies) {
      if (!modules[dep]) {
        issues.push({
          code: 'missing_dependency',
          message: `Module "${def.id}" requires "${dep}".`,
          modules: [def.id, dep],
        });
      }
    }
    for (const bad of def.incompatibleWith) {
      if (modules[bad]) {
        issues.push({
          code: 'incompatible_modules',
          message: `Module "${def.id}" is incompatible with "${bad}".`,
          modules: [def.id, bad],
        });
      }
    }
  }
  return issues;
}
