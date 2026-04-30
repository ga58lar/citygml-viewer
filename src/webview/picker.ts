import * as THREE from 'three';
import type { MeshEntry } from './sceneBuilder';

const HIGHLIGHT_MAT = new THREE.MeshLambertMaterial({
  color: 0xffaa00,
  side: THREE.DoubleSide,
});

export function disposeHighlightMaterial(): void {
  HIGHLIGHT_MAT.dispose();
}

const DRAG_THRESHOLD_SQ = 25; // 5 px — below this, mousedown→mouseup counts as a click

export interface PickerHandle {
  dispose(): void;
}

export function setupPicker(
  renderer: THREE.WebGLRenderer,
  meshIndex: Map<THREE.Mesh, MeshEntry>,
  getCamera: () => THREE.Camera,
  onSelect: (buildingId: string, objectClass: string, attributes: Record<string, string>) => void,
  onDeselect: () => void
): PickerHandle {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const allMeshes = Array.from(meshIndex.keys());

  const originalMaterials = new Map<THREE.Mesh, THREE.Material>();
  let selectedBuildingId: string | null = null;
  let mouseDownX = 0, mouseDownY = 0;

  // AbortController removes all listeners in one call when this picker is disposed.
  const ac = new AbortController();
  const { signal } = ac;

  function deselect() {
    for (const [mesh, mat] of originalMaterials) mesh.material = mat;
    originalMaterials.clear();
    selectedBuildingId = null;
    onDeselect();
  }

  renderer.domElement.addEventListener('mousedown', (e) => {
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
  }, { signal });

  renderer.domElement.addEventListener('click', (event) => {
    const dx = event.clientX - mouseDownX;
    const dy = event.clientY - mouseDownY;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_SQ) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, getCamera());
    const hits = raycaster.intersectObjects(allMeshes, false);

    if (hits.length === 0) return;

    const hitMesh = hits[0].object as THREE.Mesh;
    const entry = meshIndex.get(hitMesh);
    if (!entry) return;

    if (entry.buildingId === selectedBuildingId) {
      deselect();
      return;
    }

    for (const [mesh, mat] of originalMaterials) mesh.material = mat;
    originalMaterials.clear();

    for (const [mesh, e] of meshIndex) {
      if (e.buildingId === entry.buildingId) {
        originalMaterials.set(mesh, mesh.material as THREE.Material);
        mesh.material = HIGHLIGHT_MAT;
      }
    }

    selectedBuildingId = entry.buildingId;
    onSelect(entry.buildingId, entry.objectClass, entry.attributes);
  }, { signal });

  return {
    dispose() {
      // Restore any highlighted materials before listeners go away
      for (const [mesh, mat] of originalMaterials) mesh.material = mat;
      originalMaterials.clear();
      ac.abort();
    },
  };
}
