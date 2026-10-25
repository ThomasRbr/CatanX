import { useMemo } from 'react';
import { MultiplayerChatMessage } from '../../network/MultiplayerClient';

interface ChatBubblesProps {
  messages: MultiplayerChatMessage[];
  playerName: string;
}

export function ChatBubbles({ messages, playerName }: ChatBubblesProps) {
  const latest = useMemo(() => messages.slice(-3), [messages]);
  if (latest.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 18,
        top: 290,
        display: 'grid',
        gap: 6,
        width: 280,
        pointerEvents: 'none',
      }}
    >
      {latest.map((message, index) => {
        const own = message.sender === playerName;
        return (
          <div
            key={`${message.timestamp}-${index}`}
            className="ui-panel"
            style={{
              padding: '6px 8px',
              background: own ? 'rgba(219, 234, 254, 0.9)' : 'rgba(255, 248, 232, 0.9)',
              borderColor: own ? 'rgba(59, 130, 246, 0.35)' : undefined,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700 }}>{message.sender}</div>
            <div style={{ fontSize: 12 }}>{message.text}</div>
          </div>
        );
      })}
    </div>
  );
}
