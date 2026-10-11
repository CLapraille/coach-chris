// Génère les icônes de l'app (écran d'accueil du téléphone) : monogramme « CC » (Coach Chris) en italique sportive, sur fond sombre.
// Usage : node web/scripts/icons.mjs — écrit web/public/icon-*.png et apple-touch-icon.png.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [13, 17, 23];
const RING = [74, 88, 104];
const GOOD = [108, 192, 139];
const FG = [229, 233, 239];

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
// Monogramme sur une grille 24 × 24 : deux « C » épais penchés vers l'avant (italique sportive), le second
// entrelacé dans l'ouverture du premier, avec des traits de vitesse. Marge des icônes « maskable » respectée.
const SLANT = 0.22; // inclinaison vers la droite
const C_R = 4.9; // rayon de la lettre
const C_W = 1.4; // demi-épaisseur du trait
const C_GAP = (48 * Math.PI) / 180; // demi-ouverture du C, côté droit
const C1 = [8.2, 12];
const C2 = [16.6, 12];
const KNOCK = 0.75; // liseré de fond autour du second C, là où il passe sur le premier
const SPEED = [
  [
    [0.4, 8.6],
    [2.2, 8.6],
  ],
  [
    [0, 12],
    [2.2, 12],
  ],
  [
    [0.4, 15.4],
    [2.2, 15.4],
  ],
];

/** Distance au tracé d'un « C » (arc ouvert à droite, bouts arrondis). */
function cDist(x, y, [cx, cy]) {
  const dx = x - cx,
    dy = y - cy;
  const ang = Math.abs(Math.atan2(dy, dx)); // 0 = droite
  if (ang > C_GAP) return Math.abs(Math.hypot(dx, dy) - C_R);
  const ex = cx + C_R * Math.cos(C_GAP),
    ey = C_R * Math.sin(C_GAP);
  return Math.min(Math.hypot(x - ex, y - (cy - ey)), Math.hypot(x - ex, y - (cy + ey)));
}

/** Couleur d'un point en coordonnées unitaires (0..1). */
function shade(u, v) {
  const k = 0.7,
    y = ((v - 0.5) / k + 0.5) * 24,
    x = ((u - 0.5) / k + 0.5) * 24 + SLANT * (y - 12) - 0.8; // redresse l'italique, recentre
  const d2 = cDist(x, y, C2);
  if (d2 < C_W) return FG;
  if (cDist(x, y, C1) < C_W) return d2 < C_W + KNOCK ? BG : GOOD;
  const near = SPEED.some(([p, q]) => seg(x - SLANT * (y - 12), y, p[0], p[1], q[0], q[1]) < 0.55);
  return near ? RING : BG;
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
