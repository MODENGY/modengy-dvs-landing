/* Отрезаем отдельную крышку — оставляем только баллон (левая часть кадра). */
const sharp = require('sharp');
const path = require('path');
(async () => {
  const src = path.join(__dirname, 'public', 'img', 'hero-1.webp');
  const m = await sharp(src).metadata();
  const w = Math.round(m.width * 0.6); // левые 60% = баллон без крышки
  await sharp(src)
    .extract({ left: 0, top: 0, width: w, height: m.height })
    .trim({ threshold: 5 })
    .webp({ quality: 92 })
    .toFile(path.join(__dirname, 'public', 'img', 'flycan.webp'));
  const om = await sharp(path.join(__dirname, 'public', 'img', 'flycan.webp')).metadata();
  console.log('flycan', om.width, 'x', om.height);
})().catch((e) => { console.error(e); process.exit(1); });
