import { Player, HexTile } from '@catanx/engine';

interface RobberStealPanelProps {
  mode: 'move' | 'steal';
  tiles: HexTile[];
  candidates: Player[];
  onSelectTile?: (tileId: string) => void;
  onSelectPlayer?: (playerId: string) => void;
  onSkipSteal?: () => void;
}

/** The robber moves by clicking the actual board. Only the unavoidable steal choice opens UI. */
export function RobberStealPanel({ mode, candidates, onSelectPlayer, onSkipSteal }: RobberStealPanelProps) {
  if (mode === 'move') return null;
  return (
    <aside className="ui-panel" style={{ position:'absolute', left:16, bottom:16, width:230, padding:10, pointerEvents:'auto', zIndex:30 }}>
      <strong>Voler une ressource</strong>
      <p style={{ margin:'4px 0 0', fontSize:11, opacity:.8 }}>Choisissez un voisin du brigand.</p>
      <div style={{ display:'grid', gap:5, marginTop:8 }}>
        {candidates.map((player) => <button key={player.id} type="button" className="command-button" onClick={() => onSelectPlayer?.(player.id)}>Voler à {player.name}</button>)}
        <button type="button" className="command-button secondary" onClick={onSkipSteal}>Passer</button>
      </div>
    </aside>
  );
}
