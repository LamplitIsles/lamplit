<script lang="ts">
  import { mergeMessages } from '$lib/message-pages.ts';
  import { serializeImageDrafts } from '$lib/companion/client/image-drafts.ts';
  import type { ImageAttachmentLimits } from '$lib/companion/client/contracts.ts';
  import { insertCompactBoundaries, type CompactBoundary } from '$lib/continuity.ts';
  import type { CompanionContinuitySnapshot } from '$lib/companion/continuity.ts';
  import { onMount } from 'svelte';
  import Companion from '$lib/companion/client/Companion.svelte';
  import { companionStyles } from '$lib/companion/client/theme.js';
  import { companionZh, type CompanionTranslate } from '$lib/companion/client/locale.js';
  import type { CompanionActions } from '$lib/companion/client/companion-bridge.js';
  import type { CompanionProjection, TimelineItem, TimelineMessageUnit } from '$lib/companion/projection.js';
  import type { CompanionStateRecord } from '$lib/companion/domain.js';
  import { CompanionPreControllerError } from '$lib/companion/client/admission.js';
  type Message = { sequence: number; revision: number; id: string; input: string; answer: string | null; error: string | null; status: string; created: number;
    inputImages: { id: string; name: string; url: string }[];
    images: { id: string; name: string; url: string }[] };
  type Snapshot = { cursor: number; before: number | null; hasMore: boolean; hasChangesMore: boolean; pendingCount: number; cancellable: string[]; imageLimits?: ImageAttachmentLimits; name: string; speech?: boolean; typing: boolean; messages: Message[]; storageError: boolean;
    context?: { activeTokens: number; windowTokens: number } | null;
    compactions?: CompactBoundary[]; lifecycle?: CompanionContinuitySnapshot;
    relationship?: { mood: string; moodLabel: string; note?: string; affinity: number; affinityStage: string; signature: string };
    history?: CompanionStateRecord[] };
  let session = $state<Snapshot>({ cursor: 0, before: null, hasMore: false, hasChangesMore: false, pendingCount: 0, cancellable: [], name: 'Lamplit', typing: false, messages: [], storageError: false });
  let before = $state<number | null>(null), hasMore = $state(false), loadingOlder = $state(false);
  let cursor: number | undefined;
  let connected = $state(false), loaded = $state(false), error = $state('');
  let stream: EventSource | undefined;
  let disposed = false, refreshAgain = false, refreshing = false;
  const controller = new AbortController();
  const pending = new Map<string, string>();
  let outgoing = $state<Message[]>([]);
  const retirements = new Map<string, () => void>();
  function observeOutgoing() {
    const observed = new Set(session.messages.map(message => message.id));
    outgoing = outgoing.filter(message => !observed.has(message.id));
    for (const [id, retire] of retirements) if (observed.has(id)) { retirements.delete(id); retire(); }
  }
  const t: CompanionTranslate = (key, params) => companionZh[key].replace(/\{(\w+)\}/gu, (match, name) => String(params?.[name] ?? match));
  let projection = $derived.by((): CompanionProjection => {
    const units: TimelineMessageUnit[] = [];
    for (const message of [...session.messages, ...outgoing.filter(local => !session.messages.some(message => message.id === local.id))]) {
      const user: TimelineItem = { id: `${message.id}:user`, messageKey: `${message.id}:user`, kind: 'text', side: 'outgoing',
        text: message.input, time: message.created, pending: ['sending', 'pending'].includes(message.status), waitsForCurrentReply: message.status === 'pending' };
      units.push({ id: user.id, side: 'outgoing', items: [...(message.input ? [user] : []), ...(message.inputImages ?? []).map((image): TimelineItem => ({ id: image.id, messageKey: user.messageKey, kind: 'image', side: 'outgoing', state: 'ready', previewUrl: image.url, alt: image.name }))], time: message.created, pending: user.pending, pendingLabel: message.status === 'sending' ? '正在发送…' : message.status === 'pending' ? t('queue.wait') : undefined });
      const incoming: TimelineItem[] = [];
      if (message.answer !== null) incoming.push({ id: `${message.id}:answer`, messageKey: `${message.id}:answer`, kind: 'text', side: 'incoming', text: message.answer });
      if (message.answer !== null || message.error) for (const image of message.images) incoming.push({ id: image.id, messageKey: `${message.id}:answer`, kind: 'image', side: 'incoming', state: 'ready', previewUrl: image.url, alt: image.name });
      if (message.error) incoming.push({ id: `${message.id}:error`, messageKey: `${message.id}:answer`, kind: 'notice', side: 'incoming', tone: 'error', text: message.error === 'cancelled' ? '这次回应已停止。' : '这次未能回应。' });
      if (incoming.length) units.push({ id: `${message.id}:answer`, side: 'incoming', items: incoming });
    }
    const timeline = insertCompactBoundaries(units, session.compactions ?? []);
    return { items: timeline.flatMap((unit) => unit.items), messageUnits: timeline,
      pendingCount: session.pendingCount,
      running: session.typing, status: !connected ? 'reconnecting' : session.typing ? 'working' : 'ready',
      openState: loaded ? 'open' : 'loading', hasMore, loadingOlder,
      promptError: error || (session.storageError ? '暂时无法保存消息。' : undefined) };
  });
  async function refresh() {
    if (refreshing) { refreshAgain = true; return; }
    refreshing = true;
    try { do {
      refreshAgain = false;
      const response = await fetch(cursor === undefined ? '/api/session' : `/api/session?after=${cursor}`, { signal: controller.signal });
      if (!response.ok) throw new Error('连接暂时中断');
      const batch: Snapshot = await response.json();
      if (cursor === undefined) { before = batch.before; hasMore = batch.hasMore; }
      session = { ...batch, messages: mergeMessages(session.messages, batch.messages) };
      observeOutgoing();
      cursor = batch.cursor; loaded = true;
      if (batch.hasChangesMore) refreshAgain = true;
    } while (refreshAgain && !disposed); }
    catch { if (!disposed) connected = false; }
    finally { refreshing = false; }
  }
  class MessageRejected extends Error {}
  async function post(path: string, data: unknown) {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data), signal: controller.signal });
    if (response.status === 422) throw new MessageRejected('消息内容无效，请检查文字长度和图片后重新发送。');
    if (!response.ok) throw new Error('尚未确认送达，请重试。');
  }
  const actions: CompanionActions = {
    async loadOlder() {
      if (loadingOlder || !hasMore || before === null) return;
      loadingOlder = true;
      try {
        const response = await fetch(`/api/session?before=${before}`, { signal: controller.signal });
        if (!response.ok) throw new Error('暂时无法加载更早消息');
        const page: Snapshot = await response.json();
        session = { ...session, messages: mergeMessages(session.messages, page.messages) };
        before = page.before; hasMore = page.hasMore;
      } catch { if (!disposed) error = '暂时无法加载更早消息，请重试。'; }
      finally { loadingOlder = false; }
    },
    async transcribeVoice(recording, signal) {
      const response = await fetch('/api/voice/transcribe', { method: 'POST', headers: { 'content-type': recording.mediaType }, body: recording.blob,
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal });
      if (!response.ok) throw new Error('Transcription failed');
      return response.json();
    },
    async send(input, images, retire) {
      if (input === '/compact' && !images.length) {
        try { await post('/api/compact', {}); await refresh(); } catch { throw new CompanionPreControllerError('暂时无法整理对话'); }
        return;
      }
      let id: string = crypto.randomUUID();
      const local: Message = { id, input, answer: null, error: null, status: 'sending', created: Date.now(), sequence: 0, revision: 0,
        inputImages: images.map(image => ({ id: image.id, name: image.file.name, url: image.previewUrl })), images: [] };
      outgoing = [...outgoing, local]; error = '';
      let key: string | undefined;
      let observed = false;
      try {
        const attachments = await serializeImageDrafts(images);
        const bytes = new TextEncoder().encode(JSON.stringify([input, attachments]));
        key = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
        const original = id;
        id = pending.get(key) ?? id; pending.delete(key);
        outgoing = outgoing.map(message => message.id === original ? { ...message, id } : message);
        retirements.set(id, () => { observed = true; pending.delete(key!); retire?.({ reason: 'observed' }); });
        observeOutgoing();
        await post('/api/messages', { id, input, images: attachments });
        outgoing = outgoing.map(message => message.id === id ? { ...message, status: 'pending' } : message);
        await refresh();
      } catch (cause) {
        if (observed) return;
        outgoing = outgoing.filter(message => message.id !== id); retirements.delete(id);
        if (key && !(cause instanceof MessageRejected)) pending.set(key, id);
        error = cause instanceof MessageRejected ? cause.message : '尚未确认送达，再次发送会重试原消息。'; retire?.({ reason: 'failed' }); throw cause;
      }
    },
    async stop() { for (const id of session.cancellable) await post('/api/cancel', { id }); await refresh(); },
  };
  onMount(() => {
    const styles = document.createElement('style'); styles.textContent = companionStyles; document.head.append(styles);
    stream = new EventSource('/api/events');
    stream.onopen = () => { connected = true; void refresh(); };
    stream.onmessage = () => { void refresh(); };
    stream.onerror = () => { connected = false; };
    return () => { disposed = true; controller.abort(); stream?.close(); retirements.clear(); styles.remove(); };
  });
</script>
<svelte:head><title>{session.name} · Lamplit</title></svelte:head>
<Companion {projection} {actions} {t} locale="zh" scheme="dark" sessionId="partner" voiceCapability={session.speech ? "available" : "unavailable"} imageLimits={session.imageLimits} onHistoryOpenChange={undefined}
  identity={{ companionName: session.name, userName: '你', preferredAddress: '你', signature: session.relationship?.signature ?? '',
    mood: session.relationship?.mood ?? 'neutral', moodLabel: session.relationship?.moodLabel ?? '如常', moodNote: session.relationship?.note,
    affinity: session.relationship?.affinity, affinityStage: session.relationship?.affinityStage }}
  workspaceReadiness={loaded ? 'ready' : 'loading'} sessionReadiness={loaded ? 'ready' : 'loading'}
  relationshipReadiness={session.relationship ? 'ready' : 'loading'}
  continuity={{ lifecycle: session.lifecycle, contextPressure: session.context ? { contextWindow: session.context.windowTokens, projectedTokens: session.context.activeTokens } : undefined }}
  history={{ status: loaded ? 'ready' : 'loading', records: session.history ?? [], hasEarlier: false }} />
