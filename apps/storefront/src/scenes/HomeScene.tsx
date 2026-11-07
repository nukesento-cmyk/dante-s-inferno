import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PizzaModel } from './PizzaModel';
import { hashString, makeToppingGeometry, mulberry32, type ToppingSpec } from './toppingGeo';
import { PizzaStudio } from './PizzaStudio';
import { getScenePaused, sceneState, subscribeScenePaused, type SceneSection } from './sceneState';

export interface CloudItem {
  slug: string;
  modelKey: string;
  color: string;
}

interface Target { x: number; y: number; s: number; rx: number; cam: number }

const damp = THREE.MathUtils.damp;

function targetFor(section: SceneSection, aspect: number): Target {
  const wide = aspect > 1.3;
  switch (section) {
    case 'anatomy':
      return { x: wide ? 0.4 : 0, y: -0.75, s: 0.68, rx: 0.8, cam: 6.4 };
    case 'universe':
      return { x: 0, y: 0, s: 0.4, rx: 1.0, cam: 7 };
    case 'fire':
      return { x: wide ? 0.9 : 0, y: -0.1, s: 1.0, rx: 1.05, cam: 5.8 };
    case 'final':
      return { x: 0, y: wide ? 1.62 : 1.6, s: 0.3, rx: 1.0, cam: 5.4 };
    default:
      return { x: wide ? 1.9 : 0, y: wide ? -0.1 : 1.35, s: wide ? 0.82 : 0.62, rx: 1.0, cam: 5.2 };
  }
}

