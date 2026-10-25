import { useMemo, useState } from 'react';
import { Player } from '@catanx/engine';
import { TechId } from '@catanx/engine';
import { TECH_DEFINITIONS, TechTreeEngine } from '@catanx/engine';
import { frAge, frGenericLabel } from '../../i18n/fr';

interface TechTreeModalProps {
  player: Player;
  onResearch: (techId: TechId) => void;
  onClose: () => void;
}

const AGE_COLUMNS = ['stone_age', 'bronze_age', 'iron_age', 'medieval', 'renaissance'] as const;

type TechFilter = 'all' | 'military' | 'economic' | 'science' | 'culture';

function inferTechFilter(techId: string): TechFilter {
  const lower = techId.toLowerCase();
  if (
    lower.includes('archery') ||
    lower.includes('military') ||
    lower.includes('siege') ||
    lower.includes('gunpowder') ||
    lower.includes('ballistics') ||
    lower.includes('rifling') ||
    lower.includes('chivalry') ||
    lower.includes('tactics')
  ) {
    return 'military';
  }
  if (
    lower.includes('trade') ||
    lower.includes('currency') ||
    lower.includes('bank') ||
    lower.includes('economics') ||
    lower.includes('mercantilism')
  ) {
    return 'economic';
  }
  if (
    lower.includes('writing') ||
    lower.includes('education') ||
    lower.includes('scientific') ||
    lower.includes('physics') ||
    lower.includes('chemistry') ||
    lower.includes('rationalism')
  ) {
    return 'science';
  }
  if (
    lower.includes('drama') ||
    lower.includes('poetry') ||
    lower.includes('printing') ||
    lower.includes('humanism') ||
    lower.includes('theology') ||
    lower.includes('acoustics')
  ) {
    return 'culture';
  }
  return 'all';
}

function statusColors(
  researched: boolean,
  current: boolean,
  available: boolean,
): {
  background: string;
  border: string;
  text: string;
} {
  if (researched) {
    return {
      background: 'linear-gradient(180deg, rgba(121, 193, 143, 0.92), rgba(70, 144, 97, 0.92))',
      border: 'rgba(25, 89, 46, 0.48)',
      text: '#0c321c',
    };
  }
  if (current) {
    return {
      background: 'linear-gradient(180deg, rgba(63, 107, 177, 0.95), rgba(29, 78, 152, 0.95))',
      border: 'rgba(19, 45, 95, 0.58)',
      text: '#eef6ff',
    };
  }
  if (available) {
    return {
      background: 'linear-gradient(180deg, rgba(180, 213, 245, 0.96), rgba(131, 178, 227, 0.94))',
      border: 'rgba(58, 104, 156, 0.48)',
      text: '#102d4b',
    };
  }
  return {
    background: 'linear-gradient(180deg, rgba(223, 224, 227, 0.94), rgba(192, 197, 205, 0.9))',
    border: 'rgba(94, 104, 118, 0.44)',
    text: '#3f4753',
  };
}

export function TechTreeModal({ player, onResearch, onClose }: TechTreeModalProps) {
  const [filter, setFilter] = useState<TechFilter>('all');
  const known = useMemo(() => new Set(player.researchedTechs), [player.researchedTechs]);
  const current = player.currentResearch;
  const currentTech = current ? TECH_DEFINITIONS[current as TechId] : null;
  const currentProgressRatio = currentTech
    ? Math.max(0, Math.min(1, player.researchProgress / Math.max(1, currentTech.cost)))
    : 0;

  const byAge = useMemo(() => {
    return AGE_COLUMNS.map((age) => {
      const items = Object.values(TECH_DEFINITIONS)
        .filter((tech) => tech.age === age)
        .filter(
          (tech) =>
            filter === 'all' ||
            inferTechFilter(tech.id) === filter ||
            inferTechFilter(tech.id) === 'all',
        )
        .sort((a, b) => a.era - b.era);
      return { age, items };
    });
  }, [filter]);

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ width: 'min(1260px, 95vw)' }}>
        <h2 style={{ marginTop: 0 }}>Codex des technologies</h2>
        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.84 }}>
          Age actuel : <strong>{frAge(player.age)}</strong>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter('all')} className="command-button secondary">
            Toutes
          </button>
          <button onClick={() => setFilter('military')} className="command-button secondary">
            Militaire
          </button>
          <button onClick={() => setFilter('economic')} className="command-button secondary">
            Economie
          </button>
          <button onClick={() => setFilter('science')} className="command-button secondary">
            Science
          </button>
          <button onClick={() => setFilter('culture')} className="command-button secondary">
            Culture/Foi
          </button>
        </div>

        {currentTech && (
          <div className="ui-panel" style={{ marginTop: 10, padding: 10 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div>
                <strong>Recherche en cours:</strong> {currentTech.name}
              </div>
              <div style={{ fontSize: 12, opacity: 0.84 }}>
                {Math.floor(player.researchProgress)} / {currentTech.cost}
              </div>
            </div>
            <div
              style={{
                marginTop: 7,
                height: 9,
                borderRadius: 999,
                overflow: 'hidden',
                background: 'rgba(28, 53, 91, 0.22)',
              }}
            >
              <div
                style={{
                  width: `${Math.round(currentProgressRatio * 100)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #60a5fa, #1d4ed8)',
                }}
              />
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(215px, 1fr))',
            gap: 12,
          }}
        >
          {byAge.map(({ age, items }) => (
            <div key={age} className="ui-panel" style={{ padding: 10 }}>
              <div style={{ fontWeight: 800 }}>{frAge(age)}</div>
              <div
                style={{
                  marginTop: 8,
                  display: 'grid',
                  gap: 8,
                  maxHeight: '58vh',
                  overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
                {items.map((tech) => {
                  const researched = known.has(tech.id);
                  const canResearch = TechTreeEngine.canResearch(tech.id, player);
                  const available = canResearch.canResearch;
                  const isCurrent = current === tech.id;
                  const colors = statusColors(researched, isCurrent, available);

                  return (
                    <button
                      key={tech.id}
                      style={{
                        background: colors.background,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                        textAlign: 'left',
                        padding: '9px 10px',
                        cursor: researched ? 'default' : 'pointer',
                      }}
                      onClick={() => onResearch(tech.id as TechId)}
                      disabled={researched || !available}
                      title={`${tech.description}\n\n"${tech.quote}"`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: 12 }}>{tech.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>{tech.cost}</div>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>
                        {tech.description}
                      </div>
                      <div style={{ marginTop: 5, fontSize: 11.5, opacity: 0.86 }}>
                        Prerequis:{' '}
                        {tech.prerequisites.length > 0
                          ? tech.prerequisites.map((item) => frGenericLabel(item)).join(' -> ')
                          : 'Aucun'}
                      </div>
                      {isCurrent && (
                        <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 700 }}>
                          Recherche active
                        </div>
                      )}
                      {!researched && !available && canResearch.reason && (
                        <div style={{ marginTop: 4, fontSize: 11.5, opacity: 0.82 }}>
                          Verrouille: {canResearch.reason}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Vert = recherchee, Bleu fonce = en cours, Bleu clair = disponible, Gris = verrouillee
          </div>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
