import * as THREE from 'three';
import { buildScene, disposeSharedMaterials, updateEdgeColor } from './sceneBuilder';
import type { SceneHandle, RenderMode } from './sceneBuilder';
import { createControls } from './controls';
import { setupPicker, disposeHighlightMaterial, setHighlightWireframe } from './picker';
import type { PickerHandle } from './picker';
import type { ExtToWebMsg, ParsedScene } from '../types';
import { parseGML } from '../gmlParser';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

// ----- Renderer -----
const container = document.getElementById('canvas-container') as HTMLElement;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// ----- Scene & Lights -----
const scene = new THREE.Scene();
const bgDark = new THREE.Color(0x1e1e1e);
const bgLight = new THREE.Color(0xffffff);
scene.background = bgDark;
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(500, 800, 500);
scene.add(dirLight);

// ----- Cameras -----
const aspect = container.clientWidth / container.clientHeight;
const perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
perspCamera.position.set(0, -600, 400);
perspCamera.lookAt(0, 0, 0);
perspCamera.up.set(0, 0, 1);

const orthoSize = 700;
const orthoCamera = new THREE.OrthographicCamera(
  -orthoSize * aspect, orthoSize * aspect,
  orthoSize, -orthoSize,
  0.1, 10000
);
orthoCamera.position.set(0, 0, 2000);
orthoCamera.lookAt(0, 0, 0);
orthoCamera.up.set(0, 1, 0);

let activeCamera: THREE.Camera = perspCamera;
let is3D = true;

// ----- Controls -----
const controls = createControls(perspCamera, orthoCamera, renderer.domElement);

// ----- Scene / picker handles (replaced on each file load) -----
let sceneHandle: SceneHandle | null = null;
let pickerHandle: PickerHandle | null = null;

// ----- Animate -----
let rafId = 0;
function animate() {
  rafId = requestAnimationFrame(animate);
  controls.updateControls();
  renderer.render(scene, activeCamera);
}
animate();

// ----- Resize -----
window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h);
  const a = w / h;
  perspCamera.aspect = a;
  perspCamera.updateProjectionMatrix();
  orthoCamera.left   = -orthoSize * a;
  orthoCamera.right  =  orthoSize * a;
  orthoCamera.updateProjectionMatrix();
});

// ----- View toggle -----
const btnToggle = document.getElementById('btn-toggle-view') as HTMLButtonElement;
btnToggle.addEventListener('click', () => {
  is3D = !is3D;
  activeCamera = is3D ? perspCamera : orthoCamera;
  controls.setMode(is3D);
  btnToggle.textContent = is3D ? 'Top-Down View' : '3D Perspective View';
});

// ----- Reset camera -----
const btnReset = document.getElementById('btn-reset-camera') as HTMLButtonElement;
btnReset.addEventListener('click', () => {
  if (is3D) {
    perspCamera.position.set(0, -600, 400);
    perspCamera.lookAt(0, 0, 0);
    controls.orbitControls.target.set(0, 0, 0);
    controls.orbitControls.update();
  } else {
    orthoCamera.position.set(0, 0, 2000);
    orthoCamera.lookAt(0, 0, 0);
    controls.panControls.target.set(0, 0, 0);
    controls.panControls.update();
  }
});

// ----- Open as text -----
const btnOpenText = document.getElementById('btn-open-text') as HTMLButtonElement;
btnOpenText.addEventListener('click', () => {
  vscode.postMessage({ type: 'openAsText' });
});

// ----- Background toggle -----
let isDark = true;
const btnBg = document.getElementById('btn-toggle-bg') as HTMLButtonElement;
btnBg.addEventListener('click', () => {
  isDark = !isDark;
  scene.background = isDark ? bgDark : bgLight;
  document.body.classList.toggle('light', !isDark);
  updateEdgeColor(isDark);
  btnBg.textContent = isDark ? 'White Background' : 'Dark Background';
});

// ----- Render mode -----
let currentMode: RenderMode = 'surface';
const modeButtons: Record<RenderMode, HTMLButtonElement> = {
  surface:   document.getElementById('btn-mode-surface')!   as HTMLButtonElement,
  wireframe: document.getElementById('btn-mode-wireframe')! as HTMLButtonElement,
  edges:     document.getElementById('btn-mode-edges')!     as HTMLButtonElement,
};

function applyRenderMode(mode: RenderMode) {
  currentMode = mode;
  for (const m of ['surface', 'wireframe', 'edges'] as const) {
    modeButtons[m].classList.toggle('active', m === mode);
  }
  sceneHandle?.setRenderMode(mode);
  setHighlightWireframe(mode === 'wireframe');
}

for (const mode of ['surface', 'wireframe', 'edges'] as const) {
  modeButtons[mode].addEventListener('click', () => applyRenderMode(mode));
}

// ----- Scene loading -----
function loadScene(parsedScene: ParsedScene) {
  pickerHandle?.dispose();
  pickerHandle = null;
  sceneHandle?.dispose();
  sceneHandle = null;

  const loadingEl = document.getElementById('loading-msg');
  if (loadingEl) loadingEl.style.display = 'none';

  sceneHandle = buildScene(parsedScene, scene);
  sceneHandle.setRenderMode(currentMode);

  pickerHandle = setupPicker(
    renderer, sceneHandle, scene, () => activeCamera,
    (buildingId, objectClass, attributes) => {
      showInfo(buildingId, objectClass, attributes);
      vscode.postMessage({ type: 'selectBuilding', buildingId });
    },
    () => {
      document.getElementById('info-panel')!.style.display = 'none';
    }
  );
}

function showInfo(id: string, objectClass: string, attrs: Record<string, string>) {
  const panel = document.getElementById('info-panel')!;
  const content = document.getElementById('info-content')!;
  const badge = `<span class="type-badge type-${objectClass}">${objectClass}</span>`;
  let html = `<div class="id-label">${escHtml(id)}${badge}</div><hr>`;
  for (const [k, v] of Object.entries(attrs)) {
    html += `<div class="attr-row"><span class="attr-key">${escHtml(k)}:</span><span class="attr-val">${escHtml(v)}</span></div>`;
  }
  content.innerHTML = html;
  panel.style.display = 'block';
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ----- Page teardown -----
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(rafId);
  pickerHandle?.dispose();
  sceneHandle?.dispose();
  controls.dispose();
  disposeSharedMaterials();
  disposeHighlightMaterial();
  renderer.dispose();
});

// ----- Messages from extension -----
function showError(msg: string) {
  const loadingEl = document.getElementById('loading-msg');
  if (loadingEl) {
    loadingEl.textContent = `Error: ${msg}`;
    loadingEl.style.color = '#f48771';
  }
}

window.addEventListener('message', (event) => {
  const msg = event.data as ExtToWebMsg;
  if (msg.type === 'loadFile') {
    fetch(msg.uri)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(text => {
        const parsed = parseGML(text);
        loadScene(parsed);
      })
      .catch(() => showError('Failed to load file'));
  } else if (msg.type === 'error') {
    showError(msg.message);
  }
});

// Signal ready to extension host
vscode.postMessage({ type: 'ready' });
