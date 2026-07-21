/* Пытаемся «надеть» отдельную чёрную крышку на баллон (композит). */
const sharp = require('sharp');
const path = require('path');
(async () => {
  const dir = path.join(__dirname, 'public', 'img');
  const src = path.join(dir, 'hero-1.webp');
  const m = await sharp(src).metadata();
  const W = m.width, H = m.height;
  console.log('hero-1', W, 'x', H);

  // 1) баллон (левая часть без отдельной крышки)
  const canW = Math.round(W * 0.58);
  const canBuf = await sharp(src).extract({ left: 0, top: 0, width: canW, height: H }).png().toBuffer();

  // 2) крышка (правый нижний чёрный цилиндр)
  const capL = Math.round(W * 0.66), capT = Math.round(H * 0.6), capW = Math.round(W * 0.32), capH = Math.round(H * 0.38);
  // подгоняем крышку по ширине корпуса баллона (~50% ширины кадра ≈ ширина банки)
  const targetCapW = Math.round(canW * 0.82);
  const capBuf = await sharp(src).extract({ left: capL, top: capT, width: capW, height: capH })
    .resize({ width: targetCapW }).png().toBuffer();
  const capMeta = await sharp(capBuf).metadata();

  // 3) накладываем крышку на верх баллона (поверх носика)
  const capX = Math.round(canW * 0.5 - capMeta.width / 2);
  const capY = Math.round(H * 0.02);
  const out = path.join(dir, 'flycan.webp');
  await sharp(canBuf)
    .composite([{ input: capBuf, left: Math.max(0, capX), top: Math.max(0, capY) }])
    .trim({ threshold: 6 })
    .webp({ quality: 92 })
    .toFile(out);
  const om = await sharp(out).metadata();
  console.log('flycan', om.width, 'x', om.height);
})().catch((e) => { console.error(e); process.exit(1); });
