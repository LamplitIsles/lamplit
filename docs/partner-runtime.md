# Direct Partner runtime

The first standalone slice lives in `apps/partner`. One Node 24 process hosts
nanocodex, serves the SvelteKit-built Companion, and owns the Partner-managed
portion of its configured workspace. Runtime data is kept below
`<workspace>/.lamplit/`; credentials remain in the external configured state
directory.
It is separate from the static public website and the existing DSH containers.

Prepare the accepted SDK archives, then build:

```sh
node apps/partner/scripts/prepare-sdk.mjs /path/to/accepted/artifacts
pnpm install --frozen-lockfile
pnpm partner:build
```

Copy `apps/partner/config.example.toml` and `persona.example.md` into your own
configuration directory. Paths are relative to the TOML file. Set the provider
endpoints before starting; the example persona is for testing.
The runtime always binds loopback. Existing container deployments are unaffected.

Start with an absolute configuration path. Local Codex Bridge needs no credential file:

```sh
pnpm partner serve /absolute/path/config.toml
```

A provider credential is optional; absent credentials use the SDK-required dummy value for the local bridge. For an authenticated provider, write its credential with the CLI from protected stdin.

The runtime trusts local access. Open Companion directly; Kepos owns the remote
encrypted access path. There is no application login, access token, cookie
authentication, or local-port-specific Host/Origin gate. Provider secrets should come from a secret manager or protected input stream,
never literal command arguments. Files are created privately; restart to apply credential changes.
There is no settings page or dynamic key refresh dependency.

The interface is the imported dsh-companion Svelte surface, including its themes, Markdown/KaTeX rendering, relationship panel and composer. Lamplit supplies the message projection and naco context capacity; the DSH navigation links are removed.

Companion displays complete messages and typing. New input queues in naco.
Refreshing or closing a browser does not resubmit input or cancel execution.
Startup reconciles unfinished display rows against naco's retained execution
state, resumes accepted operations, and repairs completed messages. SQLite
rejects a second running owner of the same workspace-managed directory.
Normal shutdown stops admission and drains accepted work before closing naco;
forced termination relies on durable recovery. It does not mark a normal
service shutdown as user cancellation.

## Persistence and ownership

The configured workspace root is the ordinary code-mode workspace. Lamplit
creates one managed subtree inside it:

| Path | Owner | Purpose |
| --- | --- | --- |
| `<workspace>/.lamplit/session.sqlite` (and its WAL/SHM files) | Lamplit + naco durability adapter | Partner display facts, relationship records, context observation, compact presentation anchors, image bytes, and opaque naco recovery state |
| `<workspace>/.lamplit/attachments/` | Lamplit | Original uploaded attachment files materialized for the model and local image tools |
| `<workspace>/` outside `.lamplit/` | Partner tools and operator | Ordinary workspace files; never used as a second session-data root |
| `<state>/credentials.json` | CLI/operator | External provider, mailbox, and speech credentials; it is not moved into the workspace |

Lamplit does not read or write a second diagnostics journal. Execution status,
queue state, model context, and durable recovery come from naco's public SDK
views. The small SQLite presentation records exist only where the SDK does not
provide a product display contract: message text and idempotency, relationship
history, image bytes, the last valid context observation for cold display, and
compact anchors. The SDK durability payload is opaque to product code.

Back up `<workspace>/.lamplit/` together with the ordinary workspace when the
Partner conversation and its attachments must be restored. A future operator
may add `.lamplit/` to the workspace's ignore rules; the runtime does not edit
`.gitignore` automatically. There is no automatic relocation, migration reader,
cleanup, or reset of an older state-directory database; stop the runtime and
perform any separately approved one-time relocation explicitly.

Continuity uses the durable conversation and naco compaction summary. No external
memory service, recall, reflection tool, or retention outbox is used. Relationship
state is injected as descriptive metadata under `<companion-context>`.

`roll_dice` supports dice count, sides, modifier and label. Optional TOML sections
enable the other tools:

- `[mail]`: set `url` and `mailbox`, then write an access bearer using
  `credential /absolute/path/config.toml mail` from protected stdin. The six tools
  list, search, read a message, read a thread, send and reply. The configured
  mailbox is fixed by the host. Each call owns and closes its MCP connection.
  Automatic OAuth token refresh is not implemented; replace the credential and
  restart when necessary.
- `[imagegen]`: set the bridge root `url`, `model` and optional `edit_model`.
  Generated PNGs are stored in SQLite and attached to the completed reply.
  Edits accept up to five IDs of user attachments or previously generated images. Arbitrary host paths are not exposed. Tool results carry image
  IDs and URLs rather than base64 payloads in model history.

Companion relationship updates, signatures and history are available as tools. State changes persist atomically in SQLite and per-turn affinity movement is bounded to ±10, including repeated calls. The latest state is injected at model boundaries.

These tools use naco code mode with its QuickJS evaluator. Registered tools are available through `tools`, with SDK `text()` and `image()` output helpers. The naco file tools and native `exec_command` / `write_stdin` use the configured workspace root as their real local working directory. Commands can launch installed host programs and use pipe sessions, without PTYs. This directory is a default cwd, not an OS sandbox. Runtime shutdown closes the SDK process tools and their owned child processes.

`skill_list`, `skill_find`, and `skill_get` invoke the installed Organon `skill` CLI with literal argv, the workspace as cwd, a 10-second deadline and a 1 MiB output limit. Install that CLI on PATH. It discovers workspace `.agents/skills` before the host user's `~/.agents/skills`; bodies are loaded on demand. Missing CLI and unavailable capabilities requested by a skill surface as tool failures, not invented results. No automatic catalogue injection is added. The code evaluator uses QuickJS and has no direct Node globals; explicit host tools provide filesystem and command access. Keet follows the other capabilities and migration.

