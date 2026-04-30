import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type * as THREE from 'three';

export interface ControlsHandle {
  orbitControls: OrbitControls;
  panControls: OrbitControls;
  updateControls(): void;
  setMode(is3D: boolean): void;
  dispose(): void;
}

export function createControls(
  perspCamera: THREE.PerspectiveCamera,
  orthoCamera: THREE.OrthographicCamera,
  domElement: HTMLElement
): ControlsHandle {
  const orbitControls = new OrbitControls(perspCamera, domElement);
  orbitControls.enableDamping = false;
  orbitControls.screenSpacePanning = true;

  const panControls = new OrbitControls(orthoCamera, domElement);
  panControls.enableRotate = false;
  panControls.enableZoom = true;
  panControls.screenSpacePanning = true;
  panControls.enabled = false;

  return {
    orbitControls,
    panControls,
    updateControls() {
      if (orbitControls.enabled) orbitControls.update();
      if (panControls.enabled) panControls.update();
    },
    setMode(is3D: boolean) {
      orbitControls.enabled = is3D;
      panControls.enabled = !is3D;
    },
    dispose() {
      orbitControls.dispose();
      panControls.dispose();
    },
  };
}
