import { Environment, Lightformer } from '@react-three/drei';

/**
 * Lighting rig: an environment built from local Lightformers (no HDR download), a warm key and a rim light.
 * Shadows come from ContactShadows inside PizzaModel, so no shadow maps are needed.
 */
export function PizzaStudio({ intensity = 1 }: { intensity?: number }) {
  return (
    <>
      <Environment resolution={256} frames={1} environmentIntensity={0.6 * intensity}>
        <Lightformer form="rect" intensity={5} color="#ffd8a6" position={[3, 5, 3]} scale={[7, 3.5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={2.6} color="#ff9a4d" position={[-5, 2.5, -4]} scale={[9, 2, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.8} color="#fff1dc" position={[0, 6, 0]} scale={5} target={[0, 0, 0]} />
        <Lightformer form="circle" intensity={0.9} color="#8d9bbd" position={[-6, 1, 5]} scale={4} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.4} color="#ffcf99" position={[0, -3, 4]} scale={[8, 1.2, 1]} target={[0, 0, 0]} />
      </Environment>
      {/* warm key */}
      <directionalLight position={[3, 5, 4]} intensity={1.7 * intensity} color="#ffd9a0" />
      {/* rim */}
      <directionalLight position={[-4, 2.6, -4.5]} intensity={1.5 * intensity} color="#ff9457" />
      <ambientLight intensity={0.12} color="#ffe3c2" />
    </>
  );
}
