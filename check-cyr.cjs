/* Проверяет, есть ли кириллица в TTF: читает cmap и ищет U+0410 (А), U+0430 (а), U+0451 (ё) */
const fs = require('fs');

function hasGlyphs(file, codes) {
  const b = fs.readFileSync(file);
  const numTables = b.readUInt16BE(4);
  let cmapOff = 0;
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    if (b.toString('ascii', p, p + 4) === 'cmap') cmapOff = b.readUInt32BE(p + 8);
  }
  if (!cmapOff) return null;
  const nSub = b.readUInt16BE(cmapOff + 2);
  const found = new Set();
  for (let i = 0; i < nSub; i++) {
    const rec = cmapOff + 4 + i * 8;
    const sub = cmapOff + b.readUInt32BE(rec + 4);
    const fmt = b.readUInt16BE(sub);
    if (fmt === 4) {
      const segX2 = b.readUInt16BE(sub + 6);
      const endBase = sub + 14;
      const startBase = endBase + segX2 + 2;
      const deltaBase = startBase + segX2;
      const rangeBase = deltaBase + segX2;
      for (const c of codes) {
        for (let s = 0; s < segX2 / 2; s++) {
          const end = b.readUInt16BE(endBase + s * 2);
          const start = b.readUInt16BE(startBase + s * 2);
          if (c >= start && c <= end) {
            const delta = b.readInt16BE(deltaBase + s * 2);
            const ro = b.readUInt16BE(rangeBase + s * 2);
            let gid;
            if (ro === 0) gid = (c + delta) & 0xffff;
            else {
              const gi = rangeBase + s * 2 + ro + (c - start) * 2;
              gid = gi + 1 < b.length ? b.readUInt16BE(gi) : 0;
              if (gid) gid = (gid + delta) & 0xffff;
            }
            if (gid) found.add(c);
            break;
          }
        }
      }
    } else if (fmt === 12) {
      const nGroups = b.readUInt32BE(sub + 12);
      for (let g = 0; g < nGroups; g++) {
        const go = sub + 16 + g * 12;
        const s = b.readUInt32BE(go);
        const e = b.readUInt32BE(go + 4);
        for (const c of codes) if (c >= s && c <= e) found.add(c);
      }
    }
  }
  return found;
}

const codes = [0x0410, 0x0430, 0x0451, 0x0041]; // А, а, ё, A
for (const f of process.argv.slice(2)) {
  const found = hasGlyphs(f, codes);
  const names = { 0x0410: 'А', 0x0430: 'а', 0x0451: 'ё', 0x0041: 'A' };
  const res = codes.map((c) => `${names[c]}:${found && found.has(c) ? 'ДА' : 'НЕТ'}`).join(' ');
  console.log(f.split(/[\\/]/).pop().padEnd(26), res);
}
