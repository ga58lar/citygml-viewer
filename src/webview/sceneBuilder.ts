import * as THREE from 'three';
import type { ObjectClass, ParsedScene, ParsedSurface } from '../types';

export interface MeshEntry {
  buildingId: string;
  objectClass: ObjectClass;
  surface: ParsedSurface;
  attributes: Record<string, string>;
}

// Shared materials — one instance per visual style, reused across scene rebuilds.
// Disposed only on final page teardown via disposeSharedMaterials().
const BUILDING_MATS: Record<string, THREE.MeshLambertMaterial> = {
  wall:    new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide }),
  roof:    new THREE.MeshLambertMaterial({ color: 0xcc3333, side: THREE.DoubleSide }),
  ground:  new THREE.MeshLambertMaterial({ color: 0x555555, side: THREE.DoubleSide }),
  closure: new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide }),
};
const BRIDGE_MAT = new THREE.MeshLambertMaterial({ color: 0xc8a878, side: THREE.DoubleSide });
const TUNNEL_MAT = new THREE.MeshLambertMaterial({ color: 0x485058, side: THREE.DoubleSide });

export function disposeSharedMaterials(): void {
  for (const mat of Object.values(BUILDING_MATS)) mat.dispose();
  BRIDGE_MAT.dispose();
  TUNNEL_MAT.dispose();
}

function getMaterial(objectClass: ObjectClass, surfaceType: string): THREE.MeshLambertMaterial {
  if (objectClass === 'bridge') return BRIDGE_MAT;
  if (objectClass === 'tunnel') return TUNNEL_MAT;
  return BUILDING_MATS[surfaceType] ?? BUILDING_MATS['wall'];
}

export interface SceneHandle {
  meshIndex: Map<THREE.Mesh, MeshEntry>;
  dispose(): void;
}

export function buildScene(parsedScene: ParsedScene, scene: THREE.Scene): SceneHandle {
  const meshIndex = new Map<THREE.Mesh, MeshEntry>();
  const geometries: THREE.BufferGeometry[] = [];

  for (const building of parsedScene.buildings) {
    for (const surface of building.surfaces) {
      if (surface.triangles.length < 9) continue;

      const geometry = new THREE.BufferGeometry();
      const verts = new Float32Array(surface.triangles);
      geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geometry.computeVertexNormals();
      geometries.push(geometry);

      const mesh = new THREE.Mesh(geometry, getMaterial(building.objectClass, surface.type));
      scene.add(mesh);

      meshIndex.set(mesh, {
        buildingId: building.id,
        objectClass: building.objectClass,
        surface,
        attributes: building.attributes,
      });
    }
  }

  return {
    meshIndex,
    dispose() {
      for (const mesh of meshIndex.keys()) scene.remove(mesh);
      for (const geo of geometries) geo.dispose();
      meshIndex.clear();
      geometries.length = 0;
    },
  };
}
