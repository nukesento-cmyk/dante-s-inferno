import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { ContactShadows, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PIZZA_GLB_URL, usePizzaGlbAvailable } from './glbProbe';
import { cheeseEdge, cheeseHeight, makeCrustGeometry, makeDiscGeometry, sauceHeight } from './pizzaGeo';
import { getPizzaTextures } from './pizzaTextures';
import { hashString, makeToppingGeometry, mulberry32, toppingKind, toppingLook, type ToppingSpec } from './toppingGeo';

export type { ToppingSpec };

export interface PizzaModelProps {
  /** One instanced layer is rendered per entry. */
  toppings: ToppingSpec[];
  /** 0 = assembled, 1 = fully exploded. */
  exploded: number;
  /** Optional per-frame override (avoids React re-renders while scrubbing). */
  getExploded?: () => number;
  /** 0..1 how baked the pizza looks. */
  getBake?: () => number;
  /** Instances per topping type. */
  perTopping?: number;
}

// Layer heights (assembled) and how far each lifts when exploded.
const BASE = { dough: 0.07, crust: 0.1, sauce: 0.15, cheese: 0.165, toppings: 0.2 };
const LIFT = { dough: 0, crust: 0.5, sauce: 1.0, cheese: 1.5, toppings: 2.1 };

const WHITE = new THREE.Color('#ffffff');
const CRUST_BAKED = new THREE.Color('#c58a52');
const CHEESE_BAKED = new THREE.Color('#e9a64a');

function ToppingLayer({ spec, count, seed }: { spec: ToppingSpec; count: number; seed: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => makeToppingGeometry(spec.modelKey), [spec.modelKey]);
  const look = useMemo(() => toppingLook(spec.modelKey), [spec.modelKey]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rnd = mulberry32(hashString(spec.modelKey) + seed * 977);
    const d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const r = 0.14 + Math.sqrt(rnd()) * 0.66;
      const a = rnd() * Math.PI * 2;
      d.position.set(Math.cos(a) * r, -look.sink + rnd() * 0.006, Math.sin(a) * r);
      d.rotation.set((rnd() - 0.5) * look.tilt * 2, rnd() * Math.PI * 2, (rnd() - 0.5) * look.tilt * 2, 'YXZ');
      d.scale.setScalar(0.85 + rnd() * 0.3);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [spec.modelKey, count, seed, look]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshPhysicalMaterial
        color={spec.color}
        vertexColors
        roughness={look.roughness}
        clearcoat={look.clearcoat}
        clearcoatRoughness={0.3}
        side={look.doubleSide ? THREE.DoubleSide : THREE.FrontSide}
      />
    </instancedMesh>
  );
}

/**
 * Procedural pizza. Each layer (dough, crust, sauce, cheese, every topping type) is its own mesh so scenes can
 * explode and reassemble them. Textures are painted once (CanvasTexture) and shared.
 */
