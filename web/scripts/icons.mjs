// Génère les icônes de l'app (écran d'accueil du téléphone) : coureur vert en pleine foulée, sur fond sombre.
// Usage : node web/scripts/icons.mjs — écrit web/public/icon-*.png et apple-touch-icon.png.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [13, 17, 23];
const RING = [74, 88, 104];
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
// Coureur dessiné sur une grille 24 × 24 (traits arrondis), centré avec la marge des icônes « maskable ».
const HEAD = [15.4, 4.9, 2.3];
const LIMBS = [
  [
    [13.6, 8],
    [11, 13.4],
  ], // buste
  [
    [12.9, 9.4],
    [9.4, 11.2],
    [7, 9.6],
  ], // bras arrière
  [
    [12.9, 9.4],
    [15.6, 12],
    [18.6, 10.8],
  ], // bras avant
  [
    [11, 13.4],
    [14.4, 15.8],
    [13.4, 21],
  ], // jambe avant
  [
    [11, 13.4],
    [8.6, 17.4],
    [4.6, 18.2],
  ], // jambe arrière
];
const SPEED = [
  [
    [2.2, 8.6],
    [4.6, 8.6],
  ],
  [
    [1.4, 12],
    [5.2, 12],
  ],
  [
    [2.2, 15.4],
    [4.6, 15.4],
  ],
];
const STROKE = 1.25; // demi-épaisseur, en unités de la grille

/** Couleur d'un point en coordonnées unitaires (0..1). */
function shade(u, v) {
  // Zone sûre des icônes « maskable » : le dessin tient dans les 66 % centraux.
  const k = 0.66,
    x = ((u - 0.5) / k + 0.5) * 24,
    y = ((v - 0.5) / k + 0.5) * 24;
  if (Math.hypot(x - HEAD[0], y - HEAD[1]) < HEAD[2]) return GOOD;
  const near = (lines, w) =>
    lines.some((pts) => pts.slice(1).some((p, i) => seg(x, y, pts[i][0], pts[i][1], p[0], p[1]) < w));
  if (near(LIMBS, STROKE)) return GOOD;
  if (near(SPEED, 0.55)) return RING;
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
