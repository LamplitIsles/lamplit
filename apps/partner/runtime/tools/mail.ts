import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import type { ToolMap } from 'nanocodex/node';

const text = z.string().min(1).max(64000);
const operations = [
  ['mail_list', 'list_emails', 'List messages in your configured mailbox.', z.object({ folder: text.optional(), limit: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).max(10000).optional() }).strict()],
  ['mail_search', 'search_emails', 'Search your configured mailbox.', z.object({ query: text, folder: text.optional() }).strict()],
  ['mail_read', 'get_email', 'Read an email by provider ID.', z.object({ emailId: text }).strict()],
  ['mail_read_thread', 'get_thread', 'Read a conversation thread by provider ID.', z.object({ threadId: text }).strict()],
  ['mail_send', 'send_email', 'Send an HTML email from your configured mailbox.', z.object({ to: text, subject: text, bodyHtml: text }).strict()],
  ['mail_reply', 'send_reply', 'Send an HTML reply from your configured mailbox.', z.object({ originalEmailId: text, to: text, subject: text, bodyHtml: text }).strict()],
] as const;

export function mailTools(config: { url: string; mailbox: string }, token: string): ToolMap {
  return Object.fromEntries(operations.map(([name, upstream, description, schema]) => [name, {
    description, parameters: z.toJSONSchema(schema),
    async handler(input, context) {
      const args = schema.parse(input);
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(30000)]);
      signal.throwIfAborted();
      // Each call owns its transport; no background session, ambient config,
      // OAuth browser flow or automatic mutation retries live in this adapter.
      const client = new Client({ name: 'lamplit-mail', version: '0.1.0' });
      const transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
        fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) }),
      });
      try {
        await client.connect(transport, { signal, timeout: 30000 });
        const result = await client.callTool({ name: upstream, arguments: { ...args, mailboxId: config.mailbox } }, undefined, { signal, timeout: 30000 });
        if (result.isError) throw new Error('upstream failure');
        return result;
      } catch {
        context.signal.throwIfAborted();
        throw new Error('Mail request failed. Check the configured endpoint and CLI-managed mail credential.');
      } finally { await client.close(); }
    },
  }]));
}
