import { imageLimits, imagePrompt, imageText, materializeImages, inputImages, type imageInputSchema } from './images.ts';
import type { z } from 'zod';
import asyncVariant from '@jitl/quickjs-wasmfile-release-asyncify';
import { newQuickJSAsyncWASMModuleFromVariant } from 'quickjs-emscripten-core';
import { basicTools } from './tools/basic.ts';
import { createCompactBoundary, projectContinuity, type CompactionPhase } from "../src/lib/continuity.ts";
import type { CompactionLifecycleState } from '../src/lib/companion/continuity.ts';
import { transcribeAudio } from './speech.ts';
import { MOOD_LABELS, affinityStage } from "../src/lib/companion/domain.ts";
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Agent, Transport, createQuickJsEvaluator, type Turn, type CompactionContext, type CompactionReplacementItem } from 'nanocodex/node';
import { Store, type MessagePageOptions } from './store.ts';
import { createTools } from './tools/index.ts';
import type { Config, Credentials } from './config.ts';
import { companionPrompt, compactionPrompt } from './prompts.ts';
import { partnerPaths } from './storage-paths.ts';
import { processError, processLog } from './logging.ts';

const sessionId = 'partner';
type TurnTiming = {
  requestedAt: number;
  queueWaitMs: number;
  productAdmissionMs: number;
  storeAdmissionMs: number;
  materializationMs: number;
  sdkAcceptanceStartedAt: number;
  accepted: Promise<string | undefined>;
  acceptedAt?: number;
};