function ProceduralPizza({ toppings, exploded, getExploded, getBake, perTopping = 12 }: PizzaModelProps) {
  const dough = useRef<THREE.Mesh>(null);
  const crust = useRef<THREE.Mesh>(null);
  const sauce = useRef<THREE.Mesh>(null);
  const cheese = useRef<THREE.Mesh>(null);
  const tops = useRef<THREE.Group>(null);
  const crustMat = useRef<THREE.MeshStandardMaterial>(null);
  const cheeseMat = useRef<THREE.MeshPhysicalMaterial>(null);

  const tex = useMemo(getPizzaTextures, []);
  const crustGeo = useMemo(() => makeCrustGeometry(), []);
  const sauceGeo = useMemo(() => makeDiscGeometry({ radius: 0.93, rings: 10, segs: 72, height: sauceHeight }), []);
  const cheeseGeo = useMemo(() => makeDiscGeometry({ radius: 0.88, rings: 30, segs: 112, height: cheeseHeight, edge: cheeseEdge }), []);
  useEffect(() => () => {
    crustGeo.dispose();
    sauceGeo.dispose();
    cheeseGeo.dispose();
  }, [crustGeo, sauceGeo, cheeseGeo]);

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
    crustMat.current?.color.copy(WHITE).lerp(CRUST_BAKED, b);
    cheeseMat.current?.color.copy(WHITE).lerp(CHEESE_BAKED, b * 0.8);
  });

  return (
    <group>
      <mesh ref={dough} name="dough">
        <cylinderGeometry args={[0.97, 0.97, 0.14, 64]} />
        <meshStandardMaterial map={tex.doughMap} roughness={0.9} />
      </mesh>
      <mesh ref={crust} name="crust" geometry={crustGeo}>
        <meshStandardMaterial ref={crustMat} map={tex.crustMap} bumpMap={tex.crustBump} bumpScale={2.2} roughnessMap={tex.crustBump} roughness={0.95} metalness={0} />
      </mesh>
      <mesh ref={sauce} name="sauce" geometry={sauceGeo}>
        <meshPhysicalMaterial
          map={tex.sauceMap}
          bumpMap={tex.sauceBump}
          bumpScale={1.2}
          roughnessMap={tex.sauceRough}
          roughness={0.9}
          clearcoat={0.55}
          clearcoatRoughness={0.28}
        />
      </mesh>
      <mesh ref={cheese} name="cheese" geometry={cheeseGeo}>
        <meshPhysicalMaterial
          ref={cheeseMat}
          map={tex.cheeseMap}
          bumpMap={tex.cheeseBump}
          bumpScale={3}
          alphaTest={0.5}
          alphaToCoverage
          roughness={0.5}
          sheen={0.6}
          sheenRoughness={0.45}
          sheenColor="#ffe9b8"
          clearcoat={0.2}
          clearcoatRoughness={0.4}
        />
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

/**
 * Optional scanned model at /models/pizza.glb. Named nodes (see MODELS.md) keep the explode animation and the
 * customizer's topping toggles working; an unnamed model is shown as one rigid piece.
 */
function GlbPizza({ toppings, exploded, getExploded }: PizzaModelProps) {
  const { scene } = useGLTF(PIZZA_GLB_URL);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 2 / Math.max(size.x, size.z, 0.0001);
    const holder = new THREE.Group();
    clone.position.set(-center.x, -box.min.y, -center.z);
    holder.add(clone);
    holder.scale.setScalar(scale);
    const layers: { node: THREE.Object3D; baseY: number; lift: number }[] = [];
    const topNodes: { node: THREE.Object3D; key: string }[] = [];
    clone.traverse((o) => {
      const n = o.name.toLowerCase();
      if (n in LIFT) layers.push({ node: o, baseY: o.position.y, lift: LIFT[n as keyof typeof LIFT] / scale });
      else if (n.startsWith('topping_')) topNodes.push({ node: o, key: n.slice(8) });
    });
    return { holder, layers, topNodes, scale };
  }, [scene]);

  useEffect(() => {
    if (!model.topNodes.length) return;
    const wanted = new Set(toppings.flatMap((t) => [t.modelKey.toLowerCase(), toppingKind(t.modelKey)]));
    model.topNodes.forEach(({ node, key }) => {
      node.visible = wanted.has(key);
    });
  }, [model, toppings]);

  useFrame(() => {
    const e = getExploded ? getExploded() : exploded;
    model.layers.forEach((l) => {
      l.node.position.y = l.baseY + l.lift * e;
    });
    model.topNodes.forEach(({ node }, i) => {
      node.position.y = (node.userData.baseY ??= node.position.y) + ((LIFT.toppings + i * 0.2) / model.scale) * e;
    });
  });
  return <primitive object={model.holder} />;
}

function Boundary({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <ErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/** Pizza for the Anatomy scene and the customizer: the GLB when /models/pizza.glb exists, otherwise the procedural one. */
export function PizzaModel(props: PizzaModelProps) {
  const hasGlb = usePizzaGlbAvailable();
  const procedural = <ProceduralPizza {...props} />;
  return (
    <group>
      {hasGlb ? (
        <Boundary fallback={procedural}>
          <GlbPizza {...props} />
        </Boundary>
      ) : (
        procedural
      )}
      <ContactShadows position={[0, -0.012, 0]} opacity={0.6} scale={3.4} blur={2.6} far={0.45} resolution={512} color="#1a0b02" />
    </group>
  );
}
