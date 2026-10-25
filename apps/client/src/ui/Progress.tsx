import type { HTMLAttributes } from 'react';
import styles from './Progress.module.css';

export type ProgressProps = HTMLAttributes<HTMLDivElement> & {
  value: number;
  label?: string;
};

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function Progress({ value, label, className, ...rest }: ProgressProps) {
  const pct = clamp(value);

  return (
    <div className={[styles.progress, className].filter(Boolean).join(' ')} {...rest}>
      {label ? (
        <div className={styles.labelRow}>
          <span className={styles.label}>{label}</span>
          <span className={styles.value}>{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={label}
      >
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
