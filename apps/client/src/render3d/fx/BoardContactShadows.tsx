import { ContactShadows } from '@react-three/drei';
import { useMapLod } from '../camera/MapLodContext';

interface BoardContactShadowsProps {
  enabled?: boolean;
  /** World span of the framed island — scales the contact shadow field. */
  span?: number;
  /** Stronger ground glue for cinematic village / island shots. */
  cinematic?: boolean;
}

/** Soft ground contact shadows under the diorama. */
export function BoardContactShadows({
  enabled = true,
  span,
  cinematic = false,
}: BoardContactShadowsProps) {
  const lod = useMapLod();
  if (!enabled || lod >= 2) return null;

  const scale = span ? Math.max(14, span * 1.05 + 6) : 28;

  return (
    <ContactShadows
      // One-shot bake — multi-frame progressive contact shadows only hitched
      // enter without improving the final soft ground glue.
      frames={1}
      position={[0, 0.002, 0]}
      opacity={cinematic ? 0.45 : 0.3}
      scale={scale}
      blur={cinematic ? 2.2 : 2.6}
      far={Math.max(10, scale * 0.45)}
      resolution={512}
      color="#1a1814"
    />
  );
}