/** Rising sparks in the Fire section; opacity follows the scrubbed fire progress. */
function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,230,180,1)');
  grad.addColorStop(0.3, 'rgba(255,140,40,.9)');
  grad.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function Embers({ cur }: { cur: React.RefObject<{ fire: number }> }) {
  const N = 140;
  const ref = useRef<THREE.Points>(null);
  const spark = useMemo(sparkTexture, []);
  useEffect(() => () => spark.dispose(), [spark]);
  const data = useMemo(() => {
    const rnd = mulberry32(42);
    const pos = new Float32Array(N * 3);
    const speed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rnd() - 0.5) * 7;
      pos[i * 3 + 1] = (rnd() - 0.5) * 5;
      pos[i * 3 + 2] = (rnd() - 0.5) * 4;
      speed[i] = 0.2 + rnd() * 0.7;
    }
    return { pos, speed };
  }, []);
  useFrame((_, dt) => {
    const p = ref.current;
    if (!p) return;
    const f = cur.current?.fire ?? 0;
    p.visible = f > 0.02;
    if (!p.visible) return;
    const attr = p.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      let y = attr.getY(i) + data.speed[i]! * dt;
      if (y > 2.8) y = -2.4;
      attr.setY(i, y);
      attr.setX(i, attr.getX(i) + Math.sin(y * 3 + i) * dt * 0.1);
    }
    attr.needsUpdate = true;
    (p.material as THREE.PointsMaterial).opacity = Math.min(1, f * 1.4);
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
      </bufferGeometry>
      <pointsMaterial map={spark} color="#ffb070" size={0.09} transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

function Stage({ toppings, cloud }: { toppings: ToppingSpec[]; cloud: CloudItem[] }) {
  const { size, camera } = useThree();
  const pizza = useRef<THREE.Group>(null);
  const cloudRef = useRef<THREE.Group>(null);
  const fireLight = useRef<THREE.PointLight>(null);
  const cur = useRef({ x: 1.5, y: 0, s: 1, rx: 1, cam: 5.2, explode: 0, fire: 0, bake: 0, ring: 1, ringR: 1.5, universe: 0, spin: 0 });

  const items = useMemo(
    () =>
      Array.from({ length: cloud.length ? 18 : 0 }, (_, i) => {
        const c = cloud[i % cloud.length]!;
        const rnd = mulberry32(hashString(c.slug) + i * 31);
        const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
        return { ...c, i, dir, phase: rnd() * 6.28, spin: 0.4 + rnd(), geo: makeToppingGeometry(c.modelKey) };
      }),
    [cloud],
  );
  useEffect(() => () => items.forEach((it) => it.geo.dispose()), [items]);

  useFrame((state, dt) => {
    const c = cur.current;
    const aspect = size.width / size.height;
    const t = targetFor(sceneState.section, aspect);
    const fit = Math.min(1, (aspect * 3.6 * 0.85) / 2.3);
    const k = 3;
    c.x = damp(c.x, t.x, k, dt);
    c.y = damp(c.y, t.y, k, dt);
    c.s = damp(c.s, t.s * fit, k, dt);
    c.rx = damp(c.rx, t.rx, k, dt);
    const fire = sceneState.section === 'fire' ? sceneState.fire : 0;
    c.fire = damp(c.fire, fire, 4, dt);
    c.bake = damp(c.bake, fire, 2, dt);
    c.explode = damp(c.explode, sceneState.section === 'anatomy' ? sceneState.explode : 0, 5, dt);
    c.ring = damp(c.ring, sceneState.section === 'portal' ? 1 : 0, 3, dt);
    c.universe = damp(c.universe, sceneState.section === 'universe' ? 1 : 0, 3, dt);
    // tighter ring in the hero so floating toppings stay clear of the headline
    c.ringR = damp(c.ringR, sceneState.section === 'portal' ? 1.15 : sceneState.section === 'final' ? 0.8 : 2.1, 3, dt);
    const camTarget = sceneState.section === 'fire' ? 5.8 - 1.4 * fire : t.cam;
    c.cam = damp(c.cam, camTarget, 3, dt);
    c.spin += dt * (sceneState.section === 'anatomy' ? 0.15 : 0.35);

    const g = pizza.current;
    if (g) {
      g.position.set(c.x, c.y, 0);
      g.scale.setScalar(c.s);
      // spin about the pizza's own axis, then tilt: the top always faces the camera (no edge-on wobble)
      g.rotation.set(c.rx, c.spin, 0, 'XYZ');
    }
    // mouse-responsive camera
    camera.position.x = damp(camera.position.x, sceneState.mouseX * 0.8, 2.5, dt);
    camera.position.y = damp(camera.position.y, 1.2 - sceneState.mouseY * 0.5 - c.fire * 0.25, 2.5, dt);
    camera.position.z = c.cam;
    camera.lookAt(c.x * 0.3, c.y * 0.5, 0);
    if (fireLight.current) fireLight.current.intensity = c.fire * (9 + Math.sin(state.clock.elapsedTime * 11) * 1.5);

    // floating ingredients: ring around the pizza in portal/final, galaxy in universe
    const grp = cloudRef.current;
    if (grp) {
      const vis = Math.max(c.ring, c.universe);
      grp.visible = vis > 0.01;
      const R = c.ringR + c.universe * 1.6;
      grp.children.forEach((child, idx) => {
        const it = items[idx];
        if (!it) return;
        const a = state.clock.elapsedTime * 0.15 + it.phase;
        const x = it.dir.x * Math.cos(a) - it.dir.z * Math.sin(a);
        const z = it.dir.x * Math.sin(a) + it.dir.z * Math.cos(a);
        const flat = 1 - c.universe * 0.35;
        child.position.set(c.x + x * R * 1.15, c.y + it.dir.y * R * 0.8 * flat + Math.sin(state.clock.elapsedTime + it.phase) * 0.12, z * R * 0.8);
        child.rotation.set(state.clock.elapsedTime * it.spin * 0.5, state.clock.elapsedTime * it.spin, 0);
        const hi = sceneState.highlight && sceneState.highlight === it.slug ? 2.2 : 1;
        child.scale.setScalar(vis * (c.ringR < 1.8 ? 1.3 : 2.2 + c.universe * 1.6) * hi);
      });
    }
  });

  return (
    <>
      <PizzaStudio />
      <pointLight ref={fireLight} position={[0, 1.2, 2]} intensity={0} color="#ff6a00" distance={14} />
      <group ref={pizza}>
        <PizzaModel toppings={toppings} exploded={0} getExploded={() => cur.current.explode} getBake={() => cur.current.bake} />
      </group>
      <group ref={cloudRef}>
        {items.map((it) => (
          <mesh key={it.i} geometry={it.geo}>
            <meshStandardMaterial color={it.color} vertexColors roughness={0.55} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      <Embers cur={cur} />
    </>
  );
}

export interface HomeSceneProps {
  toppings: ToppingSpec[];
  cloud: CloudItem[];
  active: boolean;
}

export default function HomeScene({ toppings, cloud, active }: HomeSceneProps) {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      sceneState.mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      sceneState.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  // The idle/attract overlay covers the page, so there is no point rendering behind it.
  const paused = useSyncExternalStore(subscribeScenePaused, getScenePaused, () => false);
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 1.2, 5.2], fov: 40 }}
      frameloop={active && !paused ? 'always' : 'never'}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <Stage toppings={toppings} cloud={cloud} />
    </Canvas>
  );
}
