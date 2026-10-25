import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Panel.module.css';

export type PanelVariant = 'glass' | 'paper' | 'dock' | 'lacquer' | 'ivory';

export type PanelProps = HTMLAttributes<HTMLDivElement> & {
  variant?: PanelVariant;
  children: ReactNode;
};

const variantClass: Record<PanelVariant, string> = {
  glass: styles.glass,
  paper: styles.paper,
  lacquer: styles.glass,
  ivory: styles.paper,
  dock: styles.dock,
};

export function Panel({ variant = 'glass', className, children, ...rest }: PanelProps) {
  return (
    <div className={[styles.panel, variantClass[variant], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
