/* Диагностика: где ось, какой разброс расстояний в модели */
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'sharp') return function stub() {};
  return origLoad.apply(this, arguments);
};
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const draco3d = require('draco3dgltf');
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });
  const doc = await io.read(process.argv[2]);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION').getArray();
      const n = P.length / 3;
      let topY = -Infinity, minY = Infinity, ax = 0, az = 0;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        if (y > topY) { topY = y; ax = x; az = z; }
        if (y < minY) minY = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const h = topY - minY;
      console.log('verts', n, '| bboxX', minX.toFixed(2), maxX.toFixed(2), '| bboxZ', minZ.toFixed(2), maxZ.toFixed(2), '| Y', minY.toFixed(2), topY.toFixed(2));
      console.log('axis(top):', ax.toFixed(3), az.toFixed(3));
      // гистограмма дистанций в верхней трети от оси
      const hist = new Array(12).fill(0);
      let dmax = 0;
      const ds = [];
      for (let i = 0; i < n; i++) {
        if (P[i * 3 + 1] > topY - h * 0.33) {
          const d = Math.hypot(P[i * 3] - ax, P[i * 3 + 2] - az);
          ds.push(d);
          if (d > dmax) dmax = d;
        }
      }
      for (const d of ds) hist[Math.min(11, Math.floor((d / dmax) * 12))]++;
      console.log('topThird verts', ds.length, 'dmax', dmax.toFixed(3));
      console.log('hist:', hist.join(' '));
    }
  }
})().catch((e) => console.error('ERR', e.message));
