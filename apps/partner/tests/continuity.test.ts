import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectContinuity, insertCompactBoundaries, type ContinuityEvent } from '../src/lib/continuity.ts';
import type { TimelineMessageUnit } from '../src/lib/companion/projection.ts';

test('automatic pre-turn and mid-turn compact boundaries use engine operation identity, not queued message order', () => {
  const event = (cursor: number, type: string, values: Partial<ContinuityEvent> = {}): ContinuityEvent => ({ cursor, type, created: cursor * 1000, generation: 'g', operation: null, status: null, phase: null, trigger: null, ...values });
  const events = [event(1, 'execution.state', { operation: 'one', status: 'active' }), event(2, 'model.compaction.started'),
    event(3, 'model.compaction.replaced', { phase: 'pre_turn', trigger: 'automatic' }), event(4, 'model.compaction.started'),
    event(5, 'model.compaction.replaced', { phase: 'mid_turn', trigger: 'automatic' })];
  const view = projectContinuity(events, new Set(['one', 'queued']), 'g');
  const units = ['one:user', 'one:answer', 'queued:user'].map(id => ({ id, side: 'incoming', items: [] } as TimelineMessageUnit));
  assert.deepEqual(insertCompactBoundaries(units, view.compactions).map(unit => unit.id), ['compact:2', 'one:user', 'compact:4', 'one:answer', 'queued:user']);
  assert.equal(view.lifecycle.latest?.status, 'complete');
  const failed = projectContinuity([event(1, 'model.compaction.started'), event(2, 'model.compaction.failed')], new Set(), 'g');
  assert.equal(failed.compactions.length, 0); assert.equal(failed.lifecycle.latest?.status, 'failed');
  assert.equal(projectContinuity([event(1, 'model.compaction.started')], new Set(), 'restarted').lifecycle.latest?.status, 'failed');
});
