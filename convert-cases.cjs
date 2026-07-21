/* Конвертация фото кейсов и pack в WebP (≤1000px, q82). */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'public', 'img');

(async () => {
  for (const f of fs.readdirSync(dir)) {
    if (!/^(case-|pack)/.test(f)) continue;
    if (!/\.(jpe?g|png)$/i.test(f)) continue;
    const out = path.join(dir, f.replace(/\.(jpe?g|png)$/i, '.webp'));
    await sharp(path.join(dir, f))
      .resize({ width: 1000, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(out);
    console.log(f, '->', path.basename(out));
  }
})().catch((e) => { console.error(e); process.exit(1); });
