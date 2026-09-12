import { imageLimits, imagePrompt, imageText, materializeImages, inputImages, type imageInputSchema } from './images.ts';
import type { z } from 'zod';
import asyncVariant from '@jitl/quickjs-wasmfile-release-asyncify';
import { newQuickJSAsyncWASMModuleFromVariant } from 'quickjs-emscripten-core';
import { basicTools } from './tools/basic.ts';
import { projectContinuity } from "../src/lib/continuity.ts";
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

const sessionId = 'partner';

export async function createPartner(config: Config, credentials: Credentials) {
  if (config.speech && !credentials.speech) throw new Error('Configured speech requires a CLI-managed speech credential');
  const persona = await readFile(config.persona, 'utf8');
  if (!persona.trim()) throw new Error('Persona must not be empty');
  await mkdir(config.state, { recursive: true, mode: 0o700 });
  const store = new Store(join(config.state, 'session.sqlite'));
  let basic: Awaited<ReturnType<typeof basicTools>> | undefined;
  let agent: Awaited<ReturnType<typeof Agent.create>>;
  const listeners = new Set<() => void>();
  const tasks = new Map<string, Promise<void>>();
  let closing = false;
  let storageError = false;
  let currentOperationId = '';
  let notifications: Promise<unknown> = Promise.resolve();
  const notify = () => { for (const listener of listeners) listener(); };
  const log = async (data: unknown) => {
    try { await store.log(data); }
    catch { storageError = true; notify(); }
  };
  async function replacement(context: CompactionContext) {
    const completed = (await store.messages()).filter((row) => row.answer !== null).slice(-5);
    const retained: CompactionReplacementItem[] = [];
    let budget = 0;
    for (const row of completed.reverse()) {
      // Soft text estimate; always preserve the newest whole round.
      const input = imageText(row.input, await store.inputImages(row.id), basic!.workspace.root);
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
    basic = await basicTools(config.workspace ?? join(config.state, 'workspace'));
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
      if (restored && restored.model !== config.provider.model) throw new Error(`Stored session uses ${restored.model}; configured ${config.provider.model}. Select a separate state directory to use a different model.`);
    }
    catch (error) { await agent.session.shutdown(); agent.dispose(); throw error; }
  } catch (error) { await basic?.close(); await store.close(); throw error; }
  const watcher = agent.events.watch();
  const generation = randomUUID();
  async function observeContext() {
    const context = await agent.session.context();
    // A cold SDK has no in-memory committed checkpoint yet; its zero is not
    // evidence that an existing durable conversation became empty.
    if (context.active_context_tokens > 0) await store.observeContext({ activeTokens: context.active_context_tokens, windowTokens: context.context_window_tokens });
  }
  watcher.onEvent((event) => {
    notifications = notifications.then(async () => {
      await log({ generation, ...event });
      if (event.type === 'execution.state') {
        const payload = event.payload as { operation_id: string };
        await store.touchMessage(payload.operation_id);
      }
      if (event.type === 'model.compaction.replaced') {
        const payload = event.payload as { context?: { active_context_tokens: number; context_window_tokens: number } };
        if (payload.context) await store.observeContext({ activeTokens: payload.context.active_context_tokens, windowTokens: payload.context.context_window_tokens });
      }
      if (event.type === 'execution.state' || event.type.startsWith('model.compaction.')) notify();
    });
  });
  function own(id: string, turn: Turn) {
    const task = (async () => {
      try {
        const result = await turn.result();
        try { await notifications; await observeContext(); await store.finish(id, result.finalMessage, await result.usage()); }
        finally { result.dispose(); }
      } catch {
        const state = await agent.execution.state(id);
        // A nonterminal interrupted operation remains recoverable on startup.
        if (state?.status === 'cancelled' || state?.status === 'failed') {
          await store.finish(id, null, null, state.status);
        }
      } finally { turn.dispose(); tasks.delete(id); notify(); }
    })().catch(async () => { storageError = true; await log({ type: 'message.persistence_failed', operationId: id }); notify(); });
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
        const turn = state ? await agent.execution.resume(row.id) : agent.turn.prompt({ id: row.id, input: imagePrompt(row.input, uploads, basic!.workspace.root) });
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
    diagnostics: (after: number) => store.diagnostics(after),
    image: (id: string) => store.image(id),
    async snapshot(options: MessagePageOptions = {}) {
      await notifications;
      const page = await store.messagePage(options);
      const execution = await agent.execution.snapshot();
      const liveContext = await agent.session.context();
      const context = liveContext.active_context_tokens > 0 ? { activeTokens: liveContext.active_context_tokens, windowTokens: liveContext.context_window_tokens } : await store.observedContext();
      const statuses = new Map(execution.operations.map((operation) => [operation.operation_id, operation.status]));
      const messages = page.messages;
      const continuity = projectContinuity(await store.continuityEvents(), new Set(await store.messageIds()), generation);
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
      const result = admission.then(async () => {
        if (closing || storageError) throw new Error('Partner is unavailable');
        const images = inputImages(id, values);
        const row = await store.admit(id, input, images);
        await materializeImages(basic!.workspace, images);
        if (row.answer !== null || row.error !== null || tasks.has(id)) return;
        const turn = agent.turn.prompt({ id, input: imagePrompt(input, images, basic!.workspace.root) });
        own(id, turn);
        await turn.accepted(); notify();
      });
      admission = result.catch(() => {});
      return result;
    },
    async cancel(id: string) { await agent.execution.cancel(id); notify(); },
    async compact() {
      try { const result = await agent.session.compact(); await notifications; await observeContext(); notify(); return result; }
      catch (error) { await log({ generation, type: 'companion.compaction.failed' }); notify(); throw error; }
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
