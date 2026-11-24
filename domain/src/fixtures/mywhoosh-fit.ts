import { fitCrc } from '../actions/fit.ts';

/** FIT minimal comme ceux de MyWhoosh : enregistrements, session et activité horodatées au début. */
export function mywhooshFit(opts: { start: number; seconds: number; localTs: number }): Uint8Array {
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v: number) => out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  const def = (local: number, msg: number, fields: [number, number, number][]) => {
    out.push(0x40 | local, 0, 0);
    u16(msg);
    out.push(fields.length);
    for (const f of fields) out.push(...f);
  };
  def(0, 20, [
    [253, 4, 0x86],
    [3, 1, 0x02],
  ]);
  for (let t = 0; t <= opts.seconds; t += 60) {
    out.push(0);
    u32(opts.start + t);
    out.push(120);
  }
  def(1, 18, [
    [253, 4, 0x86],
    [2, 4, 0x86],
  ]);
  out.push(1);
  u32(opts.start);
  u32(opts.start);
  def(2, 34, [
    [253, 4, 0x86],
    [5, 4, 0x86],
  ]);
  out.push(2);
  u32(opts.start);
  u32(opts.localTs);
  const header = [14, 0x20, 0x08, 0x08, 0, 0, 0, 0, ...'.FIT'.split('').map((c) => c.charCodeAt(0)), 0, 0];
  const bytes = new Uint8Array(14 + out.length + 2);
  bytes.set(header);
  new DataView(bytes.buffer).setUint32(4, out.length, true);
  bytes.set(out, 14);
  new DataView(bytes.buffer).setUint16(14 + out.length, fitCrc(bytes, 14 + out.length), true);
  return bytes;
}
