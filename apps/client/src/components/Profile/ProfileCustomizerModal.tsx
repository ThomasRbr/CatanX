import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { PlayerColor, PlayerProfile } from '@catanx/engine';
import { Button, Icon } from '../../ui';
import {
  ACCESSORIES,
  AURAS,
  BANNERS,
  CARD_MATERIALS,
  DICE_STYLES,
  EMBLEMS,
  EXPRESSIONS,
  FRAMES,
  HAIR_COLORS,
  OUTFITS,
  PIECE_COLORS,
  PIECE_FINISHES,
  PORTRAITS,
  PROFILE_TAGLINES,
  SKIN_TONES,
  TITLES,
  createDefaultProfile,
  normalizeProfile,
  type ResolvedPlayerProfile,
} from '../../profile/profileCatalog';
import { PlayerProfileCard } from './PlayerProfileCard';
import { ProfileAvatar, ProfileEmblem } from './ProfileAvatar';
import styles from './ProfileCustomizerModal.module.css';

type CustomizerTab = 'identity' | 'portrait' | 'outfit' | 'signature' | 'tabletop';
interface ProfileCustomizerModalProps {
  open: boolean;
  playerIndex: number;
  playerName: string;
  profile: PlayerProfile;
  civilization?: string;
  usedPieceColors?: PlayerColor[];
  onSave: (profile: PlayerProfile) => void;
  onClose: () => void;
}

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}

