import { useEffect } from 'react';

interface HelpGuideModalProps {
  onClose: () => void;
}

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: 'But de la partie',
    body: 'En mode classique, gagnez en atteignant l’objectif de points de victoire (souvent 10). Villages, villes, route la plus longue et armée la plus grande rapportent des points.',
  },
  {
    title: 'Tour de jeu',
    body: '1) Lancez les dés. 2) Collectez les ressources. 3) Construisez, commercez ou jouez une carte de développement. 4) Terminez votre tour. Un 7 déclenche défausse puis déplacement du brigand.',
  },
  {
    title: 'Construction',
    body: 'Village : bois, argile, blé, mouton. Ville : 2 blé + 3 minerai (sur un village). Route : bois + argile. Carte développement : blé + mouton + minerai.',
  },
  {
    title: 'Commerce',
    body: 'Banque 4:1 par défaut, ports 3:1 ou 2:1 selon la ressource. En passe-et-joue, un écran de confidentialité protège la main du joueur suivant.',
  },
  {
    title: 'Modules CatanX',
    body: 'Activez saisons, technologies, armées, diplomatie, craft, conseil ou barbares dans la configuration. Chaque module a ses commandes et conditions de victoire filtrées.',
  },
  {
    title: 'Multijoueur privé',
    body: 'Lancez `npm run server`, ouvrez le lobby, créez un salon et partagez le code. Le serveur est autoritaire : reconnexion possible via jeton de siège.',
  },
  {
    title: 'Astuces',
    body: 'Activez le coach de tour et l’interface de tour simplifiée dans Paramètres. Réinitialisez le tutoriel si besoin. Affichez le compteur FPS pour diagnostiquer les perfs. Le plateau 3D (Three) est actif par défaut ; Paramètres → Développeur → Rendu de la carte permet de revenir à Pixi (historique).',
  },
];

export function HelpGuideModal({ onClose }: HelpGuideModalProps) {
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
        aria-labelledby="help-guide-title"
        style={{ maxWidth: 640, maxHeight: '86vh', overflow: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <h2 id="help-guide-title" style={{ margin: 0 }}>
            Guide du joueur
          </h2>
          <button type="button" onClick={onClose}>
            Fermer
          </button>
        </div>
        <p style={{ marginTop: 8, opacity: 0.82, fontSize: 13 }}>
          Référence rapide des règles essentielles. Le coach en partie complète ces rappels au fil
          des tours.
        </p>
        <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{section.title}</h3>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
