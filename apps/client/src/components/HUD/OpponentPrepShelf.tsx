import { useState } from 'react';
import type { ResourceBundle } from '@catanx/engine';
import styles from './OpponentPrepShelf.module.css';

interface OpponentPrepShelfProps {
  activePlayerName: string;
  resources: ResourceBundle;
  citiesKnights: boolean;
}

const RECIPES = [
  { label: 'Route', cost: { wood: 1, clay: 1 } },
  { label: 'Village', cost: { wood: 1, clay: 1, wheat: 1, sheep: 1 } },
  { label: 'Ville', cost: { wheat: 2, ore: 3 } },
] as const;

export function OpponentPrepShelf({
  activePlayerName,
  resources,
  citiesKnights,
}: OpponentPrepShelfProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside className={styles.shelf} aria-label="Préparation du prochain tour">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={`Préparer votre tour — ${activePlayerName} joue`}
      >
        <span>
          <small>{activePlayerName} joue</small>
          <strong>Préparer votre tour</strong>
        </span>
        <b>{expanded ? '−' : '+'}</b>
      </button>
      {expanded && (
        <div className={styles.recipes}>
          {RECIPES.map((recipe) => {
            const missing = Object.entries(recipe.cost).filter(
              ([resource, amount]) => (resources[resource as keyof ResourceBundle] ?? 0) < amount,
            ).length;
            return (
              <span key={recipe.label} data-ready={missing === 0 ? '1' : '0'}>
                <strong>{recipe.label}</strong>
                <small>
                  {missing === 0
                    ? 'Prêt'
                    : `${missing} ressource${missing > 1 ? 's' : ''} à trouver`}
                </small>
              </span>
            );
          })}
          {citiesKnights && (
            <p>Marchandises et cartes Progrès restent consultables dans votre main.</p>
          )}
        </div>
      )}
    </aside>
  );
}
