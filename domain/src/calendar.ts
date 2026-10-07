/** Dates calendaires au format ISO `AAAA-MM-JJ`, sans fuseau : la semaine commence le lundi (D6). */

function parse(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Date attendue au format AAAA-MM-JJ : ${day}`);
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day)
    throw new Error(`Date invalide : ${day}`);
  return d;
}

export function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la semaine qui contient `day`. */
export function mondayOf(day: string): string {
  const offset = (parse(day).getUTCDay() + 6) % 7; // lundi = 0
  return addDays(day, -offset);
}

/** Les 7 jours (lundi → dimanche) de la semaine qui contient `day`. */
export function weekDays(day: string): string[] {
  const monday = mondayOf(day);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const DAY_LABELS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/** Libellé court d'un jour, ex. « mer. 7 ». */
export function dayLabel(day: string): string {
  const d = parse(day);
  return `${DAY_LABELS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}`;
}

/** Jour calendaire à Paris d'un instant UTC `AAAA-MM-JJ HH:mm` (format des dates Campus via le MCP). */
export function parisDayOfUtc(utc: string): string {
  const instant = new Date(`${utc.replace(' ', 'T')}:00Z`);
  if (Number.isNaN(instant.getTime())) throw new Error(`Instant UTC invalide : ${utc}`);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(instant);
}