export async function createPartner(config: Config, credentials: Credentials) {
  if (config.speech && !credentials.speech) throw new Error('Configured speech requires a CLI-managed speech credential');
  const persona = await readFile(config.persona, 'utf8');
  if (!persona.trim()) throw new Error('Persona must not be empty');
  const paths = partnerPaths(config.workspace ?? join(config.state, 'workspace'));
  await mkdir(paths.managedRoot, { recursive: true, mode: 0o700 });
  await mkdir(paths.attachments, { recursive: true, mode: 0o700 });
  const store = new Store(paths.database);
  let basic: Awaited<ReturnType<typeof basicTools>> | undefined;
  let agent: Awaited<ReturnType<typeof Agent.create>>;
  const listeners = new Set<() => void>();
  const tasks = new Map<string, Promise<void>>();
  let closing = false;
  let storageError = false;
  let currentOperationId = '';
  let activeOperationId: string | null = null;
  let completedOperationId: string | null = null;
  let lifecycle: CompactionLifecycleState | undefined;
  let notifications: Promise<unknown> = Promise.resolve();
  const notify = () => { for (const listener of listeners) listener(); };
  async function replacement(context: CompactionContext) {
    const completed = (await store.messages()).filter((row) => row.answer !== null).slice(-5);
    const retained: CompactionReplacementItem[] = [];
    let budget = 0;
    for (const row of completed.reverse()) {
      // Soft text estimate; always preserve the newest whole round.
      const input = imageText(row.input, await store.inputImages(row.id), paths.workspaceRoot);
      const cost = Math.ceil(Buffer.byteLength(input + row.answer, 'utf8') / 3);
      if (retained.length && budget + cost > 4000) break;
      budget += cost;
      retained.unshift(
        { kind: 'item', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: input }] } },
        { kind: 'item', item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: row.answer }] } },
      );
    }
    // This host admits one user message per turn and does not expose steering.
    // In mid-turn compaction the last user message starts the unfinished suffix.
    const unfinished: CompactionReplacementItem[] = [];
    if (context.phase === 'mid_turn') {
      const start = context.history.findLastIndex(({ item }) => item.type === 'message' && item.role === 'user');
      if (start < 0) throw new Error('Cannot identify unfinished conversation input');
      unfinished.push(...context.history.slice(start).map(({ origin }) => ({ kind: 'original' as const, origin })));
    }
    return { operation_id: context.operation_id,
      history: [{ kind: 'summary' as const, text: context.summary }, ...retained, ...unfinished] };
  }
  try {
    basic = await basicTools(paths.workspaceRoot);
    const evaluator = createQuickJsEvaluator(await newQuickJSAsyncWASMModuleFromVariant(asyncVariant));
    agent = await Agent.create({
      model: config.provider.model, thinking: 'low', subagents: false, toolMode: 'code', codeEvaluator: evaluator,
      instructions: `${companionPrompt}\n\n${basic.instructions}\n\n${persona}`,
      transport: Transport.openAi({ apiKey: credentials.provider ?? "dummy", apiBaseUrl: config.provider.base_url,
        ...(config.provider.websocket_url ? { websocketUrl: config.provider.websocket_url } : {}), websocketWarmup: false }),
      durability: store.durability, durabilityId: sessionId,
      resolveContext: async (context, signal) => {
        currentOperationId = context.operationId;
        const history = await store.relationshipHistory();
        const relationshipContext = 'Current Companion state (a moment, not a behavioral target): ' + JSON.stringify(history[0]?.state ?? { mood: 'neutral', affinity: 50, signature: '' });
        signal.throwIfAborted();
        return { supplementaryContext: `<companion-context>
${relationshipContext}
</companion-context>` };
      },
      resolveCompactionInstruction: () => compactionPrompt,
      resolveCompaction: replacement,
      tools: { ...basic.tools, ...createTools(config, credentials, store, () => currentOperationId, basic.workspace) },
    });
    try {
      const execution = await agent.execution.snapshot();
      const restored = execution.operations.some(operation => operation.status === 'completed') ? await agent.session.snapshot() : null;
      if (restored && restored.model !== config.provider.model) throw new Error(`Stored session uses ${restored.model}; configured ${config.provider.model}. Select a separate Partner workspace to use a different model.`);
    }
    catch (error) { await agent.session.shutdown(); agent.dispose(); throw error; }
  } catch (error) { await basic?.close(); await store.close(); throw error; }
  const watcher = agent.events.watch();
  const persistedMessages = await store.messages();
  const messageIds = new Set(persistedMessages.map((message) => message.id));
  const unfinishedMessageIds = new Set(persistedMessages.filter((message) => message.answer === null && message.error === null).map((message) => message.id));
  completedOperationId = persistedMessages.findLast((message) => message.answer !== null)?.id ?? null;
  const initialExecution = await agent.execution.snapshot();
  for (const operation of initialExecution.operations) {
    if (!unfinishedMessageIds.has(operation.operation_id)) continue;
    if (operation.status === 'active') activeOperationId = operation.operation_id;
  }
  async function observeContext() {
    const context = await agent.session.context();
    // A cold SDK has no in-memory committed checkpoint yet; its zero is not
    // evidence that an existing durable conversation became empty.
    if (context.active_context_tokens > 0) await store.observeContext({ activeTokens: context.active_context_tokens, windowTokens: context.context_window_tokens });
  }
  watcher.onEvent((event) => {
    notifications = notifications.then(async () => {
      try {
        const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
          ? event.payload as Record<string, unknown> : {};
        if (event.type === 'execution.state') {
          const operationId = typeof payload.operation_id === 'string' ? payload.operation_id : '';
          const status = typeof payload.status === 'string' ? payload.status : '';
          if (operationId && status === 'active' && messageIds.has(operationId)) activeOperationId = operationId;
          if (operationId && status === 'completed' && messageIds.has(operationId)) {
            completedOperationId = operationId;
            if (activeOperationId === operationId) activeOperationId = null;
          }
          if (operationId && ['failed', 'cancelled'].includes(status) && activeOperationId === operationId) activeOperationId = null;
          // The SDK remains authoritative for status; this tiny write only advances
          // the Partner presentation cursor so an SSE refresh can observe it.
          if (operationId && messageIds.has(operationId)) await store.touchMessage(operationId);
        }
        if (event.type === 'model.compaction.started') {
          const time = Date.now();
          lifecycle = { compactionId: `compact:${event.seq}`, status: 'running', startSeq: event.seq, startedAt: time };
        }
        if (event.type === 'model.compaction.replaced') {
          const phase: CompactionPhase = payload.phase === 'mid_turn' ? 'mid_turn' : 'pre_turn';
          // The SDK revision identifies its internal replacement state, not a
          // unique host presentation event. A fresh host ID keeps repeated
          // compactions from collapsing into one SQLite row.
          const boundary = createCompactBoundary(`compact:${event.seq}:${randomUUID()}`, activeOperationId, completedOperationId, phase, Date.now());
          await store.saveCompactBoundary(boundary);
          const time = boundary.time;
          lifecycle = { compactionId: lifecycle?.compactionId ?? boundary.id, status: 'complete', startSeq: lifecycle?.startSeq ?? event.seq,
            startedAt: lifecycle?.startedAt ?? time, endSeq: event.seq, endedAt: time };
          const context = payload.context as { active_context_tokens?: unknown; context_window_tokens?: unknown } | undefined;
          if (context && typeof context.active_context_tokens === 'number' && typeof context.context_window_tokens === 'number') {
            await store.observeContext({ activeTokens: context.active_context_tokens, windowTokens: context.context_window_tokens });
          }
        }
        if (['model.compaction.failed', 'run.failed', 'run.cancelled'].includes(event.type) && lifecycle?.status === 'running') {
          lifecycle = { ...lifecycle, status: 'failed', endSeq: event.seq, endedAt: Date.now() };
        }
        if (event.type === 'run.completed') {
          processLog('run.completed', { durationMs: payload.duration_ms, modelDurationNs: payload.model_duration_ns, modelCalls: payload.model_calls, transport: payload.transport });
        } else if (event.type === 'run.failed' || event.type === 'model.connection.failed' || event.type === 'model.attempt.retrying') {
          processLog('engine.failure', { type: event.type, sequence: event.seq, status: payload.status, transport: payload.transport });
        }
        if (event.type === 'execution.state' || event.type.startsWith('model.compaction.')) notify();
      } catch (error) {
        storageError = true;
        processError('presentation.persistence_failed', error, { eventType: event.type, sequence: event.seq });
        notify();
      }
    });
  });
  function own(id: string, turn: Turn, timing?: TurnTiming) {
    const task = (async () => {
      try {
        const result = await turn.result();
        try {
          await notifications;
          await observeContext();
          const usage = await result.usage();
          const finishStartedAt = performance.now();
          await store.finish(id, result.finalMessage, usage);
          if (timing) {
            await timing.accepted.catch(() => undefined);
            processLog('turn.completed', { operationId: id, queueWaitMs: timing.queueWaitMs,
              productAdmissionMs: timing.productAdmissionMs, storeAdmissionMs: timing.storeAdmissionMs,
              materializationMs: timing.materializationMs,
              sdkAcceptanceMs: (timing.acceptedAt ?? finishStartedAt) - timing.sdkAcceptanceStartedAt,
              completionMs: finishStartedAt - (timing.acceptedAt ?? timing.sdkAcceptanceStartedAt),
              finishPersistenceMs: performance.now() - finishStartedAt, totalMs: performance.now() - timing.requestedAt });
          }
        }
        finally { result.dispose(); }
      } catch (error) {
        const state = await agent.execution.state(id);
        processError('turn.failed', error, { operationId: id, status: state?.status ?? 'unknown' });
        // A nonterminal interrupted operation remains recoverable on startup.
        if (state?.status === 'cancelled' || state?.status === 'failed') {
          await store.finish(id, null, null, state.status);
        }
      } finally { turn.dispose(); tasks.delete(id); notify(); }
    })().catch(async (error) => { storageError = true; processError('message.persistence_failed', error, { operationId: id }); notify(); });
    tasks.set(id, task);
    return task;
  }
  // Only rows missing a terminal display result need reconciliation. An input
  // saved just before a crash can be safely submitted under its original ID.
  try {
    for (const row of await store.messages()) {
      const uploads = await store.inputImages(row.id);
      await materializeImages(basic!.workspace, uploads);
      if (row.answer !== null || row.error !== null) continue;
      const state = await agent.execution.state(row.id);
      if (state?.status === 'failed' || state?.status === 'cancelled') {
        await store.finish(row.id, null, null, state.status);
      } else {
        const turn = state ? await agent.execution.resume(row.id) : agent.turn.prompt({ id: row.id, input: imagePrompt(row.input, uploads, paths.workspaceRoot) });
        own(row.id, turn);
      }
    }
  } catch (error) {
    await agent.session.shutdown();
    await Promise.all(tasks.values());
    watcher.off(); agent.dispose(); await basic?.close(); await notifications; await store.close(); throw error;
  }
  let admission = Promise.resolve();
  let closePromise: Promise<void> | undefined;
  return {
    async transcribe(data: Uint8Array, mediaType: string, signal: AbortSignal) {
      if (!config.speech || !credentials.speech) throw new Error('Speech is unavailable');
      return transcribeAudio(config.speech.endpoint, credentials.speech, data, mediaType, signal);
    },
    image: (id: string) => store.image(id),
    async snapshot(options: MessagePageOptions = {}) {
      await notifications;
      const page = await store.messagePage(options);
      const execution = await agent.execution.snapshot();
      const liveContext = await agent.session.context();
      const context = liveContext.active_context_tokens > 0 ? { activeTokens: liveContext.active_context_tokens, windowTokens: liveContext.context_window_tokens } : await store.observedContext();
      const statuses = new Map(execution.operations.map((operation) => [operation.operation_id, operation.status]));
      const messages = page.messages;
      const continuity = projectContinuity(await store.compactBoundaries(), lifecycle);
      const images = await store.images(messages.map(message => message.id));
      const uploads = await store.inputImageMetadata(messages.map(message => message.id));
      const history = await store.relationshipHistory();
      const state = history[0]?.state ?? { mood: "neutral" as const, affinity: 50, signature: "" };
      return { ...page, name: config.name, imageLimits, speech: Boolean(config.speech && credentials.speech), storageError, context, ...continuity, history, relationship: { ...state, moodLabel: MOOD_LABELS[state.mood], affinityStage: affinityStage(state.affinity) },
        pendingCount: execution.operations.filter(operation => operation.status === 'pending').length,
        cancellable: execution.operations.filter(operation => ['active', 'pending'].includes(operation.status)).map(operation => operation.operation_id),
        typing: execution.operations.some((operation) => operation.status === 'active'),
        messages: messages.map(({ id, input, answer, error, created, sequence, revision }) => ({ id, input, answer, sequence, revision,
          error, created, inputImages: uploads.filter(image => image.operation_id === id).map(({ id, name }) => ({ id, name, url: `/api/images/${id}` })), images: images.filter((image) => image.operation_id === id).map(({ id, name }) => ({ id, name, url: `/api/images/${id}` })), status: statuses.get(id) ?? (answer !== null ? 'completed' : error ?? 'pending') })) };
    },
    submit(id: string, input: string, values: readonly z.infer<typeof imageInputSchema>[] = []) {
      const requestedAt = performance.now();
      const result = admission.then(async () => {
        if (closing || storageError) throw new Error('Partner is unavailable');
        const admissionStartedAt = performance.now();
        const images = inputImages(id, values);
        const storeStartedAt = performance.now();
        const row = await store.admit(id, input, images);
        messageIds.add(id);
        const storeAdmissionMs = performance.now() - storeStartedAt;
        const materializationStartedAt = performance.now();
        await materializeImages(basic!.workspace, images);
        const materializationMs = performance.now() - materializationStartedAt;
        if (row.answer !== null || row.error !== null || tasks.has(id)) return;
        const sdkAcceptanceStartedAt = performance.now();
        const turn = agent.turn.prompt({ id, input: imagePrompt(input, images, paths.workspaceRoot) });
        const accepted = turn.accepted();
        const timing: TurnTiming = { requestedAt, queueWaitMs: admissionStartedAt - requestedAt,
          productAdmissionMs: sdkAcceptanceStartedAt - admissionStartedAt, storeAdmissionMs,
          materializationMs, sdkAcceptanceStartedAt, accepted };
        own(id, turn, timing);
        await accepted;
        timing.acceptedAt = performance.now();
        processLog('turn.accepted', { operationId: id, queueWaitMs: timing.queueWaitMs,
          productAdmissionMs: timing.productAdmissionMs, storeAdmissionMs: timing.storeAdmissionMs,
          materializationMs: timing.materializationMs, sdkAcceptanceMs: timing.acceptedAt - sdkAcceptanceStartedAt,
          totalMs: timing.acceptedAt - requestedAt });
        notify();
      });
      admission = result.catch(() => {});
      return result;
    },
    async cancel(id: string) { await agent.execution.cancel(id); notify(); },
    async compact() {
      try { const result = await agent.session.compact(); await notifications; await observeContext(); notify(); return result; }
      catch (error) {
        const endedAt = Date.now();
        lifecycle = lifecycle?.status === 'running'
          ? { ...lifecycle, status: 'failed', endSeq: lifecycle.endSeq ?? lifecycle.startSeq, endedAt }
          : { compactionId: `compact:failed:${randomUUID()}`, status: 'failed', startSeq: 0, startedAt: endedAt, endedAt };
        processError('compaction.failed', error);
        notify();
        throw error;
      }
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    close() {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = (async () => {
        await admission;
        try { await Promise.all(tasks.values()); await agent.session.shutdown(); await notifications; }
        finally { watcher.off(); listeners.clear(); agent.dispose(); await basic?.close(); await store.close(); }
      })();
      return closePromise;
    },
  };
}
export type Partner = Awaited<ReturnType<typeof createPartner>>;
