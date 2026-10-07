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
