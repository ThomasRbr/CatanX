import { Billboard } from '@react-three/drei';

interface HpBar3DProps {
  ratio: number;
  y?: number;
  width?: number;
}

/** Camera-facing HP strip (Pixi parity under ortho). */
export function HpBar3D({ ratio, y = 0.42, width = 0.28 }: HpBar3DProps) {
  const fill = Math.max(0, Math.min(1, ratio)) * width;
  return (
    <Billboard follow position={[0, y, 0]}>
      <mesh position={[0, 0, 0]} raycast={() => undefined}>
        <planeGeometry args={[width, 0.04]} />
        <meshBasicMaterial color="#141414" transparent opacity={0.85} depthTest={false} />
      </mesh>
      <mesh position={[-(width - fill) / 2, 0, 0.001]} raycast={() => undefined}>
        <planeGeometry args={[Math.max(0.01, fill), 0.03]} />
        <meshBasicMaterial
          color={ratio > 0.45 ? '#4ac47a' : '#cf6240'}
          depthTest={false}
          transparent
          opacity={0.95}
        />
      </mesh>
    </Billboard>
  );
}
