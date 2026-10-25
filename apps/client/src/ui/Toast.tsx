import type { HTMLAttributes, ReactNode } from 'react';
import { Icon } from './icons/Icon';
import type { CatanXIconName } from './icons/names';
import styles from './Toast.module.css';

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export type ToastProps = HTMLAttributes<HTMLDivElement> & {
  message: ReactNode;
  variant?: ToastVariant;
};

const variantClass: Record<ToastVariant, string> = {
  info: styles.info,
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
};

const variantIcon: Record<ToastVariant, CatanXIconName> = {
  info: 'help',
  success: 'check',
  warning: 'warning',
  danger: 'close',
};

export function Toast({ message, variant = 'info', className, ...rest }: ToastProps) {
  return (
    <div
      className={[styles.toast, variantClass[variant], className].filter(Boolean).join(' ')}
      role="status"
      {...rest}
    >
      <Icon name={variantIcon[variant]} size={16} aria-hidden className={styles.icon} />
      <span className={styles.message}>{message}</span>
    </div>
  );
}
