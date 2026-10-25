import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  children: ReactNode;
};

export function Card({ title, className, children, ...rest }: CardProps) {
  return (
    <article className={[styles.card, className].filter(Boolean).join(' ')} {...rest}>
      {title ? <h3 className={styles.title}>{title}</h3> : null}
      <div className={styles.body}>{children}</div>
    </article>
  );
}
