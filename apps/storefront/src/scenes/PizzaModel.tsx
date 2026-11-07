import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { hashString, makeToppingGeometry, mulberry32, type ToppingSpec } from './toppingGeo';

export type { ToppingSpec };

export interface PizzaModelProps {
  /** One instanced layer is rendered per entry. */
  toppings: ToppingSpec[];
  /** 0 = assembled, 1 = fully exploded. */
  exploded: number;
  /** Optional per-frame override (avoids React re-renders while scrubbing). */
  getExploded?: () => number;
  /** 0..1 how baked the pizza looks (Fire Dimension). */
  getBake?: () => number;
  /** Instances per topping type. */
  perTopping?: number;
}

// Layer heights (assembled) and how far each lifts when exploded.
const BASE = { dough: 0.07, crust: 0.1, sauce: 0.16, cheese: 0.19, toppings: 0.25 };
const LIFT = { dough: 0, crust: 0.5, sauce: 1.0, cheese: 1.5, toppings: 2.1 };

const DOUGH = new THREE.Color('#e8c98a');
const CRUST = new THREE.Color('#d99b4f');
const CRUST_BAKED = new THREE.Color('#a8501f');
const CHEESE = new THREE.Color('#fff0c9');
const CHEESE_BAKED = new THREE.Color('#f2a93b');

function ToppingLayer({ spec, count, seed }: { spec: ToppingSpec; count: number; seed: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => makeToppingGeometry(spec.modelKey), [spec.modelKey]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rnd = mulberry32(hashString(spec.modelKey) + seed * 977);
    const d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const r = 0.14 + Math.sqrt(rnd()) * 0.66;
      const a = rnd() * Math.PI * 2;
      d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      d.rotation.set(0, rnd() * Math.PI * 2, 0);
      d.scale.setScalar(0.85 + rnd() * 0.3);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [spec.modelKey, count, seed]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial color={spec.color} roughness={0.6} metalness={0.05} />
    </instancedMesh>
  );
}

/**
 * Procedural pizza. Each layer (dough, crust, sauce, cheese, every topping type) is its own mesh so scenes can
 * explode and reassemble them. The same props let a GLB-backed implementation replace this file later.
 */
export function PizzaModel({ toppings, exploded, getExploded, getBake, perTopping = 12 }: PizzaModelProps) {
  const dough = useRef<THREE.Mesh>(null);
  const crust = useRef<THREE.Mesh>(null);
  const sauce = useRef<THREE.Mesh>(null);
  const cheese = useRef<THREE.Mesh>(null);
  const tops = useRef<THREE.Group>(null);
  const crustMat = useRef<THREE.MeshStandardMaterial>(null);
  const cheeseMat = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    const e = getExploded ? getExploded() : exploded;
    if (dough.current) dough.current.position.y = BASE.dough + LIFT.dough * e;
    if (crust.current) crust.current.position.y = BASE.crust + LIFT.crust * e;
    if (sauce.current) sauce.current.position.y = BASE.sauce + LIFT.sauce * e;
    if (cheese.current) cheese.current.position.y = BASE.cheese + LIFT.cheese * e;
    if (tops.current) {
      tops.current.children.forEach((c, i) => {
        c.position.y = BASE.toppings + (LIFT.toppings + i * 0.2) * e;
      });
    }
    const b = getBake ? getBake() : 0;
    crustMat.current?.color.copy(CRUST).lerp(CRUST_BAKED, b);
    cheeseMat.current?.color.copy(CHEESE).lerp(CHEESE_BAKED, b * 0.8);
  });

  return (
    <group>
      <mesh ref={dough} name="dough">
        <cylinderGeometry args={[0.97, 0.97, 0.14, 64]} />
        <meshStandardMaterial color={DOUGH} roughness={0.85} />
      </mesh>
      <mesh ref={crust} name="crust" rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.97, 0.11, 20, 80]} />
        <meshStandardMaterial ref={crustMat} color={CRUST} roughness={0.75} />
      </mesh>
      <mesh ref={sauce} name="sauce">
        <cylinderGeometry args={[0.9, 0.9, 0.025, 64]} />
        <meshStandardMaterial color="#c92a14" roughness={0.45} />
      </mesh>
      <mesh ref={cheese} name="cheese">
        <cylinderGeometry args={[0.87, 0.87, 0.05, 64]} />
        <meshStandardMaterial ref={cheeseMat} color={CHEESE} roughness={0.4} />
      </mesh>
      <group ref={tops} name="toppings">
        {toppings.map((t, i) => (
          <group key={`${t.modelKey}-${i}`}>
            <ToppingLayer spec={t} count={perTopping} seed={i} />
          </group>
        ))}
      </group>
    </group>
  );
}
