import * as THREE from 'three';
import type { SceneHandle } from './sceneBuilder';

const HIGHLIGHT_MAT = new THREE.MeshLambertMaterial({ color: 0xffaa00, side: THREE.DoubleSide });

export function disposeHighlightMaterial(): void {
  HIGHLIGHT_MAT.dispose();
}

export function setHighlightWireframe(on: boolean): void {
  HIGHLIGHT_MAT.wireframe = on;
}

const DRAG_THRESHOLD_SQ = 25;

export interface PickerHandle {
  dispose(): void;
}

export function setupPicker(
  renderer: THREE.WebGLRenderer,
  sceneHandle: SceneHandle,
  scene: THREE.Scene,
  getCamera: () => THREE.Camera,
  onSelect: (buildingId: string, objectClass: string, attributes: Record<string, string>) => void,
  onDeselect: () => void
): PickerHandle {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let selectedBuildingId: string | null = null;
  let highlightMesh: THREE.Mesh | null = null;
  let mouseDownX = 0, mouseDownY = 0;

  const ac = new AbortController();
  const { signal } = ac;

  function clearHighlight() {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      (highlightMesh.geometry as THREE.BufferGeometry).dispose();
      highlightMesh = null;
    }
  }

  function deselect() {
    clearHighlight();
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
    const hits = raycaster.intersectObjects(sceneHandle.pickTargets, false);

    if (hits.length === 0) return;

    const hit = hits[0];
    const entry = sceneHandle.lookupFace(hit.object as THREE.Mesh, hit.faceIndex!);
    if (!entry) return;

    if (entry.buildingId === selectedBuildingId) {
      deselect();
      return;
    }

    clearHighlight();
    highlightMesh = sceneHandle.createHighlightMesh(entry.buildingId);
    highlightMesh.material = HIGHLIGHT_MAT;
    scene.add(highlightMesh);

    selectedBuildingId = entry.buildingId;
    onSelect(entry.buildingId, entry.objectClass, entry.attributes);
  }, { signal });

  return {
    dispose() {
      clearHighlight();
      ac.abort();
    },
  };
}
