import { useMemo, useRef, useState } from 'react';
import {
  GameSaveMeta,
  MANUAL_SAVE_SLOTS,
  ManualSaveSlot,
} from '../../store/gameStore';
import { Button, Card, Panel } from '../../ui';
import { saveThumbnailSvg } from './saveThumbnail';
import styles from './LoadGame.module.css';

interface LoadGameProps {
  saves: GameSaveMeta[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onExport: (id: string) => void;
  onImport: (raw: string, slot?: ManualSaveSlot) => void;
  onBack: () => void;
}

function slotLabel(slot: GameSaveMeta['slot']): string {
  return slot === 'auto' ? 'Autosave' : `Slot ${slot}`;
}

export function LoadGame({
  saves,
  onLoad,
  onDelete,
  onRename,
  onExport,
  onImport,
  onBack,
}: LoadGameProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importSlot, setImportSlot] = useState<ManualSaveSlot>(1);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const bySlot = useMemo(() => {
    const map = new Map<string, GameSaveMeta>();
    for (const save of saves) {
      map.set(String(save.slot), save);
    }
    return map;
  }, [saves]);

  const ordered: Array<{ slotKey: string; slot: GameSaveMeta['slot']; save?: GameSaveMeta }> = [
    { slotKey: 'auto', slot: 'auto', save: bySlot.get('auto') },
    ...MANUAL_SAVE_SLOTS.map((slot) => ({
      slotKey: String(slot),
      slot,
      save: bySlot.get(String(slot)),
    })),
  ];

  const thumbnails = useMemo(() => {
    const map = new Map<string, string>();
    for (const save of saves) {
      map.set(save.id, saveThumbnailSvg(save.mapSeed, 96));
    }
    return map;
  }, [saves]);

  return (
    <section
      id="catanx-main-content"
      className={styles.root}
      aria-label="Charger une partie"
    >
      <Panel variant="lacquer" className={styles.shell}>
        <h2 className={styles.title}>Sauvegardes</h2>
        <p className={styles.intro}>
          8 slots + autosave. Importez un fichier JSON ou chargez un slot.
        </p>

        <div className={styles.importBar}>
          <label className={styles.importLabel}>
            Slot import
            <select
              value={importSlot}
              onChange={(event) => setImportSlot(Number(event.target.value) as ManualSaveSlot)}
            >
              {MANUAL_SAVE_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            Importer JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              const occupied = bySlot.get(String(importSlot));
              if (occupied) {
                const ok = window.confirm(
                  `Le slot ${importSlot} (« ${occupied.name} ») sera écrasé. Continuer ?`,
                );
                if (!ok) return;
              }
              const text = await file.text();
              onImport(text, importSlot);
            }}
          />
        </div>

        <div className={styles.list}>
          {ordered.map(({ slotKey, slot, save }) => {
            if (!save) {
              return (
                <Card key={slotKey}>
                  <div className={styles.saveCard}>
                    <div className={styles.emptyThumb}>{slotLabel(slot)}</div>
                    <div>
                      <div className={styles.metaName}>Vide</div>
                      <div className={styles.metaLine}>Aucun fichier dans ce slot</div>
                    </div>
                  </div>
                </Card>
              );
            }

            const svg = thumbnails.get(save.id) ?? saveThumbnailSvg(save.mapSeed, 96);
            const isRenaming = renamingId === save.id;
            return (
              <Card key={save.id}>
                <div className={styles.saveCard}>
                  <figure className={styles.thumb}>
                    <img
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
                      alt=""
                      width={72}
                      height={72}
                    />
                  </figure>
                  <div>
                    <div className={styles.slotBadge}>{slotLabel(save.slot)}</div>
                    {isRenaming ? (
                      <input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            onRename(save.id, renameValue);
                            setRenamingId(null);
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <div className={styles.metaName}>{save.name}</div>
                    )}
                    <div className={styles.metaLine}>
                      Tour {save.turn} — {new Date(save.updatedAt).toLocaleString('fr-FR')} —{' '}
                      {save.playerCount} joueur{save.playerCount > 1 ? 's' : ''}
                      {save.mode ? ` — ${save.mode}` : ''}
                      {save.phase ? ` — ${save.phase}` : ''}
                      {typeof save.schemaVersion === 'number'
                        ? ` — schéma ${save.schemaVersion}`
                        : ''}
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <Button variant="primary" size="sm" onClick={() => onLoad(save.id)}>
                      Charger
                    </Button>
                    {isRenaming ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          onRename(save.id, renameValue);
                          setRenamingId(null);
                        }}
                      >
                        OK
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRenamingId(save.id);
                          setRenameValue(save.name);
                        }}
                      >
                        Renommer
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => onExport(save.id)}>
                      Exporter
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Supprimer « ${save.name} » (${slotLabel(save.slot)}) ?`,
                          )
                        ) {
                          onDelete(save.id);
                        }
                      }}
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className={styles.footer}>
          <Button variant="ghost" onClick={onBack}>
            Retour
          </Button>
          <span className={styles.footerHint}>Export JSON pour sauvegarde hors ligne</span>
        </div>
      </Panel>
    </section>
  );
}
