import type { PlanSource } from '@coach-chris/domain';

const NAME: Record<PlanSource, string> = { campus: 'Campus', claude: 'Plan Claude', manuel: 'Manuel' };

/** Étiquette de la source du plan de la semaine (D153) : Campus par défaut, Claude quand un plan importé l'a activée. */
export function PlanSourceTag({ source }: { source: PlanSource | undefined }) {
  const s = source ?? 'campus';
  return <span className={`src ${s}`}>{NAME[s]}</span>;
}
