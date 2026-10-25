import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'neutral' | 'gold' | 'season' | 'danger' | 'success';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  children: ReactNode;
};

const variantClass: Record<BadgeVariant, string> = {
  neutral: styles.neutral,
  gold: styles.gold,
  season: styles.season,
  danger: styles.danger,
  success: styles.success,
};

export function Badge({ variant = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={[styles.badge, variantClass[variant], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  );
}
