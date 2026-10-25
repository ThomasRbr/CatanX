import type { HTMLAttributes } from 'react';
import styles from './Tabs.module.css';

export type TabItem = {
  id: string;
  label: string;
};

export type TabsProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
};

export function Tabs({ items, value, onChange, className, ...rest }: TabsProps) {
  return (
    <div
      className={[styles.tabs, className].filter(Boolean).join(' ')}
      role="tablist"
      {...rest}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            id={`tab-${item.id}`}
            className={[styles.tab, selected ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
