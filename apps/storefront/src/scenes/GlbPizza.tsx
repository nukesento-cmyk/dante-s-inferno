import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { PIZZA_GLB_URL } from './glbProbe';
import { LIFT, type PizzaModelProps } from './PizzaModel';
import { toppingKind } from './toppingGeo';

/**
 * Optional scanned model at /models/pizza.glb. Named nodes (see MODELS.md) keep the explode animation and the
 * customizer's topping toggles working; an unnamed model is shown as one rigid piece.
 */
export default function GlbPizza({ toppings, exploded, getExploded }: PizzaModelProps) {
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