Companion supports PNG, JPEG, WebP and GIF attachments: up to five per message, 5 MiB each and 20 MiB total. Image-only messages are accepted. Input metadata and bytes are admitted atomically with the stable message ID; conflicting retries are rejected. naco receives multimodal input. Uploaded photos appear on the outgoing side, generated images on the incoming side. `view_attachment` can retrieve a stored image after compaction; pass its result to code mode `image()` rather than emitting base64 as text.

Compaction uses the imported Companion summary instruction. It retains up to five
complete text rounds with a soft 4k budget estimated from UTF-8 text size, plus
the summary and unfinished current-turn items. The unfinished-turn boundary relies
on this host's one-user-message-per-turn admission and absence of steering.
Do not add steering or other user-role context injection without revisiting that
boundary. Visible chat remains outside the compacted model history.

Runtime failures and bounded timing metadata are written to the process
stderr stream with prompt, image, credential, and provider-payload fields
redacted. They are operational diagnostics only; Lamplit does not persist a
JSONL copy or expose a diagnostics API/CLI. Use the service/container log
collector with its normal retention and access controls.

`pnpm partner:check` checks types, builds the actual client, and runs isolated
real-SDK tests, including process termination and recovery. Tests use temporary
state and fake model endpoints. Live provider acceptance is recorded separately under local scratch material. There has been no live session import, container cutover, or staging deployment. Move the
existing session later with a separately verified one-time conversion script.

Speech input is optional STT only. Add `[speech]` (the endpoint defaults to
DashScope) and write the API key through `credential ... speech`, then restart.
The microphone records up to five minutes; stopping sends bounded audio to
`qwen3-asr-flash` and appends recognized text to the composer for review. Only
pressing Send admits the text to naco. Audio is not stored in the conversation or managed Partner data. There is no TTS or reply speech generation. Browser
microphone access needs permission and a secure context (localhost or HTTPS).
Closing the page cancels its transcription request; a 60-second deadline bounds
provider work. The complete provider audio data URL is capped at 10 MiB.

Companion continuity uses naco's ordered execution and compaction events while
the process is live. An installed compaction produces a persistent,
summary-free timeline marker anchored to the affected user/assistant
contribution, including automatic mid-turn compaction. Running and failed
compactions update the quiet process-local lifecycle status; that transient
status is intentionally cleared on restart, so a stopped process cannot leave
the UI permanently running. Provider summary completion alone does not create
a success marker.

The capacity circle uses naco's active-context estimate and model window, never
cumulative usage. Completed turns and compactions persist the SDK observation for
restart display: an unhydrated SDK zero cannot overwrite a known observation.
If an older session has no saved observation yet, capacity remains unavailable
until the next valid engine observation rather than fabricating an estimate.

For inexpensive live acceptance, select `[provider] model = "gpt-5.6-luna"`. Sol and Astra remain available; automated tests use isolated fake provider endpoints.

The current naco SDK retains the model stored in a durable session and only
allows `setModel` before any turn was accepted. To test another model, use a
separate Partner workspace; retain the old workspace to resume its conversation.
Lamplit rejects mismatched models when restoring a completed session rather
than silently using the old model. A never-completed interrupted session has no
safe snapshot for this startup check; model switching is not supported there.

Chat synchronization uses a bounded message window. `GET /api/session` returns
at most the latest 30 conversation rounds, in admission order, with a durable
change `cursor`. `?before=<sequence>` loads up to 30 earlier rounds and returns
`before` / `hasMore`; `?after=<cursor>` returns only changed rounds, up to 30 per
batch. Follow `hasChangesMore` to drain a reconnect backlog. History requests do
not advance the browser's change cursor. Changes include execution status and
terminal replies, not just newly admitted messages. Per-message revisions keep
an older page response from overwriting a newer reply.

SSE remains a small invalidation notification. Unchanged chat text is omitted
from subsequent responses, and image metadata is queried only for the returned
messages. Queue count and cancellation IDs cover all queued work, independently
of the visible history window. Relationship history and compact-boundary metadata
remain full metadata projections in this version; this pagination concerns chat
messages and their attachments. Browser history grows only as older pages are
explicitly loaded, or changes arrive.

The basic code-mode tool set includes native `exec_command` / `write_stdin`,
`apply_patch`, path-based `view_image`, and naco `update_plan`. `view_attachment`
accepts a conversation image ID; `view_image` accepts a local workspace path.
Patches use the Node SDK's Rust/WASM planner and raw Codex syntax. Moves require
an update hunk with context. The planner validates hunks before writes; multi-file
writes are not atomic and I/O errors report completed operations. The Rust planner
can introduce LF lines when updating a CRLF file; Lamplit does not override its
line-ending behavior or impose the retired TS parser's limits.

The interface has one conversation and no session sidebar. Sending immediately
adds a local message while admission is pending. Sending and queued messages are
visually muted and labeled; server-observed IDs replace local echoes without
creating duplicate bubbles. Failures restore the draft for an idempotent retry.

Uploaded images retain their SQLite original and are materialized before model
admission at `<workspace>/.lamplit/attachments/<image-id>.<extension>`. Missing files are
restored from SQLite on startup, including earlier uploads. Existing files are
not overwritten. Model input includes both the image and its ID/absolute path;
recent text retained through compaction also keeps those attachment references.
`kepos_image_generate.images` accepts either stored image IDs or workspace image
paths (PNG/JPEG/WebP/GIF, up to 5 MiB per source). IDs use the stored original;
paths use the file's current bytes, allowing edits after local image processing.

Messages have a shared 16,000 UTF-16 code-unit limit after trimming. Oversized drafts remain editable with an inline length warning and cannot be sent. Schema rejection returns HTTP 422 and is distinct from unknown network delivery.
