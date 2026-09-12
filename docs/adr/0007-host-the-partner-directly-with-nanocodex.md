# Host the Partner directly with nanocodex

The next Lamplit runtime will be a TypeScript application with a SvelteKit
Companion interface, directly hosting nanocodex instead of assembling DSH
plugins. Nanocodex owns execution, queued work, model context, and recovery;
Lamplit supplies Partner instructions, context injection, compaction policy,
and five built-in capabilities: Companion, Keet, mail, tabletop,
and image generation. This removes the competing execution owners and their
session translations. The existing static public website remains separate
from the private Partner runtime.

The first version uses TOML configuration and CLI-managed local credentials,
with no settings page. Companion displays messages and typing; tool activity
is available through bounded process diagnostics only and is not persisted as
a second session record. Display history must survive model compaction. The
public embedded SDK exposes the compaction event only while the process is
running and does not expose a stable message anchor after restart, so Lamplit
retains minimal compact presentation anchors rather than replaying an event
journal.

There will be no DSH session-format compatibility reader or second execution
log maintained for DSH. Existing deployed data stays intact; any one-time
import or deployment cutover is a separate decision. This ADR records the
implementation direction, not a completed runtime or a release change. The
existing distribution remains the current release until the replacement is
verified. Dynamic provider-key resolution is not a prerequisite: the current
deployment uses a static dummy key.

Use local SQLite for the single-instance runtime under the selected Partner
workspace's `.lamplit/` directory; its WAL/SHM files, relationship data, and
naco durability state share that managed root. Credentials remain in the
external CLI state directory, and ordinary workspace files stay outside
`.lamplit/`. Context injection supplies current relationship metadata. Keet integration follows
successful migration and verification of the other capabilities. Move the
current session with a later one-time conversion script, keeping that conversion
outside the running application's storage contract.

Companion shows typing followed by complete messages, without token streaming.
Messages received during execution enter naco's queue and run in order; the
application does not automatically steer, cancel, or restart the active turn.
Continuity uses conversation history and compaction summaries. Hindsight recall,
reflection, and retention are removed; no replacement memory service is added.

Trust the local machine and use Kepos for remote encrypted access. Companion
opens directly without application login, access tokens or cookie authentication.
Do not bind Host/Origin checks to the backend port in a way that blocks forwarding.

The interface exposes only the single Partner conversation, without a session
selector. Local optimistic messages bridge HTTP admission latency; durable naco
state remains authoritative for queued and active work. Uploaded images also
have stable files under the Partner workspace's `.lamplit/attachments`
directory, with
paths supplied to the model so local tools and image editing share those inputs.
