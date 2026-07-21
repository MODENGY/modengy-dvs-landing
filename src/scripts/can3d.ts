/* Настоящий 3D-баллон (three.js): грузит draco-GLB, крутит по Y+Z, ловит студийный свет.
   Ленивая загрузка (dynamic import) только у секции кейсов. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Can3D {
  setRotationY: (r: number) => void;
  setActive: (a: boolean) => void;
  resize: () => void;
  dispose: () => void;
}

export interface Can3DOpts {
  idle?: boolean; // зацикленное покачивание + парение (без скролла)
  drag?: boolean; // можно крутить мышкой
  scale?: number; // размер модели в кадре (меньше = больше запас от краёв)
  soft?: boolean; // мягкий матовый рендер — скрывает потёртости текстуры
  dropY?: number; // вертикальный сдвиг модели в кадре (минус = ниже)
  stroke?: boolean; // режим «ход поршня»: непрерывное вращение + ход вверх-вниз
  axis?: 'y' | 'x'; // ось stroke-вращения: 'x' — горизонтальная (коленвал)
  onLoaded?: () => void;
  onError?: () => void; // модель не загрузилась (404) — можно спрятать канвас
}

export function initCan3D(canvas: HTMLCanvasElement, modelUrl: string, dracoPath: string, opts: Can3DOpts = {}): Can3D {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.38;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 6.5);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

  const key = new THREE.DirectionalLight(0xffffff, 3.3);
  key.position.set(3, 6, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.25); // этикетка читается
  fill.position.set(0, 1, 7);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd08a, 1.8); // тёплый контровой — премиальный блик
  rim.position.set(-5, 2, -4);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));

  const group = new THREE.Group();
  scene.add(group);
  const spin = new THREE.Group(); // вращается по Y+Z
  group.add(spin);

  let active = false;
  let raf = 0;
  let disposed = false;
  let loaded = false;
  let targetRY = 0;
  let curRY = 0;
  let t = 0;
  let dragOff = 0; // пользовательский поворот (drag), плавно затухает к лицевой стороне
  let dragging = false;
  let lastX = 0;

  if (opts.drag) {
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      dragOff += dx * 0.01;
    });
    const end = () => (dragging = false);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

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
      // чуть приглушим металличность материала-по-умолчанию (Tripo = metal 1.0 → хром);
      // soft — матовее и мягче, потёртости текстуры почти не бликуют
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (mat && 'metalness' in mat) {
          mat.metalness = opts.soft ? 0.12 : 0.35;
          mat.roughness = opts.soft ? 0.72 : Math.max(mat.roughness ?? 0.5, 0.5);
          mat.envMapIntensity = opts.soft ? 0.55 : 0.8;
        }
      });
      const s = (opts.scale ?? 2.5) / Math.max(size.x, size.y, size.z); // запас: при наклоне Z не режется краями канваса
      obj.scale.setScalar(s);
      spin.add(obj);
      loaded = true;
      draco.dispose();
      render();
      opts.onLoaded?.();
    },
    undefined,
    (err) => {
      console.warn('[can3d] load error', err);
      opts.onError?.();
    }
  );

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width && r.height) {
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      render();
    }
  }
  resize();
  // РАЗ И НАВСЕГДА против обрезки: канвас изменил размер (загрузилась картинка,
  // перестроился layout) → пересчитываем буфер и пропорции камеры автоматически
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  function render() {
    renderer.render(scene, camera);
  }
  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    if (!active || document.hidden || !loaded) return;
    if (opts.stroke) {
      // «ход поршня»/«коленвал»: непрерывное вращение (ось по opts.axis) + ход вверх-вниз
      t += 0.016;
      if (!dragging) dragOff *= 0.99;
      curRY += 0.007;
      if (opts.axis === 'x') {
        spin.rotation.x = curRY + dragOff; // коленвал крутится вокруг горизонтальной оси
        spin.position.y = opts.dropY ?? 0;
      } else {
        spin.rotation.y = curRY + dragOff;
        spin.position.y = (opts.dropY ?? -0.05) + Math.sin(t * 1.9) * 0.26;
      }
    } else if (opts.idle) {
      // зацикленно: покачивание ЛИЦЕВОЙ стороной (зад с кривым текстом не показываем) + парение
      t += 0.016;
      if (!dragging) dragOff *= 0.985; // после drag плавно возвращается лицом
      curRY = Math.sin(t * 0.5) * 0.7 + dragOff;
      spin.rotation.y = curRY;
      spin.rotation.z = Math.sin(t * 0.7) * 0.1;
      spin.position.y = (opts.dropY ?? -0.27) + Math.sin(t * 1.05) * 0.05; // банка ниже в кадре
    } else {
      curRY += (targetRY - curRY) * 0.1;
      spin.rotation.y = curRY;
      spin.rotation.z = Math.sin(curRY * 1.4) * 0.35; // наклон по Z в такт покачиванию
    }
    render();
  }
  loop();

  return {
    setRotationY: (r) => (targetRY = r),
    setActive: (a) => {
      active = a;
      if (a && loaded) render();
    },
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
