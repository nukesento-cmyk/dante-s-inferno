import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRef } from 'react';
import * as THREE from 'three';
import { PizzaModel, type ToppingSpec } from '../scenes/PizzaModel';
import { PizzaStudio } from '../scenes/PizzaStudio';

function Spinner({ toppings, scale, exploded }: { toppings: ToppingSpec[]; scale: number; exploded: number }) {
  const g = useRef<THREE.Group>(null);
  const s = useRef(scale);
  useFrame((_, dt) => {
    if (!g.current) return;
    s.current = THREE.MathUtils.damp(s.current, scale, 6, dt);
    g.current.scale.setScalar(s.current);
    g.current.rotation.y += dt * 0.25;
  });
  return (
    <group ref={g} rotation={[0.1, 0, 0]}>
      <PizzaModel toppings={toppings} exploded={exploded} perTopping={14} />
    </group>
  );
}

export default function CustomizerView({ toppings, inches }: { toppings: ToppingSpec[]; inches: number }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 3.4, 2.6], fov: 38 }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <PizzaStudio />
      <Spinner toppings={toppings} scale={0.7 + (inches - 8) * 0.04} exploded={0} />
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.3} maxPolarAngle={1.3} />
    </Canvas>
  );
}
