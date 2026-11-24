/**
 * Correction d'un FIT d'activité exporté par MyWhoosh avant son envoi à Garmin Connect (D169), en mémoire.
 *
 * MyWhoosh écrit (constaté le 24/11/2026) : l'horodatage de la session et de l'activité au début de la sortie
 * au lieu de la fin, et `activity.local_timestamp` en époque Unix au lieu de l'époque FIT (≈ 20 ans d'écart).
 * Garmin Connect refuse alors l'import. On réécrit ces trois valeurs en place (mêmes tailles, mêmes définitions)
 * à partir du dernier enregistrement, puis on recalcule les CRC. Rien d'autre n'est touché.
 */

/** Secondes entre l'époque Unix et l'époque FIT (31/12/1989 00:00 UTC). */
export const FIT_EPOCH_S = 631065600;

const MSG = { session: 18, record: 20, activity: 34 } as const;
const FIELD_TIMESTAMP = 253;
const FIELD_LOCAL_TIMESTAMP = 5;

export class FitError extends Error {}

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000,
  0x9c01, 0x8801, 0x4400,
];

export function fitCrc(bytes: Uint8Array, end = bytes.length): number {
  let crc = 0;
  for (let i = 0; i < end; i++) {
    const b = bytes[i]!;
    let t = CRC_TABLE[crc & 0xf]!;
    crc = ((crc >> 4) & 0x0fff) ^ t ^ CRC_TABLE[b & 0xf]!;
    t = CRC_TABLE[crc & 0xf]!;
    crc = ((crc >> 4) & 0x0fff) ^ t ^ CRC_TABLE[(b >> 4) & 0xf]!;
  }
  return crc;
}

/** Décalage de l'heure de Paris à un instant donné, en secondes (3600 en hiver, 7200 en été). */
export function parisOffsetS(unixS: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(unixS * 1000));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) / 1000;
  return local - unixS;
}

interface Spot {
  msg: number;
  field: number;
  offset: number;
  little: boolean;
}

export interface FitFix {
  bytes: Uint8Array;
  /** Début et fin de la sortie, ISO UTC, lus dans les enregistrements. */
  startUtc: string;
  endUtc: string;
  /** Champs réécrits, pour le journal (« session.timestamp », …). */
  changed: string[];
}

const iso = (fitS: number) => new Date((fitS + FIT_EPOCH_S) * 1000).toISOString();

/** Corrige un FIT d'activité MyWhoosh ; lève FitError si le fichier n'est pas un FIT d'activité lisible. */
export function fixMyWhooshFit(input: Uint8Array): FitFix {
  const bytes = Uint8Array.from(input);
  const view = new DataView(bytes.buffer);
  if (bytes.length < 14) throw new FitError('Fichier FIT trop court');
  const headerSize = bytes[0]!;
  if (headerSize < 12 || String.fromCharCode(...bytes.subarray(8, 12)) !== '.FIT') {
    throw new FitError('Ce n’est pas un fichier FIT');
  }
  const dataSize = view.getUint32(4, true);
  const end = headerSize + dataSize;
  if (end + 2 > bytes.length) throw new FitError('Fichier FIT tronqué');
  if (fitCrc(bytes, end) !== view.getUint16(end, true)) throw new FitError('Fichier FIT corrompu (CRC)');

  const defs = new Map<number, { msg: number; little: boolean; fields: [number, number][]; size: number }>();
  const spots: Spot[] = [];
  let firstRecord: number | undefined;
  let lastRecord: number | undefined;
  let pos = headerSize;
  while (pos < end) {
    const h = bytes[pos++]!;
    if (h & 0x80) {
      // En-tête à horodatage compressé : message de données de la définition locale (bits 5-6).
      const d = defs.get((h >> 5) & 0x3);
      if (!d) throw new FitError('Message sans définition');
      pos += d.size;
      continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) {
      const little = bytes[pos + 1] === 0;
      const msg = view.getUint16(pos + 2, little);
      const count = bytes[pos + 4]!;
      pos += 5;
      const fields: [number, number][] = [];
      for (let i = 0; i < count; i++, pos += 3) fields.push([bytes[pos]!, bytes[pos + 1]!]);
      let dev = 0;
      if (h & 0x20) {
        const devCount = bytes[pos++]!;
        for (let i = 0; i < devCount; i++, pos += 3) dev += bytes[pos + 1]!;
      }
      defs.set(local, { msg, little, fields, size: fields.reduce((s, [, sz]) => s + sz, 0) + dev });
      continue;
    }
    const d = defs.get(local);
    if (!d) throw new FitError('Message sans définition');
    let off = pos;
    for (const [field, size] of d.fields) {
      if (size === 4) {
        if (d.msg === MSG.record && field === FIELD_TIMESTAMP) {
          const ts = view.getUint32(off, d.little);
          firstRecord ??= ts;
          lastRecord = ts;
        }
        const wanted =
          ((d.msg === MSG.session || d.msg === MSG.activity) && field === FIELD_TIMESTAMP) ||
          (d.msg === MSG.activity && field === FIELD_LOCAL_TIMESTAMP);
        if (wanted) spots.push({ msg: d.msg, field, offset: off, little: d.little });
      }
      off += size;
    }
    pos += d.size;
  }
  if (firstRecord === undefined || lastRecord === undefined) {
    throw new FitError('Aucun enregistrement dans le fichier : ce n’est pas une sortie');
  }

  const names: Record<string, string> = {
    [`${MSG.session}:${FIELD_TIMESTAMP}`]: 'session.timestamp',
    [`${MSG.activity}:${FIELD_TIMESTAMP}`]: 'activity.timestamp',
    [`${MSG.activity}:${FIELD_LOCAL_TIMESTAMP}`]: 'activity.local_timestamp',
  };
  const localEnd = lastRecord + parisOffsetS(lastRecord + FIT_EPOCH_S);
  const changed: string[] = [];
  for (const s of spots) {
    const value = s.field === FIELD_LOCAL_TIMESTAMP ? localEnd : lastRecord;
    if (view.getUint32(s.offset, s.little) === value) continue;
    view.setUint32(s.offset, value, s.little);
    changed.push(names[`${s.msg}:${s.field}`]!);
  }
  // L'en-tête ne change pas (même taille de données) : seul le CRC de fin est à recalculer.
  if (changed.length) view.setUint16(end, fitCrc(bytes, end), true);
  return { bytes, startUtc: iso(firstRecord), endUtc: iso(lastRecord), changed };
}
