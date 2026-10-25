import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GameEvent } from '@catanx/engine';
import { frResource, frScope, frSeverity } from '../../i18n/fr';

interface EventModalProps {
  event: GameEvent;
  error?: string | null;
  onChoice: (choiceId: string) => void;
  onDismiss: () => void;
}

function categoryBackground(category: string): string {
  if (category === 'natural_disaster') {
    return 'linear-gradient(140deg, rgba(146, 37, 32, 0.94), rgba(70, 24, 18, 0.92))';
  }
  if (category === 'discovery') {
    return 'linear-gradient(140deg, rgba(134, 93, 34, 0.94), rgba(68, 46, 18, 0.92))';
  }
  if (category === 'political') {
    return 'linear-gradient(140deg, rgba(64, 66, 108, 0.94), rgba(29, 32, 59, 0.92))';
  }
  if (category === 'economic') {
    return 'linear-gradient(140deg, rgba(67, 102, 62, 0.94), rgba(28, 55, 29, 0.92))';
  }
  if (category === 'military') {
    return 'linear-gradient(140deg, rgba(116, 46, 38, 0.94), rgba(56, 22, 20, 0.92))';
  }
  return 'linear-gradient(140deg, rgba(62, 69, 81, 0.94), rgba(28, 32, 40, 0.92))';
}

export function EventModal({ event, error, onChoice, onDismiss }: EventModalProps) {
  const [showChoices, setShowChoices] = useState(false);

  useEffect(() => {
    setShowChoices(false);
    const timeout = window.setTimeout(() => setShowChoices(true), 1500);
    return () => window.clearTimeout(timeout);
  }, [event.id]);

  const cardStyle = useMemo(
    () => ({
      width: 'min(880px, 92vw)',
      color: '#f8efe0',
      borderColor: 'rgba(255, 238, 204, 0.24)',
      background: categoryBackground(event.category),
    }),
    [event.category],
  );

  return (
    <div className="modal-backdrop">
      <motion.div
        className="modal-card"
        style={cardStyle}
        initial={{ opacity: 0, scale: 0.9, y: 36 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>{event.name}</h2>
        <p style={{ marginTop: 8, lineHeight: 1.45 }}>{event.description}</p>
        <blockquote style={{ marginLeft: 0, opacity: 0.86, fontStyle: 'italic' }}>
          {event.flavorText}
        </blockquote>

        <div
          style={{
            marginTop: 10,
            display: 'flex',
            gap: 8,
            fontSize: 12,
            opacity: 0.9,
            flexWrap: 'wrap',
          }}
        >
          <span>Gravité: {frSeverity(event.severity)}</span>
          <span>Portée: {frScope(event.scope)}</span>
          <span>Durée: {event.duration}</span>
          <span>Tour: {event.triggeredTurn}</span>
          {event.targetTiles && event.targetTiles.length > 0 && (
            <span>Tuiles touchées: {event.targetTiles.length}</span>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 10, color: '#fecaca', fontWeight: 700, fontSize: 13 }}>
            {error}
          </div>
        )}

        {!showChoices && event.choices?.length ? (
          <div style={{ marginTop: 12, fontSize: 13, opacity: 0.9 }}>
            Le conseil se rassemble...
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {showChoices &&
            event.choices?.map((choice, index) => (
              <motion.button
                key={choice.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.06 * index }}
                onClick={() => onChoice(choice.id)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: 'rgba(255, 247, 232, 0.94)',
                  color: '#2f2418',
                }}
              >
                <div style={{ fontWeight: 700 }}>{choice.label}</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>
                  {choice.description}
                </div>
                {choice.cost && (
                  <div style={{ fontSize: 12, opacity: 0.78, marginTop: 4 }}>
                    Coût:{' '}
                    {Object.entries(choice.cost)
                      .map(([key, value]) => `${frResource(key)} ${value}`)
                      .join(', ')}
                  </div>
                )}
              </motion.button>
            ))}
        </div>

        {!event.choices?.length && (
          <button style={{ marginTop: 14 }} onClick={onDismiss}>
            Continuer
          </button>
        )}
      </motion.div>
    </div>
  );
}
