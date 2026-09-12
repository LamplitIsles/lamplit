import type { CompactionLifecycleState } from './companion/continuity.ts';
export type ContextObservation = { activeTokens: number; windowTokens: number };
export type CompactBoundary = { id: string; anchorId: string | null; position: 'before' | 'after-user' | 'after'; time: number };
export type ContinuityEvent = { cursor: number; created: number; type: string; generation: string; operation: string | null; status: string | null; phase: string | null; trigger: string | null };

/** Project ordered engine facts, never summary text, into the chat timeline. */
export function projectContinuity(events: readonly ContinuityEvent[], messageIds: ReadonlySet<string>, generation: string) {
  let active: string | null = null, completed: string | null = null;
  let latest: CompactionLifecycleState | undefined;
  let lifecycleGeneration: string | undefined;
  const compactions: CompactBoundary[] = [];
  for (const event of events) {
    if (event.type === 'execution.state' && event.operation && messageIds.has(event.operation)) {
      if (event.status === 'active') active = event.operation;
      else if (['completed', 'failed', 'cancelled'].includes(event.status ?? '')) {
        // A queued cancellation does not become the last completed dialogue.
        if (active === event.operation || event.status === 'completed') completed = event.operation;
        if (active === event.operation) active = null;
      }
    } else if (event.type === 'model.compaction.started') {
      latest = { compactionId: `compact:${event.cursor}`, status: 'running', startSeq: event.cursor, startedAt: event.created };
      lifecycleGeneration = event.generation;
    } else if (event.type === 'model.compaction.replaced') {
      const id = latest?.status === 'running' ? latest.compactionId : `compact:${event.cursor}`;
      compactions.push({ id, anchorId: active ?? completed,
        position: active ? (event.phase === 'mid_turn' ? 'after-user' : 'before') : 'after', time: event.created });
      latest = { compactionId: id, startSeq: latest?.startSeq ?? event.cursor, startedAt: latest?.startedAt ?? event.created,
        status: 'complete', endSeq: event.cursor, endedAt: event.created };
    } else if (latest?.status === 'running' && ['model.compaction.failed', 'companion.compaction.failed', 'run.failed', 'run.cancelled'].includes(event.type)) {
      latest = { ...latest, status: 'failed', endSeq: event.cursor, endedAt: event.created };
    }
  }
  if (latest?.status === 'running' && lifecycleGeneration !== generation) latest = { ...latest, status: 'failed', endedAt: latest.startedAt };
  return { compactions, lifecycle: { lifecycles: latest ? [latest] : [], latest } };
}

import type { TimelineMessageUnit } from './companion/projection.ts';
/** Keep boundaries between the same visible contributions, including mid-turn. */
export function insertCompactBoundaries(units: readonly TimelineMessageUnit[], boundaries: readonly CompactBoundary[]): TimelineMessageUnit[] {
  const slots = new Map<number, TimelineMessageUnit[]>();
  for (const boundary of boundaries) {
    let index = 0;
    if (boundary.anchorId) {
      const user = units.findIndex(unit => unit.id === `${boundary.anchorId}:user`);
      const answer = units.findIndex(unit => unit.id === `${boundary.anchorId}:answer`);
      if (user < 0) continue;
      index = boundary.position === 'before' ? user : boundary.position === 'after-user' ? user + 1 : (answer < 0 ? user : answer) + 1;
    }
    const records = slots.get(index) ?? [];
    records.push({ id: boundary.id, side: 'incoming', items: [{ id: boundary.id, messageKey: boundary.id, kind: 'continuity',
      side: 'incoming', tone: 'success', compactionId: boundary.id, text: '', time: boundary.time, anchorSeq: index }] });
    slots.set(index, records);
  }
  return Array.from({ length: units.length + 1 }, (_, index) => [...(slots.get(index) ?? []), ...(units[index] ? [units[index]] : [])]).flat();
}
