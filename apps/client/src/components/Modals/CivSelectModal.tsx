import { CivilizationType } from '@catanx/engine';
import { CIVILIZATIONS } from '@catanx/engine';

interface CivSelectModalProps {
  selected: CivilizationType | null;
  onSelect: (civ: CivilizationType) => void;
  onClose: () => void;
}

export function CivSelectModal({ selected, onSelect, onClose }: CivSelectModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ width: 'min(1180px, 95vw)' }}>
        <h2 style={{ marginTop: 0 }}>Choisir une civilisation</h2>
        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 10,
          }}
        >
          {Object.values(CIVILIZATIONS).map((civ) => (
            <div
              key={civ.id}
              className="ui-panel"
              style={{
                padding: 10,
                border:
                  selected === civ.id ? `2px solid ${civ.color}` : '1px solid rgba(16,42,67,0.2)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ fontWeight: 700 }}>{civ.name}</div>
                <span
                  style={{ width: 10, height: 10, borderRadius: '50%', background: civ.color }}
                />
              </div>
              <div style={{ marginTop: 6, fontSize: 12 }}>{civ.description}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{civ.lore}</div>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <strong>Unité unique :</strong> {civ.uniqueUnit.name}
              </div>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                <strong>Capacité spéciale :</strong> {civ.specialAbility.name}
              </div>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                <strong>Forces :</strong> {civ.strengths.join(', ')}
              </div>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                <strong>Faiblesses :</strong> {civ.weaknesses.join(', ')}
              </div>
              <button style={{ marginTop: 8 }} onClick={() => onSelect(civ.id)}>
                Choisir {civ.name}
              </button>
            </div>
          ))}
        </div>
        <button style={{ marginTop: 12 }} onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}
