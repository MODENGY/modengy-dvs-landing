/* Сжатие поршня без sharp (Application Control блокирует нативные DLL):
   weld + simplify (meshoptimizer wasm) + draco (wasm). Текстуры не трогаем. */
// sharp заблокирован политикой Windows → подменяем заглушкой (он нужен только для resize текстур)
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'sharp') return function stub() { throw new Error('sharp disabled'); };
  return origLoad.apply(this, arguments);
};
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplify, draco } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const draco3d = require('draco3dgltf');

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  const doc = await io.read('piston-src.glb');
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.12, error: 0.001 }),
    draco()
  );
  await io.write('public/models/piston.glb', doc);
  const fs = require('fs');
  console.log('OK', (fs.statSync('public/models/piston.glb').size / 1048576).toFixed(2), 'MB');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
