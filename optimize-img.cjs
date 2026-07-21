/* Одноразовая оптимизация: PNG -> WebP (max 1200px, q80) */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'public', 'img');

(async () => {
  let total = 0, totalOut = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.png')) continue;
    const src = path.join(dir, f);
    const out = src.replace(/\.png$/, '.webp');
    const inSize = fs.statSync(src).size;
    await sharp(src)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80, alphaQuality: 90 })
      .toFile(out);
    const outSize = fs.statSync(out).size;
    total += inSize; totalOut += outSize;
    console.log(`${f}: ${(inSize / 1024).toFixed(0)}KB -> ${(outSize / 1024).toFixed(0)}KB`);
  }
  console.log(`TOTAL: ${(total / 1024).toFixed(0)}KB -> ${(totalOut / 1024).toFixed(0)}KB`);
})().catch((e) => { console.error(e); process.exit(1); });
