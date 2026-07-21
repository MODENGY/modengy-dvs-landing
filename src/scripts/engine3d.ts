/* Настоящий 3D-двигатель (three.js): draco-GLB, медленное авто-вращение + drag.
   Проецирует якоря узлов в 2D → жёлтые HTML-точки поверх канваса.
   Ленивая загрузка (dynamic import) только у секции «Применение». */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface EngineAnchor {
  slug: string;
  pos: [number, number, number]; // в юнитах нормализованной модели (max габарит ≈ 3)
}
export interface Engine3D {
  setActive: (a: boolean) => void;
  resize: () => void;
  dispose: () => void;
}

export function initEngine3D(
  canvas: HTMLCanvasElement,
  modelUrl: string,
  dracoPath: string,
  anchors: EngineAnchor[],
  onProject: (slug: string, x: number, y: number, visible: boolean) => void
): Engine3D {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.4, 6.2);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(4, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd08a, 1.2);
  rim.position.set(-5, 2, -4);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const spin = new THREE.Group();
  scene.add(spin);

  let active = false;
  let raf = 0;
  let disposed = false;
  let loaded = false;
  let rotY = -0.5;
  let vel = 0.0035; // авто-вращение
  let dragging = false;
  let lastX = 0;

  const draco = new DRACOLoader().setDecoderPath(dracoPath);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  loader.load(
    modelUrl,
    (gltf) => {
      const obj = gltf.scene;
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center);
      const s = 3.0 / Math.max(size.x, size.y, size.z);
      obj.scale.setScalar(s);
      obj.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mat && 'metalness' in mat) {
          mat.metalness = Math.min(mat.metalness ?? 0.5, 0.55);
          mat.roughness = Math.max(mat.roughness ?? 0.5, 0.45);
        }
      });
      spin.add(obj);
      loaded = true;
      draco.dispose();
    },
    undefined,
    (err) => console.warn('[engine3d] load error', err)
  );

  // drag-поворот
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    rotY += dx * 0.008;
    vel = dx * 0.0006; // инерция
  });
  const endDrag = () => (dragging = false);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width && r.height) {
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    }
  }
  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  const v = new THREE.Vector3();
  function project() {
    const r = canvas.getBoundingClientRect();
    for (const a of anchors) {
      v.set(a.pos[0], a.pos[1], a.pos[2]);
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY); // поворот вместе с моделью
      const front = v.z > -0.35; // точка на видимой полусфере
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * r.width;
      const y = (-v.y * 0.5 + 0.5) * r.height;
      onProject(a.slug, x, y, front);
    }
  }

  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    if (!active || document.hidden || !loaded) return;
    if (!dragging) {
      rotY += vel;
      // авто-вращение затухает к базовому
      vel += (0.0035 - vel) * 0.02;
    }
    spin.rotation.y = rotY;
    renderer.render(scene, camera);
    project();
  }
  loop();

  return {
    setActive: (a) => (active = a),
    resize,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      pmrem.dispose();
    },
  };
}
