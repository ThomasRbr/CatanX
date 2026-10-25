import { FormEvent, useMemo, useState } from 'react';
import { MultiplayerChatMessage } from '../../network/MultiplayerClient';

interface MultiplayerChatProps {
  connected: boolean;
  roomId: string;
  playerName: string;
  messages: MultiplayerChatMessage[];
  onSend: (text: string) => void;
  compact?: boolean;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function MultiplayerChat({
  connected,
  roomId,
  playerName,
  messages,
  onSend,
  compact = false,
}: MultiplayerChatProps) {
  const [input, setInput] = useState('');

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.timestamp - b.timestamp).slice(-40),
    [messages],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
  };

  return (
    <div className="ui-panel" style={{ padding: compact ? 8 : 10 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <div style={{ fontWeight: 700 }}>Chat multijoueur</div>
        <div style={{ fontSize: 11, opacity: 0.78 }}>
          {connected ? `Connecte - ${roomId || 'Sans salon'}` : 'Hors ligne'}
        </div>
      </div>

      <div
        style={{
          marginTop: 8,
          border: '1px solid rgba(86,63,38,0.24)',
          borderRadius: 10,
          background: 'rgba(255,250,238,0.6)',
          padding: 8,
          height: compact ? 160 : 220,
          overflowY: 'auto',
          display: 'grid',
          gap: 6,
        }}
      >
        {sortedMessages.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.72 }}>Aucun message pour le moment.</div>
        ) : (
          sortedMessages.map((message, index) => {
            const own = message.sender === playerName;
            return (
              <div key={`${message.timestamp}-${index}`} style={{ fontSize: 12 }}>
                <div style={{ fontWeight: own ? 700 : 600, color: own ? '#1d4ed8' : '#2f2418' }}>
                  {message.sender}
                  <span style={{ marginLeft: 6, fontWeight: 500, opacity: 0.65 }}>
                    {formatTime(message.timestamp)}
                  </span>
                </div>
                <div style={{ marginTop: 1 }}>{message.text}</div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={submit} style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={connected ? 'Ecrire un message...' : 'Connectez-vous pour chatter'}
          disabled={!connected}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={!connected || input.trim().length === 0}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
