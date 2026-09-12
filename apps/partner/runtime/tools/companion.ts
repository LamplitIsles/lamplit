import { z } from 'zod';
import type { ToolMap } from 'nanocodex/node';
import type { Store } from '../store.ts';
import { MOODS, canonicalizeRelationshipUpdate, canonicalizeSignature, canonicalizeChangeReason } from '../../src/lib/companion/domain.ts';

const reaction = z.object({
  mood: z.object({ value: z.enum(MOODS), note: z.string().optional(), reason: z.string() }).strict().optional(),
  affinity: z.object({ delta: z.number().int().min(-10).max(10), reason: z.string() }).strict().optional(),
}).strict();
const signature = z.object({ signature: z.string(), reason: z.string() }).strict();
const history = z.object({ limit: z.number().int().min(1).max(20).optional() }).strict();
export function companionTools(store: Store, operationId: () => string): ToolMap {
  return {
    companion_update_relationship: {
      description: 'Record a current mood or relationship reaction, or both, with concise factual reasons. Mood is a moment, not a constraint on your expression; affinity is not a goal to maximize. Net affinity movement per user turn is bounded to ±10.',
      parameters: z.toJSONSchema(reaction),
      async handler(input, context) { context.signal.throwIfAborted(); return store.updateRelationship(operationId(), context.callId, canonicalizeRelationshipUpdate(reaction.parse(input))); },
    },
    companion_set_signature: {
      description: 'Set your own short profile signature when you want it to change. Maximum 80 Unicode code points, plain text, with a concise factual reason.',
      parameters: z.toJSONSchema(signature),
      async handler(input, context) { context.signal.throwIfAborted(); const args = signature.parse(input);
        return store.updateRelationship(operationId(), context.callId, { signature: { value: canonicalizeSignature(args.signature), reason: canonicalizeChangeReason(args.reason) } }); },
    },
    companion_read_history: {
      description: 'Read recent changes in your mood, affinity and signature. These state records are limited evidence, not the full shared history.',
      parameters: z.toJSONSchema(history),
      async handler(input, context) { context.signal.throwIfAborted(); return (await store.relationshipHistory()).slice(0, history.parse(input).limit ?? 10); },
    },
  };
}
