import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Tooltip.module.css';

export type TooltipProps = HTMLAttributes<HTMLSpanElement> & {
  title?: string;
  content: ReactNode;
  children: ReactNode;
};

export function Tooltip({ title, content, children, className, ...rest }: TooltipProps) {
  return (
    <span className={[styles.wrap, className].filter(Boolean).join(' ')} {...rest}>
      {children}
      <span className={styles.tip} role="tooltip">
        {title ? <span className={styles.title}>{title}</span> : null}
        <span className={styles.content}>{content}</span>
      </span>
    </span>
  );
}
