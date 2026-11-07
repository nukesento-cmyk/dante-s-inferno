import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Panel { form: 'rect' | 'ring' | 'circle'; intensity: number; color: string; position: [number, number, number]; scale: number | [number, number, number] }

/** Same five light panels as before, now baked once into a PMREM environment map. */
const PANELS: Panel[] = [
  { form: 'rect', intensity: 5, color: '#ffd8a6', position: [3, 5, 3], scale: [7, 3.5, 1] },
  { form: 'rect', intensity: 2.6, color: '#ff9a4d', position: [-5, 2.5, -4], scale: [9, 2, 1] },
  { form: 'ring', intensity: 1.8, color: '#fff1dc', position: [0, 6, 0], scale: 5 },
  { form: 'circle', intensity: 0.9, color: '#8d9bbd', position: [-6, 1, 5], scale: 4 },
  { form: 'rect', intensity: 1.4, color: '#ffcf99', position: [0, -3, 4], scale: [8, 1.2, 1] },
];

function buildEnvScene(): THREE.Scene {
  const env = new THREE.Scene();
  for (const p of PANELS) {
    const geo = p.form === 'ring' ? new THREE.RingGeometry(0.5, 1, 64) : p.form === 'circle' ? new THREE.CircleGeometry(1, 64) : new THREE.PlaneGeometry();
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide, color: new THREE.Color(p.color).multiplyScalar(p.intensity) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...p.position);
    if (typeof p.scale === 'number') mesh.scale.setScalar(p.scale);
    else mesh.scale.set(...p.scale);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  }
  return env;
}

/**
 * Image-based lighting built from local light panels (no HDR download). This replaces drei's
 * <Environment>/<Lightformer>, whose loaders (EXR, RGBE, gain-map JPEG, fflate) added ~100 KB of unused JS.
 */
function StudioEnvironment({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const envScene = buildEnvScene();
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(envScene, 0, 0.1, 100, { size: 256 });
    const prev = { env: scene.environment, intensity: scene.environmentIntensity };
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;
    pmrem.dispose();
    return () => {
      scene.environment = prev.env;
      scene.environmentIntensity = prev.intensity;
      target.dispose();
      envScene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    };
  }, [gl, scene, intensity]);
  return null;
}

/**
 * Lighting rig: an environment built from local light panels (no HDR download), a warm key and a rim light.
 * Shadows come from ContactShadows inside PizzaModel, so no shadow maps are needed.
 */
export function PizzaStudio({ intensity = 1 }: { intensity?: number }) {
  return (
    <>
      <StudioEnvironment intensity={0.6 * intensity} />
      {/* warm key */}
      <directionalLight position={[3, 5, 4]} intensity={1.7 * intensity} color="#ffd9a0" />
      {/* rim */}
      <directionalLight position={[-4, 2.6, -4.5]} intensity={1.5 * intensity} color="#ff9457" />
      <ambientLight intensity={0.12} color="#ffe3c2" />
    </>
  );
}
