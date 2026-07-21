/* Вырезает из GLB всё, что лежит РЯДОМ с банкой (крышка, вторая банка):
   ось = вершина сопла (max Y), радиус — по верхней трети; треугольники,
   чей центроид дальше r*K от оси, удаляются из индексов. Работает с draco-GLB.
   Использование: node cut-cap.cjs in.glb out.glb [K=1.18] */
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'sharp') return function stub() { throw new Error('sharp disabled'); };
  return origLoad.apply(this, arguments);
};
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune, weld, draco } = require('@gltf-transform/functions');
const draco3d = require('draco3dgltf');

(async () => {
  const [, , inF, outF, kArg] = process.argv;
  const K = parseFloat(kArg || '1.18');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  const doc = await io.read(inF);
  let removed = 0;
  let kept = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      if (!pos || !idx) continue;
      const P = pos.getArray();
      const n = pos.getCount();
      let topY = -Infinity;
      let minY = Infinity;
      let ax = 0;
      let az = 0;
      for (let i = 0; i < n; i++) {
        const y = P[i * 3 + 1];
        if (y > topY) {
          topY = y;
          ax = P[i * 3];
          az = P[i * 3 + 2];
        }
        if (y < minY) minY = y;
      }
      const h = topY - minY;
      // радиус банки: по верхней трети, но с gap-детектом — если рядом стоит второй
      // предмет, между «своими» дистанциями и его дистанциями будет разрыв
      const ds = [];
      for (let i = 0; i < n; i++) {
        if (P[i * 3 + 1] > topY - h * 0.33) {
          ds.push(Math.hypot(P[i * 3] - ax, P[i * 3 + 2] - az));
        }
      }
      ds.sort((a, b) => a - b);
      let r = ds[ds.length - 1] || 0;
      for (let i = Math.floor(ds.length * 0.5); i < ds.length - 1; i++) {
        if (ds[i + 1] - ds[i] > Math.max(ds[i] * 0.3, h * 0.03)) {
          r = ds[i];
          break;
        }
      }
      const keepR = r * K;
      const I = idx.getArray();
      const out = [];
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t];
        const b = I[t + 1];
        const c = I[t + 2];
        const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
        const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
        if (Math.hypot(cx - ax, cz - az) <= keepR) {
          out.push(a, b, c);
          kept++;
        } else removed++;
      }
      idx.setArray(I instanceof Uint16Array ? Uint16Array.from(out) : Uint32Array.from(out));
    }
  }
  // без повторного draco: re-encode местами не читается three; вес дожмём позже на VPS
  await doc.transform(prune(), weld());
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
  }
  await io.write(outF, doc);
  const fs = require('fs');
  console.log('OK kept', kept, 'removed', removed, '→', (fs.statSync(outF).size / 1048576).toFixed(2), 'MB');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
