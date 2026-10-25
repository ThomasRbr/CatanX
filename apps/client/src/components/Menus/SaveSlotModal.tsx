import { useEffect, useMemo, useState } from 'react';
import type { ManualSaveSlot, SaveSlotId } from '../../store/saveSlots';
import { MANUAL_SAVE_SLOTS } from '../../store/saveSlots';
import { Button, Panel } from '../../ui';

interface SaveSlotModalProps {
  currentTurn: number;
  occupiedSlots: Partial<Record<string, string>>;
  onSave: (slot: SaveSlotId, name: string) => boolean;
  onClose: () => void;
}

export function SaveSlotModal({
  currentTurn,
  occupiedSlots,
  onSave,
  onClose,
}: SaveSlotModalProps) {
  const [slot, setSlot] = useState<ManualSaveSlot>(1);
  const [name, setName] = useState(`Partie T${currentTurn}`);

  const slots = useMemo(() => MANUAL_SAVE_SLOTS, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sauvegarder la partie"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(8, 14, 24, 0.55)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <Panel
        variant="lacquer"
        style={{ width: 'min(420px, 94vw)', padding: 16 }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)', color: 'var(--ivory)' }}>
          Sauvegarder
        </h3>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          Nom
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Slot</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {slots.map((entry) => {
              const occupied = occupiedSlots[String(entry)];
              return (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setSlot(entry)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: 8,
                    border:
                      slot === entry
                        ? '2px solid var(--accent, #c4a35a)'
                        : '1px solid rgba(255,255,255,0.2)',
                    background: occupied ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.2)',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {entry}
                  {occupied ? ' · occ.' : ''}
                </button>
              );
            })}
          </div>
          {occupiedSlots[String(slot)] && (
            <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
              Remplacera : {occupiedSlots[String(slot)]}
            </p>
          )}
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (onSave(slot, name)) onClose();
            }}
          >
            Sauver
          </Button>
        </div>
      </Panel>
    </div>
  );
}
