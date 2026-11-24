import { describe, expect, it } from 'vitest';
import { mywhooshFit } from '../fixtures/mywhoosh-fit.ts';
import { FIT_EPOCH_S, FitError, fitCrc, fixMyWhooshFit, parisOffsetS } from './fit.ts';

const read = (b: Uint8Array, at: number) => new DataView(b.buffer).getUint32(at, true);

describe('fixMyWhooshFit (D169)', () => {
  // Sortie du 24/11/2026, 07:59:29 UTC, 47 min : les valeurs fautives constatées dans l'export MyWhoosh.
  const start = Date.UTC(2026, 10, 24, 7, 59, 29) / 1000 - FIT_EPOCH_S;
  const end = start + 2820;
  const raw = mywhooshFit({ start, seconds: 2820, localTs: end + FIT_EPOCH_S });

  it('met session et activité à la fin et local_timestamp en époque FIT, heure de Paris', () => {
    const fix = fixMyWhooshFit(raw);
    expect(fix.changed).toEqual(['session.timestamp', 'activity.timestamp', 'activity.local_timestamp']);
    expect([fix.startUtc, fix.endUtc]).toEqual(['2026-11-24T07:59:29.000Z', '2026-11-24T08:46:29.000Z']);
    const size = fix.bytes.length;
    // Fin du fichier : … activité [timestamp, local_timestamp], CRC.
    expect(read(fix.bytes, size - 10)).toBe(end);
    expect(read(fix.bytes, size - 6)).toBe(end + 3600);
    expect(fitCrc(fix.bytes, size - 2)).toBe(new DataView(fix.bytes.buffer).getUint16(size - 2, true));
    expect(read(raw, size - 10)).toBe(start); // l'original n'est pas modifié
  });

  it('ne touche à rien quand le fichier est déjà correct', () => {
    const once = fixMyWhooshFit(raw).bytes;
    const again = fixMyWhooshFit(once);
    expect(again.changed).toEqual([]);
    expect(again.bytes).toEqual(once);
  });

  it('refuse un fichier qui n’est pas un FIT lisible', () => {
    expect(() => fixMyWhooshFit(Uint8Array.from('pas un fichier FIT', (c) => c.charCodeAt(0)))).toThrow(
      FitError,
    );
    const broken = Uint8Array.from(raw);
    broken[20] = broken[20]! ^ 0xff;
    expect(() => fixMyWhooshFit(broken)).toThrow(/CRC/);
  });

  it('heure de Paris : +1 h en hiver, +2 h en été', () => {
    expect(parisOffsetS(Date.UTC(2026, 10, 24) / 1000)).toBe(3600);
    expect(parisOffsetS(Date.UTC(2026, 6, 1) / 1000)).toBe(7200);
  });
});
