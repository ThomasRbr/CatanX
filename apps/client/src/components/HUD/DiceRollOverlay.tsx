import { useEffect, useMemo, useState } from 'react';
import type { PlayerDiceStyleId } from '@catanx/engine';

interface DiceRollOverlayProps {
  die1: number;
  die2: number;
  total: number;
  token: string;
  eventDie?: string;
  diceStyle?: PlayerDiceStyleId;
  durationMs?: number;
  onComplete?: () => void;
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const EVENT_DIE_PRESENTATIONS = {
  barbarian_ship: { label: 'Navire barbare', tone: 'ship', colorName: 'graphite' },
  trade_gate: { label: 'Commerce', tone: 'trade', colorName: 'jaune' },
  politics_gate: { label: 'Politique', tone: 'politics', colorName: 'bleu' },
  science_gate: { label: 'Science', tone: 'science', colorName: 'vert' },
} as const;

export function getEventDiePresentation(eventDie: string) {
  return (
    EVENT_DIE_PRESENTATIONS[eventDie as keyof typeof EVENT_DIE_PRESENTATIONS] ?? {
      label: eventDie,
      tone: 'ship',
      colorName: 'graphite',
    }
  );
}

function EventDieIcon({ tone }: { tone: string }) {
  if (tone === 'ship') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M5 21.5h22l-3.6 5H9L5 21.5Z" />
        <path d="M15 5v15M16 7l9 11h-9V7Z" />
      </svg>
    );
  }
  if (tone === 'trade') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 13h20l-2-6H8l-2 6Zm2 2v11h5v-7h6v7h5V15H8Z" />
      </svg>
    );
  }
  if (tone === 'politics') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="m16 5 11 6H5l11-6ZM7 13h4v10H7V13Zm7 0h4v10h-4V13Zm7 0h4v10h-4V13ZM5 25h22v3H5v-3Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M13 5h6v3l-1 1v5.2l6.4 10.2A2.4 2.4 0 0 1 22.4 28H9.6a2.4 2.4 0 0 1-2-3.6L14 14.2V9l-1-1V5Zm-1.8 17h9.6l-2.6-4.2h-4.4L11.2 22Z" />
    </svg>
  );
}

export function DiceRollOverlay({
  die1,
  die2,
  total,
  token,
  eventDie,
  diceStyle = 'classic',
  durationMs = 1650,
  onComplete,
}: DiceRollOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [animateToken, setAnimateToken] = useState(token);

  useEffect(() => {
    setAnimateToken(token);
    setVisible(true);
    const timeout = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, onComplete, token]);

  const classes = useMemo(() => `dice-overlay ${visible ? 'show' : ''}`, [visible]);
  const eventPresentation = eventDie ? getEventDiePresentation(eventDie) : null;
  const renderDie = (value: number, id: string, tone: 'red' | 'ivory') => (
    <div
      className={`dice-cube dice-cube--${tone}`}
      key={`${animateToken}-${id}`}
      aria-label={`Dé ${tone === 'red' ? 'rouge' : 'ivoire'} : ${value}`}
    >
      <span className="dice-edge" aria-hidden="true" />
      <span className="dice-pips" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <i key={index} className={PIPS[value]?.includes(index) ? 'is-pip' : undefined} />
        ))}
      </span>
    </div>
  );

  return (
    <div className={classes} data-dice-style={diceStyle}>
      {renderDie(die1, 'a', 'red')}
      {renderDie(die2, 'b', 'ivory')}
      {eventPresentation && (
        <div
          className={`dice-cube dice-event dice-event--${eventPresentation.tone}`}
          key={`${animateToken}-e`}
          aria-label={`Dé événement ${eventPresentation.colorName} : ${eventPresentation.label}`}
        >
          <span className="dice-event__symbol">
            <EventDieIcon tone={eventPresentation.tone} />
          </span>
          <span className="dice-event__label">{eventPresentation.label}</span>
        </div>
      )}
      <div className="dice-total">Total {total}</div>
    </div>
  );
}
