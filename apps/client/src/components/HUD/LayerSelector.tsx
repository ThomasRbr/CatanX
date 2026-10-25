import type { ReactNode } from 'react';
import type { BoardLayer } from '../Map/boardLayer';
import styles from './LayerSelector.module.css';

export type { BoardLayer } from '../Map/boardLayer';

interface LayerSelectorProps {
  layer: BoardLayer;
  onChange: (layer: BoardLayer) => void;
}

const LAYERS: Array<{
  id: BoardLayer;
  label: string;
  shortcut: string;
  glyph: ReactNode;
}> = [
  {
    id: 'sky',
    label: 'Ciel',
    shortcut: '1',
    glyph: (
      <svg className={styles.glyph} viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M3.2 10.2c0-2.1 1.6-3.8 3.6-3.8.4 0 .8.1 1.2.2A3.1 3.1 0 0 1 13 9.1c1.4.2 2.5 1.4 2.5 2.9H1.5c0-1.1.8-2 1.7-1.8Z"
          opacity="0.95"
        />
        <circle cx="5.2" cy="5.4" r="1.1" fill="currentColor" opacity="0.55" />
      </svg>
    ),
  },
  {
    id: 'surface',
    label: 'Surface',
    shortcut: '2',
    glyph: (
      <svg className={styles.glyph} viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M2 11.5 5.2 6.8l2.1 2.4L10.1 5l3.9 6.5H2Z"
          opacity="0.95"
        />
        <path fill="currentColor" d="M1.5 12.4h13v1.3H1.5z" opacity="0.45" />
      </svg>
    ),
  },
  {
    id: 'underground',
    label: 'Souterrain',
    shortcut: '3',
    glyph: (
      <svg className={styles.glyph} viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M3 4.2h10v1.2H3zm1.2 2.4h8.6v6.2c0 .5-.4.9-.9.9H5.1c-.5 0-.9-.4-.9-.9V6.6Z"
          opacity="0.9"
        />
        <path fill="currentColor" d="M7.2 8.2h1.6v3.2H7.2z" opacity="0.55" />
      </svg>
    ),
  },
];

export function LayerSelector({ layer, onChange }: LayerSelectorProps) {
  return (
    <div
      className={styles.selector}
      role="group"
      aria-label="Couche du plateau"
      data-hud-zone="extensions"
      data-extension="underground-sky-layer"
    >
      {LAYERS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.option}
          aria-pressed={layer === item.id}
          aria-label={item.label}
          title={item.label}
          data-layer={item.id}
          data-shortcut={item.shortcut}
          onClick={() => onChange(item.id)}
        >
          {item.glyph}
          <span className={styles.shortcut} aria-hidden="true">{item.shortcut}</span>
          <span className={styles.tooltip} role="tooltip">
            <strong>{item.label}</strong>
            <small>Touche {item.shortcut}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
