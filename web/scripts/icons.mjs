// Génère les icônes de l'app (écran d'accueil du téléphone) : jauge verte ouverte et coche, sur fond sombre.
// Usage : node web/scripts/icons.mjs — écrit web/public/icon-*.png et apple-touch-icon.png.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [13, 17, 23];
const RING = [42, 52, 64];
const GOOD = [108, 192, 139];

function crc32(buf) {
  let c,
    crc = ~0;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distance d'un point au segment [a, b]. */
function seg(x, y, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

/** Couleur d'un point en coordonnées unitaires (0..1) : fond, anneau, arc de jauge (75 %), coche. */
function shade(u, v) {
  const x = u - 0.5,
    y = v - 0.5;
  const r = Math.hypot(x, y);
  const ringR = 0.27,
    ringW = 0.05;
  const onRing = Math.abs(r - ringR) < ringW / 2;
  // Angle depuis le haut, sens horaire, 0..1.
  const a = (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1;
  const check = Math.min(seg(u, v, 0.4, 0.51, 0.47, 0.58), seg(u, v, 0.47, 0.58, 0.61, 0.43)) < 0.027;
  if (check) return GOOD;
  if (onRing) return a < 0.75 ? GOOD : RING;
  return BG;
}

function render(size) {
  const px = Buffer.alloc(size * size * 3);
  const S = 4; // suréchantillonnage pour lisser les bords
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
          const c = shade((x + (i + 0.5) / S) / size, (y + (j + 0.5) / S) / size);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      const o = (y * size + x) * 3;
      for (let k = 0; k < 3; k++) px[o + k] = Math.round(acc[k] / (S * S));
    }
  return png(size, px);
}

const out = new URL('../public/', import.meta.url);
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(new URL(name, out), render(size));
}
