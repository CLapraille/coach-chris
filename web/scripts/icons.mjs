// Génère les icônes de l'app (écran d'accueil du téléphone) : monogramme « CC » (Coach Chris) en lettrage de maillot, sur fond sombre.
// Usage : node web/scripts/icons.mjs — écrit web/public/icon-*.png et apple-touch-icon.png.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [13, 17, 23];
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
// Monogramme sur une grille 24 × 24, lettrage de maillot : deux « C » anguleux (octogones ouverts à droite)
// très penchés vers l'avant ; le premier, vert, est tranché par des entailles de vitesse qui se prolongent
// en traînées à gauche ; le second, clair, est détouré d'un liseré là où il passe devant. Marge « maskable ».
const SLANT = 0.38; // inclinaison vers la droite
const HALF = 4.6; // demi-hauteur d'une lettre
const CHAMFER = 2.2; // pan coupé des angles
const STROKE = 1.65; // demi-épaisseur du trait
const KNOCK = 2.4; // rayon du liseré de fond autour du second C
const C1 = [8.4, 12];
const C2 = [16.8, 12];
const CUTS = [8.4, 11.9, 15.4]; // entailles horizontales (y)
const CUT_W = 0.3;
const TRAIL_START = [0.8, -0.4, 0.8]; // début des traînées, par entaille

/** Tracé d'un « C » de maillot : octogone ouvert à droite. */
function blockC([cx, cy]) {
  const h = HALF,
    c = CHAMFER;
  return [
    [cx + h, cy - h],
    [cx - h + c, cy - h],
    [cx - h, cy - h + c],
    [cx - h, cy + h - c],
    [cx - h + c, cy + h],
    [cx + h, cy + h],
  ];
}
const poly = (x, y, pts) =>
  Math.min(...pts.slice(1).map((p, i) => seg(x, y, pts[i][0], pts[i][1], p[0], p[1])));
const C1_PATH = blockC(C1);
const C2_PATH = blockC(C2);

/** Couleur d'un point en coordonnées unitaires (0..1). */
function shade(u, v) {
  const k = 0.72,
    y = ((v - 0.5) / k + 0.5) * 24,
    x = ((u - 0.5) / k + 0.5) * 24 + SLANT * (y - 12) - 0.2; // redresse l'italique, recentre
  const inCut = CUTS.some((b) => Math.abs(y - b) < CUT_W);
  const d2 = poly(x, y, C2_PATH);
  const d1 = poly(x, y, C1_PATH);
  if (inCut && x < 7.2 && (d1 < STROKE || d2 < STROKE)) return BG;
  if (d2 < STROKE) return FG;
  if (d1 < STROKE) return d2 < KNOCK ? BG : GOOD;
  if (CUTS.some((b, i) => Math.abs(y - b) < CUT_W && x > TRAIL_START[i] && x < 2.8)) return GOOD;
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
