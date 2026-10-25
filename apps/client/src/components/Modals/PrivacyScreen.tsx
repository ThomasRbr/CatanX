import { motion } from 'framer-motion';

interface PrivacyScreenProps {
  playerName: string;
  onConfirm: () => void;
}

export function PrivacyScreen({ playerName, onConfirm }: PrivacyScreenProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(18, 12, 8, 0.92)',
        color: '#fff8eb',
        pointerEvents: 'auto',
      }}
    >
      <motion.div
        className="ui-panel"
        style={{ width: 'min(420px, 92vw)', padding: 24, textAlign: 'center' }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <motion.div style={{ fontSize: 22, fontWeight: 800 }}>Passe-et-joue</motion.div>
        <p style={{ marginTop: 12, lineHeight: 1.5 }}>
          Passez l&apos;appareil à <strong>{playerName}</strong>.
          <br />
          Les ressources et cartes des autres joueurs restent cachées.
        </p>
        <button className="command-button primary" style={{ marginTop: 16 }} onClick={onConfirm}>
          Je suis {playerName}
        </button>
      </motion.div>
    </div>
  );
}
