import { Button } from '../../ui';
import styles from './MainMenu.module.css';

interface MainMenuProps {
  canContinue: boolean;
  onNewGame: () => void;
  onContinue: () => void;
  onLoadGame: () => void;
  onMultiplayer: () => void;
  onOptions: () => void;
  onHelp: () => void;
}

export function MainMenu({
  canContinue,
  onNewGame,
  onContinue,
  onLoadGame,
  onMultiplayer,
  onOptions,
  onHelp,
}: MainMenuProps) {
  return (
    <section id="catanx-main-content" className={styles.root} aria-label="Menu principal CatanX">
      <div className={styles.backdrop} />
      <div className={styles.layout}>
        <div className={styles.navColumn}>
          <span className={styles.kicker}>STRATÉGIE · ÎLES · ALLIANCES</span>
          <img
            src="/brand/logo-horizontal.svg"
            alt="CatanX"
            className={styles.logo}
            width={330}
            height={76}
          />
          <p className={styles.tagline}>Bâtissez une île qui ne ressemble qu’à vous.</p>
          <nav className={styles.nav} aria-label="Navigation principale">
            <Button variant="primary" size="lg" fullWidth onClick={onNewGame}>
              Nouvelle partie
            </Button>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={onContinue}
              disabled={!canContinue}
            >
              Continuer
            </Button>
            <Button variant="secondary" size="lg" fullWidth onClick={onLoadGame}>
              Charger une partie
            </Button>
            <Button variant="secondary" size="lg" fullWidth onClick={onMultiplayer}>
              Multijoueur
            </Button>
            <div className={styles.secondaryRow}>
              <Button variant="ghost" onClick={onHelp}>
                Guide
              </Button>
              <Button variant="ghost" onClick={onOptions}>
                Paramètres
              </Button>
            </div>
          </nav>
          {canContinue && <p className={styles.hint}>Une sauvegarde locale est disponible.</p>}
        </div>
        <div className={styles.stageHint} aria-hidden>
          <span>EXPLOREZ</span>
          <i />
          <span>CONSTRUISEZ</span>
          <i />
          <span>DOMINEZ</span>
        </div>
      </div>
    </section>
  );
}
