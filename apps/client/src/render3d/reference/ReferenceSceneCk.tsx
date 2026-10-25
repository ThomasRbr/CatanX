import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { PremiumKnightPiece, PremiumWallPiece } from '../entities/CkPieces3D';

function CeramicCity() {
  return (
    <group position={[0, 0.02, -1.35]}>
      <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.26, 0.22, 0.24]} />
        <meshPhysicalMaterial color="#f2f3f6" roughness={0.38} clearcoat={0.32} />
      </mesh>
      <mesh position={[0, 0.29, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.2, 0.18, 4]} />
        <meshPhysicalMaterial color="#1fc8c4" roughness={0.32} metalness={0.08} />
      </mesh>
    </group>
  );
}

function CkShowcase() {
  return (
    <group rotation={[0, -0.12, 0]}>
      <group position={[-0.9, 0.015, 0.25]} rotation={[0, 0.28, 0]}>
        <PremiumKnightPiece rank={1} activated={false} color="#1fc8c4" castShadow />
      </group>
      <group position={[0, 0.015, 0.25]}>
        <PremiumKnightPiece rank={2} activated color="#ff6b5f" castShadow />
      </group>
      <group position={[0.9, 0.015, 0.25]} rotation={[0, -0.28, 0]}>
        <PremiumKnightPiece rank={3} activated={false} color="#8b6cff" castShadow />
      </group>
      <group position={[0, 0.015, -1.35]}>
        <PremiumWallPiece color="#1fc8c4" castShadow />
      </group>
      <CeramicCity />
    </group>
  );
}

/** Open with `/?scene=ck` to review the premium Cities & Knights kit. */
export function ReferenceSceneCkPage() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(circle at 50% 30%, #795236, #2c1b12 72%)',
      }}
    >
      <div
        style={{
          position: 'fixed',
          left: 24,
          top: 22,
          zIndex: 5,
          color: '#f7f8fc',
          fontFamily: 'Inter, sans-serif',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 22 }}>
          CatanX · Villes & Chevaliers
        </div>
        <div style={{ marginTop: 4, opacity: 0.72 }}>
          Chevalier · Fort · Champion · muraille modulaire
        </div>
      </div>
      <Canvas
        orthographic
        shadows
        dpr={[1, 2]}
        camera={{ position: [4.5, 5.5, 6.5], zoom: 185, near: 0.1, far: 50 }}
        gl={{ antialias: true }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          scene.background = new THREE.Color('#3c2519');
        }}
      >
        <ambientLight intensity={1.55} />
        <directionalLight
          position={[-4, 7, 5]}
          intensity={3.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[5, 3, -2]} intensity={1.1} color="#b9ddff" />
        <mesh position={[0, -0.025, -0.35]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[8, 6]} />
          <meshStandardMaterial color="#6b452d" roughness={0.88} metalness={0.02} />
        </mesh>
        <Suspense fallback={null}>
          <CkShowcase />
        </Suspense>
      </Canvas>
    </div>
  );
}
