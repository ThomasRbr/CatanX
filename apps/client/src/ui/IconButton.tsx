import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './icons/Icon';
import type { CatanXIconName } from './icons/names';
import styles from './IconButton.module.css';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: CatanXIconName;
  'aria-label': string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'lacquer' | 'gold' | 'ghost';
};

const sizeClass = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
} as const;

const variantClass = {
  lacquer: styles.lacquer,
  gold: styles.gold,
  ghost: styles.ghost,
} as const;

const iconSize = {
  sm: 16,
  md: 18,
  lg: 22,
} as const;

export function IconButton({
  icon,
  size = 'md',
  variant = 'lacquer',
  className,
  type = 'button',
  'aria-label': ariaLabel,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      className={[styles.iconButton, sizeClass[size], variantClass[variant], className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <Icon name={icon} size={iconSize[size]} aria-hidden />
    </button>
  );
}
