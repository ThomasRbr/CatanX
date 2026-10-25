import { useEffect } from 'react';
import { useSettingsStore, type MapRenderer } from '../../store/settingsStore';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    musicVolume,
    sfxVolume,
    cameraSensitivity,
    showGrid,
    showAnimations,
    animationSpeed,
    guidedTurnUI,
    showAdvancedPanels,
    reducedMotion,
    highContrast,
    aiTurnSpeed,
    showFpsMeter,
    mapRenderer,
    graphicsBackend,
    visualQuality,
    uiScale,
    setMusicVolume,
    setSfxVolume,
    setCameraSensitivity,
    setShowGrid,
    setShowAnimations,
    setAnimationSpeed,
    setGuidedTurnUI,
    setShowAdvancedPanels,
    setReducedMotion,
    setHighContrast,
    setAiTurnSpeed,
    setShowFpsMeter,
    setMapRenderer,
    setGraphicsBackend,
    setVisualQuality,
    setUiScale,
  } = useSettingsStore();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="settings-modal-title" style={{ marginTop: 0 }}>
          Paramètres
        </h2>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Audio</legend>

          <label style={{ display: 'block', marginTop: 8 }}>
            Musique : {Math.round(musicVolume * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={musicVolume}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
            />
          </label>

          <label style={{ display: 'block', marginTop: 8 }}>
            Effets sonores : {Math.round(sfxVolume * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={sfxVolume}
              onChange={(e) => setSfxVolume(Number(e.target.value))}
            />
          </label>
        </fieldset>

        <fieldset style={{ border: 'none', padding: 0, margin: '12px 0 0' }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Interface</legend>

          <label style={{ display: 'block', marginTop: 8 }}>
            Sensibilité caméra : {cameraSensitivity.toFixed(2)}
            <input
              type="range"
              min={0.4}
              max={2}
              step={0.05}
              value={cameraSensitivity}
              onChange={(e) => setCameraSensitivity(Number(e.target.value))}
            />
          </label>

          <label style={{ display: 'block', marginTop: 10 }}>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />{' '}
            Afficher la grille
          </label>

          <label style={{ display: 'block', marginTop: 6 }}>
            <input
              type="checkbox"
              checked={showAnimations}
              onChange={(e) => setShowAnimations(e.target.checked)}
            />{' '}
            Afficher les animations
          </label>

          <label style={{ display: 'block', marginTop: 8 }}>
            Vitesse des animations
            <select
              value={animationSpeed}
              disabled={!showAnimations}
              onChange={(e) => setAnimationSpeed(Number(e.target.value) as 0.5 | 1 | 1.5 | 2)}
              style={{ display: 'block', marginTop: 4, width: '100%' }}
            >
              <option value={0.5}>Lente (0.5×)</option>
              <option value={1}>Normale (1×)</option>
              <option value={1.5}>Rapide (1.5×)</option>
              <option value={2}>Très rapide (2×)</option>
            </select>
          </label>

          <label style={{ display: 'block', marginTop: 6 }}>
            <input
              type="checkbox"
              checked={guidedTurnUI}
              onChange={(e) => setGuidedTurnUI(e.target.checked)}
            />{' '}
            Interface de tour simplifiée
          </label>

          <label style={{ display: 'block', marginTop: 6 }}>
            <input
              type="checkbox"
              checked={showAdvancedPanels}
              onChange={(e) => setShowAdvancedPanels(e.target.checked)}
              disabled={!guidedTurnUI}
            />{' '}
            Afficher les panneaux avancés (techno, diplomatie, journal)
          </label>
        </fieldset>

        <fieldset style={{ border: 'none', padding: 0, margin: '12px 0 0' }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Accessibilité</legend>

          <label style={{ display: 'block', marginTop: 6 }}>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />{' '}
            Réduire les animations (en plus du réglage système)
          </label>

          <label style={{ display: 'block', marginTop: 6 }}>
            <input
              type="checkbox"
              checked={highContrast}
              onChange={(e) => setHighContrast(e.target.checked)}
            />{' '}
            Contraste élevé
          </label>

          <label style={{ display: 'block', marginTop: 8 }} htmlFor="visual-quality-select">
            Qualité visuelle
            <select
              id="visual-quality-select"
              value={visualQuality}
              onChange={(e) => setVisualQuality(e.target.value as typeof visualQuality)}
              style={{ display: 'block', marginTop: 4, width: '100%' }}
            >
              <option value="auto">Automatique · recommandée</option>
              <option value="low">Faible · diorama allégé</option>
              <option value="balanced">Équilibrée · 60 FPS</option>
              <option value="high">Élevée · détails renforcés</option>
              <option value="ultra">Ultra · cinématique</option>
            </select>
          </label>
          <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.75 }}>
            Tous les profils conservent le diorama réaliste. Seuls les effets et la densité
            changent, jamais la lisibilité des pièces.
          </p>

          <label style={{ display: 'block', marginTop: 8 }}>
            Échelle de l’interface : {Math.round(uiScale * 100)}%
            <input
              type="range"
              min={0.85}
              max={1.25}
              step={0.05}
              value={uiScale}
              onChange={(e) => setUiScale(Number(e.target.value))}
            />
          </label>

          <label style={{ display: 'block', marginTop: 6 }}>
            <input
              type="checkbox"
              checked={showFpsMeter}
              onChange={(e) => setShowFpsMeter(e.target.checked)}
            />{' '}
            Afficher le compteur FPS
          </label>

          <button
            type="button"
            className="command-button secondary"
            style={{ marginTop: 8 }}
            hidden
          >
            Réinitialiser le tutoriel
          </button>
        </fieldset>

        <label style={{ display: 'block', marginTop: 12 }}>
          Vitesse des tours IA
          <select
            value={aiTurnSpeed}
            onChange={(e) => setAiTurnSpeed(e.target.value as typeof aiTurnSpeed)}
          >
            <option value="slow">Posée · actions très lisibles</option>
            <option value="normal">Tabletop · recommandée</option>
            <option value="fast">Rapide · transitions courtes</option>
          </select>
        </label>

        <fieldset style={{ border: 'none', padding: 0, margin: '12px 0 0' }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Développeur</legend>
          <label style={{ display: 'block', marginTop: 6 }} htmlFor="map-renderer-select">
            Rendu de la carte
            <select
              id="map-renderer-select"
              value={mapRenderer}
              onChange={(e) => setMapRenderer(e.target.value as MapRenderer)}
              style={{ display: 'block', marginTop: 4 }}
            >
              <option value="diorama">Diorama réaliste (défaut)</option>
              <option value="threeLegacy">Three.js Legacy (secours)</option>
              <option value="pixi">PixiJS (historique)</option>
            </select>
          </label>
          <label style={{ display: 'block', marginTop: 10 }} htmlFor="graphics-backend-select">
            Backend graphique
            <select
              id="graphics-backend-select"
              value={graphicsBackend}
              onChange={(event) => setGraphicsBackend(event.target.value as typeof graphicsBackend)}
              style={{ display: 'block', marginTop: 4 }}
            >
              <option value="auto">Automatique (recommandé)</option>
              <option value="webgl2">WebGL 2 · stable</option>
              <option value="webgpu">WebGPU · laboratoire de parité</option>
            </select>
          </label>
          <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.75 }}>
            Le Diorama utilise WebGL 2 en production. WebGPU prépare les profils High/Ultra,
            mais reste désactivé jusqu’à la parité du picking, des ombres et des captures. En cas
            d’échec : Diorama → Three Legacy → Pixi, sans dégrader durablement ce réglage.
          </p>
        </fieldset>

        <button type="button" style={{ marginTop: 14 }} onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}