export function ProfileCustomizerModal({
  open,
  playerIndex,
  playerName,
  profile,
  civilization,
  usedPieceColors = [],
  onSave,
  onClose,
}: ProfileCustomizerModalProps) {
  const [tab, setTab] = useState<CustomizerTab>('identity');
  const [draft, setDraft] = useState<ResolvedPlayerProfile>(() =>
    normalizeProfile(profile, playerIndex),
  );
  useEffect(() => {
    if (open) setDraft(normalizeProfile(profile, playerIndex));
  }, [open, playerIndex, profile]);

  const colorTaken = useMemo(
    () => new Set(usedPieceColors.filter((color) => color !== profile.pieceColor)),
    [profile.pieceColor, usedPieceColors],
  );
  if (!open) return null;

  const update = <K extends keyof ResolvedPlayerProfile>(key: K, value: ResolvedPlayerProfile[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const randomize = () => {
    const colors = PIECE_COLORS.filter((color) => !colorTaken.has(color.id));
    setDraft({
      portrait: pick(PORTRAITS).id,
      skinTone: pick(SKIN_TONES).id,
      hairColor: pick(HAIR_COLORS).id,
      expression: pick(EXPRESSIONS).id,
      outfit: pick(OUTFITS).id,
      accessory: pick(ACCESSORIES).id,
      emblem: pick(EMBLEMS).id,
      banner: pick(BANNERS).id,
      frame: pick(FRAMES).id,
      aura: pick(AURAS).id,
      cardMaterial: pick(CARD_MATERIALS).id,
      title: pick(TITLES).id,
      tagline: pick(PROFILE_TAGLINES),
      pieceColor: pick(colors.length ? colors : PIECE_COLORS).id,
      pieceFinish: pick(PIECE_FINISHES).id,
      diceStyle: pick(DICE_STYLES).id,
    });
  };
  const dice = DICE_STYLES.find((item) => item.id === draft.diceStyle) ?? DICE_STYLES[0]!;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-customizer-title"
      >
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>ATELIER D’IDENTITÉ · COLLECTION II</span>
            <h2 id="profile-customizer-title">Personnaliser {playerName}</h2>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.combinationCount}>Des milliards de combinaisons</span>
            <Button variant="ghost" size="sm" onClick={randomize}>
              <Icon name="more" size={15} /> Surprise
            </Button>
            <button
              type="button"
              className={styles.close}
              aria-label="Fermer la personnalisation"
              onClick={onClose}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        <div className={styles.workspace}>
          <aside className={styles.preview}>
            <span className={styles.previewLabel}>APERÇU EN TEMPS RÉEL</span>
            <PlayerProfileCard
              name={playerName || `Joueur ${playerIndex + 1}`}
              profile={draft}
              civilization={civilization}
              victoryPoints={7}
              handSize={5}
              devCardCount={2}
            />
            <div
              className={styles.tabletopPreview}
              style={
                {
                  '--preview-color': PIECE_COLORS.find((c) => c.id === draft.pieceColor)?.hex,
                  '--dice-face': dice.face,
                  '--dice-pip': dice.pip,
                } as CSSProperties
              }
              data-finish={draft.pieceFinish}
            >
              <div className={styles.piecePreview}>
                <span>
                  <i className={styles.roadPiece} />
                  Route
                </span>
                <span>
                  <i className={styles.settlementPiece} />
                  Village
                </span>
                <span>
                  <i className={styles.cityPiece} />
                  Ville
                </span>
              </div>
              <div className={styles.dicePreview} aria-label={`Dés ${dice.label}`}>
                <i>●</i>
                <i>
                  ●<b>●</b>
                  <em>●</em>
                </i>
                <span>{dice.label}</span>
              </div>
            </div>
          </aside>

          <main className={styles.editor}>
            <nav className={styles.tabs} aria-label="Sections de personnalisation">
              {(
                [
                  ['identity', 'Identité'],
                  ['portrait', 'Personnage'],
                  ['outfit', 'Tenue'],
                  ['signature', 'Signature'],
                  ['tabletop', 'Tabletop'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={tab === id ? styles.tabActive : styles.tab}
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {tab === 'identity' && (
              <div className={styles.section}>
                <div className={styles.sectionIntro}>
                  <span>01</span>
                  <div>
                    <strong>Votre légende</strong>
                    <small>Ce que les autres joueurs voient en premier.</small>
                  </div>
                </div>
                <label className={styles.field}>
                  Titre public
                  <select
                    aria-label="Titre public"
                    value={draft.title}
                    onChange={(event) =>
                      update('title', event.target.value as ResolvedPlayerProfile['title'])
                    }
                  >
                    {TITLES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Devise
                  <input
                    aria-label="Devise"
                    value={draft.tagline}
                    maxLength={64}
                    onChange={(event) => update('tagline', event.target.value)}
                    placeholder="Votre devise sur l’île…"
                  />
                  <small>{draft.tagline.length}/64 · visible sur votre carte joueur</small>
                </label>
                <fieldset className={styles.fieldset}>
                  <legend>Inspirations</legend>
                  <div className={styles.taglineGrid}>
                    {PROFILE_TAGLINES.slice(0, 8).map((tagline) => (
                      <button
                        key={tagline}
                        type="button"
                        className={
                          draft.tagline === tagline ? styles.taglineActive : styles.tagline
                        }
                        onClick={() => update('tagline', tagline)}
                      >
                        « {tagline} »
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {tab === 'portrait' && (
              <div className={styles.section}>
                <div className={styles.sectionIntro}>
                  <span>02</span>
                  <div>
                    <strong>Visage & personnalité</strong>
                    <small>Composez un personnage réellement unique.</small>
                  </div>
                </div>
                <fieldset className={styles.fieldset}>
                  <legend>Silhouette</legend>
                  <div className={styles.portraitGrid}>
                    {PORTRAITS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          draft.portrait === item.id ? styles.portraitActive : styles.portraitOption
                        }
                        aria-pressed={draft.portrait === item.id}
                        onClick={() => update('portrait', item.id)}
                      >
                        <ProfileAvatar
                          profile={{ ...draft, portrait: item.id, accessory: 'none', aura: 'none' }}
                          size={54}
                        />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.hint}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className={styles.twoColumns}>
                  <fieldset className={styles.fieldset}>
                    <legend>Carnation</legend>
                    <div className={styles.swatchGrid}>
                      {SKIN_TONES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={
                            draft.skinTone === item.id ? styles.swatchActive : styles.swatch
                          }
                          style={{ '--swatch': item.hex } as CSSProperties}
                          aria-label={item.label}
                          aria-pressed={draft.skinTone === item.id}
                          onClick={() => update('skinTone', item.id)}
                        >
                          <i />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className={styles.fieldset}>
                    <legend>Cheveux</legend>
                    <div className={styles.swatchGrid}>
                      {HAIR_COLORS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={
                            draft.hairColor === item.id ? styles.swatchActive : styles.swatch
                          }
                          style={{ '--swatch': item.hex } as CSSProperties}
                          aria-label={item.label}
                          aria-pressed={draft.hairColor === item.id}
                          onClick={() => update('hairColor', item.id)}
                        >
                          <i />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <fieldset className={styles.fieldset}>
                  <legend>Expression</legend>
                  <div className={styles.expressionGrid}>
                    {EXPRESSIONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          draft.expression === item.id ? styles.expressionActive : styles.expression
                        }
                        aria-pressed={draft.expression === item.id}
                        onClick={() => update('expression', item.id)}
                      >
                        <i>{item.glyph}</i>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {tab === 'outfit' && (
              <div className={styles.section}>
                <div className={styles.sectionIntro}>
                  <span>03</span>
                  <div>
                    <strong>Tenue de collection</strong>
                    <small>Une silhouette tabletop contemporaine et lisible.</small>
                  </div>
                </div>
                <fieldset className={styles.fieldset}>
                  <legend>Tenue</legend>
                  <div className={styles.outfitGrid}>
                    {OUTFITS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={draft.outfit === item.id ? styles.outfitActive : styles.outfit}
                        aria-pressed={draft.outfit === item.id}
                        onClick={() => update('outfit', item.id)}
                      >
                        <i data-outfit={item.id} />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.hint}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className={styles.fieldset}>
                  <legend>Accessoire signature</legend>
                  <div className={styles.accessoryGrid}>
                    {ACCESSORIES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={draft.accessory === item.id ? styles.chipActive : styles.chip}
                        aria-pressed={draft.accessory === item.id}
                        onClick={() => update('accessory', item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {tab === 'signature' && (
              <div className={styles.section}>
                <div className={styles.sectionIntro}>
                  <span>04</span>
                  <div>
                    <strong>Signature collector</strong>
                    <small>Emblème, décor, matière et lumière.</small>
                  </div>
                </div>
                <fieldset className={styles.fieldset}>
                  <legend>Emblème</legend>
                  <div className={styles.emblemGrid}>
                    {EMBLEMS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          draft.emblem === item.id ? styles.emblemActive : styles.emblemOption
                        }
                        aria-pressed={draft.emblem === item.id}
                        onClick={() => update('emblem', item.id)}
                      >
                        <ProfileEmblem id={item.id} size={23} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className={styles.fieldset}>
                  <legend>Bannière</legend>
                  <div className={styles.bannerGrid}>
                    {BANNERS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          draft.banner === item.id ? styles.bannerActive : styles.bannerOption
                        }
                        data-banner={item.id}
                        aria-pressed={draft.banner === item.id}
                        onClick={() => update('banner', item.id)}
                      >
                        <i />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className={styles.twoColumns}>
                  <fieldset className={styles.fieldset}>
                    <legend>Cadre</legend>
                    <div className={styles.chipGrid}>
                      {FRAMES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={draft.frame === item.id ? styles.chipActive : styles.chip}
                          aria-pressed={draft.frame === item.id}
                          onClick={() => update('frame', item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className={styles.fieldset}>
                    <legend>Aura</legend>
                    <div className={styles.chipGrid}>
                      {AURAS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={draft.aura === item.id ? styles.chipActive : styles.chip}
                          title={item.hint}
                          aria-pressed={draft.aura === item.id}
                          onClick={() => update('aura', item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <fieldset className={styles.fieldset}>
                  <legend>Matière de la carte</legend>
                  <div className={styles.materialGrid}>
                    {CARD_MATERIALS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        data-material={item.id}
                        className={
                          draft.cardMaterial === item.id ? styles.materialActive : styles.material
                        }
                        aria-pressed={draft.cardMaterial === item.id}
                        onClick={() => update('cardMaterial', item.id)}
                      >
                        <i />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {tab === 'tabletop' && (
              <div className={styles.section}>
                <div className={styles.sectionIntro}>
                  <span>05</span>
                  <div>
                    <strong>Votre collection sur la table</strong>
                    <small>Personnalisez les pions et les dés qui signent vos tours.</small>
                  </div>
                </div>
                <fieldset className={styles.fieldset}>
                  <legend>Couleur des pièces</legend>
                  <div className={styles.colorGrid}>
                    {PIECE_COLORS.map((color) => {
                      const taken = colorTaken.has(color.id);
                      return (
                        <button
                          key={color.id}
                          type="button"
                          className={
                            draft.pieceColor === color.id ? styles.colorActive : styles.color
                          }
                          style={{ '--swatch': color.hex } as CSSProperties}
                          disabled={taken}
                          title={taken ? `${color.label} déjà utilisée` : color.label}
                          aria-label={`${color.label}${taken ? ' — déjà utilisée' : ''}`}
                          aria-pressed={draft.pieceColor === color.id}
                          onClick={() => update('pieceColor', color.id)}
                        >
                          <i />
                          <span>{color.label}</span>
                          {taken && <small>PRISE</small>}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset className={styles.fieldset}>
                  <legend>Finition des pions</legend>
                  <div className={styles.finishGrid}>
                    {PIECE_FINISHES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        data-finish={item.id}
                        className={
                          draft.pieceFinish === item.id ? styles.finishActive : styles.finish
                        }
                        aria-pressed={draft.pieceFinish === item.id}
                        onClick={() => update('pieceFinish', item.id)}
                      >
                        <i
                          style={
                            {
                              '--swatch': PIECE_COLORS.find((c) => c.id === draft.pieceColor)?.hex,
                            } as CSSProperties
                          }
                        />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className={styles.fieldset}>
                  <legend>Collection de dés</legend>
                  <div className={styles.diceGrid}>
                    {DICE_STYLES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          draft.diceStyle === item.id ? styles.diceActive : styles.diceOption
                        }
                        style={
                          { '--dice-face': item.face, '--dice-pip': item.pip } as CSSProperties
                        }
                        aria-pressed={draft.diceStyle === item.id}
                        onClick={() => update('diceStyle', item.id)}
                      >
                        <i>
                          <b />
                          <b />
                          <b />
                        </i>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}
          </main>
        </div>

        <footer className={styles.footer}>
          <Button variant="ghost" onClick={() => setDraft(createDefaultProfile(playerIndex))}>
            Réinitialiser
          </Button>
          <div>
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => onSave({ ...draft, tagline: draft.tagline.trim() })}
            >
              Enregistrer le profil
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
