import {
  lazy,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';

type AnyComponent = ComponentType<any>;

function lazyNamed<T extends AnyComponent>(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] as T };
  }) as LazyExoticComponent<T>;
}

export function LazyFallback({ label = 'Chargement…' }: { label?: string }): ReactNode {
  return (
    <div className="ui-panel" style={{ margin: '1.5rem auto', maxWidth: 420, textAlign: 'center' }}>
      <p style={{ margin: 0 }}>{label}</p>
    </div>
  );
}

export const LazyHexBoard = lazyNamed<typeof import('../components/Map/HexBoard').HexBoard>(
  () => import('../components/Map/HexBoard'),
  'HexBoard',
);

export const LazyMapBoard = lazyNamed<typeof import('../components/Map/MapBoard').MapBoard>(
  () => import('../components/Map/MapBoard'),
  'MapBoard',
);

export const LazyGameSetup = lazyNamed<typeof import('../components/Menus/GameSetup').GameSetup>(
  () => import('../components/Menus/GameSetup'),
  'GameSetup',
);

export const LazyMultiplayerLobby = lazyNamed<
  typeof import('../components/Menus/MultiplayerLobby').MultiplayerLobby
>(() => import('../components/Menus/MultiplayerLobby'), 'MultiplayerLobby');

export const LazyLoadGame = lazyNamed<typeof import('../components/Menus/LoadGame').LoadGame>(
  () => import('../components/Menus/LoadGame'),
  'LoadGame',
);

export const LazyDiplomacyModal = lazyNamed<
  typeof import('../components/Modals/DiplomacyModal').DiplomacyModal
>(() => import('../components/Modals/DiplomacyModal'), 'DiplomacyModal');

export const LazyTechTreeModal = lazyNamed<
  typeof import('../components/Modals/TechTreeModal').TechTreeModal
>(() => import('../components/Modals/TechTreeModal'), 'TechTreeModal');

export const LazyHelpGuideModal = lazyNamed<
  typeof import('../components/Modals/HelpGuideModal').HelpGuideModal
>(() => import('../components/Modals/HelpGuideModal'), 'HelpGuideModal');

export const LazyCraftPanel = lazyNamed<
  typeof import('../components/Panels/CraftPanel').CraftPanel
>(() => import('../components/Panels/CraftPanel'), 'CraftPanel');
