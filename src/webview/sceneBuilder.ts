import * as THREE from 'three';
import type { ObjectClass, ParsedBuilding, ParsedScene, ParsedSurface } from '../types';

export type RenderMode = 'surface' | 'wireframe' | 'edges';

export interface MeshEntry {
  buildingId: string;
  objectClass: ObjectClass;
  surface: ParsedSurface;
  attributes: Record<string, string>;
}

const SURFACE_MATS: Record<string, THREE.MeshLambertMaterial> = {
  wall:    new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide }),
  roof:    new THREE.MeshLambertMaterial({ color: 0xcc3333, side: THREE.DoubleSide }),
  ground:  new THREE.MeshLambertMaterial({ color: 0x555555, side: THREE.DoubleSide }),
  closure: new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide }),
  bridge:  new THREE.MeshLambertMaterial({ color: 0xc8a878, side: THREE.DoubleSide }),
  tunnel:  new THREE.MeshLambertMaterial({ color: 0x485058, side: THREE.DoubleSide }),
};
const EDGE_MAT = new THREE.LineBasicMaterial({ color: 0xaaaaaa });

function matKey(objectClass: ObjectClass, surfaceType: string): string {
  if (objectClass === 'bridge') return 'bridge';
  if (objectClass === 'tunnel') return 'tunnel';
  return surfaceType;
}

function setSharedWireframe(on: boolean): void {
  for (const mat of Object.values(SURFACE_MATS)) mat.wireframe = on;
}

export function disposeSharedMaterials(): void {
  for (const mat of Object.values(SURFACE_MATS)) mat.dispose();
  EDGE_MAT.dispose();
}

export function updateEdgeColor(isDark: boolean): void {
  EDGE_MAT.color.setHex(isDark ? 0xaaaaaa : 0x333333);
}

export interface SceneHandle {
  pickTargets: THREE.Mesh[];
  lookupFace(mesh: THREE.Mesh, faceIndex: number): MeshEntry | undefined;
  createHighlightMesh(buildingId: string): THREE.Mesh;
  setRenderMode(mode: RenderMode): void;
  dispose(): void;
}

export function buildScene(parsedScene: ParsedScene, scene: THREE.Scene): SceneHandle {
  // Accumulate triangles and per-face entries into one bucket per material key
  const buckets = new Map<string, { vertices: number[]; entries: MeshEntry[] }>();

  for (const building of parsedScene.buildings) {
    for (const surface of building.surfaces) {
      if (surface.triangles.length < 9) continue;
      const key = matKey(building.objectClass, surface.type);
      if (!buckets.has(key)) buckets.set(key, { vertices: [], entries: [] });
      const bucket = buckets.get(key)!;
      const entry: MeshEntry = {
        buildingId: building.id,
        objectClass: building.objectClass,
        surface,
        attributes: building.attributes,
      };
      const triCount = Math.floor(surface.triangles.length / 9);
      for (let t = 0; t < triCount; t++) bucket.entries.push(entry);
      for (let i = 0; i < surface.triangles.length; i++) bucket.vertices.push(surface.triangles[i]);
    }
  }

  // One merged mesh per material — reduces draw calls from O(surfaces) to O(materials)
  const pickTargets: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const faceEntryMaps = new Map<THREE.Mesh, MeshEntry[]>();

  for (const [key, { vertices, entries }] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geo.computeVertexNormals();
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, SURFACE_MATS[key] ?? SURFACE_MATS['wall']);
    scene.add(mesh);
    pickTargets.push(mesh);
    faceEntryMaps.set(mesh, entries);
  }

  // Keep building data for on-demand highlight mesh creation
  const buildingMap = new Map<string, ParsedBuilding>(
    parsedScene.buildings.map(b => [b.id, b])
  );

  // Edge geometry built lazily on first switch to 'edges' mode
  let edgePairs: { lines: THREE.LineSegments; geo: THREE.EdgesGeometry }[] | null = null;

  function ensureEdges() {
    if (edgePairs) return;
    edgePairs = [];
    for (const geo of geometries) {
      const edgeGeo = new THREE.EdgesGeometry(geo);
      const lines = new THREE.LineSegments(edgeGeo, EDGE_MAT);
      scene.add(lines);
      edgePairs.push({ lines, geo: edgeGeo });
    }
  }

  return {
    pickTargets,

    lookupFace(mesh, faceIndex) {
      return faceEntryMaps.get(mesh)?.[faceIndex];
    },

    createHighlightMesh(buildingId) {
      const building = buildingMap.get(buildingId);
      const verts: number[] = [];
      if (building) {
        for (const surface of building.surfaces) {
          for (let i = 0; i < surface.triangles.length; i++) verts.push(surface.triangles[i]);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      return new THREE.Mesh(geo);
    },

    setRenderMode(mode) {
      setSharedWireframe(mode === 'wireframe');
      if (mode === 'edges') {
        ensureEdges();
        for (const { lines } of edgePairs!) lines.visible = true;
      } else if (edgePairs) {
        for (const { lines } of edgePairs) lines.visible = false;
      }
    },

    dispose() {
      for (const mesh of pickTargets) scene.remove(mesh);
      if (edgePairs) {
        for (const { lines } of edgePairs) scene.remove(lines);
        for (const { geo } of edgePairs) geo.dispose();
      }
      for (const geo of geometries) geo.dispose();
      setSharedWireframe(false);
    },
  };
}
