import type { CSSProperties } from 'react';
import type { CatanXIconName } from './names';
import { getIconNode } from './registry';
import styles from './Icon.module.css';

export type IconProps = {
  name: CatanXIconName;
  size?: number | string;
  title?: string;
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
};

export function Icon({
  name,
  size = 20,
  title,
  className,
  'aria-hidden': ariaHidden,
}: IconProps) {
  const dimension = typeof size === 'number' ? `${size}px` : size;
  const labelled = Boolean(title);
  const hidden = ariaHidden ?? (!labelled ? true : undefined);

  return (
    <svg
      className={[styles.icon, className].filter(Boolean).join(' ')}
      width={dimension}
      height={dimension}
      viewBox="0 0 24 24"
      role={labelled ? 'img' : undefined}
      aria-hidden={hidden}
      aria-label={labelled ? title : undefined}
      focusable="false"
      style={{ '--icon-size': dimension } as CSSProperties}
    >
      {labelled ? <title>{title}</title> : null}
      {getIconNode(name)}
    </svg>
  );
}

export type { CatanXIconName };
