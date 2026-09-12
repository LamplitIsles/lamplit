/** Merge independent history pages and change batches without regressing a reply. */
export function mergeMessages<T extends { id: string; sequence: number; revision: number }>(current: readonly T[], incoming: readonly T[]): T[] {
  const messages = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const previous = messages.get(message.id);
    if (!previous || message.revision >= previous.revision) messages.set(message.id, message);
  }
  return [...messages.values()].sort((a,b) => a.sequence-b.sequence);
}
