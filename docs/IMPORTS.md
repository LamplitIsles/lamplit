# Source imports for the direct Partner runtime

`apps/partner/runtime/prompts.ts` adapts the Companion base prompt and continuity
summary instruction from LamplitIsles/dsh-plugins at `29ed11a`, files
`packages/dsh-companion/src/prompt.ts` and `compaction.ts`, under Apache-2.0.
The Host-specific prompt assembly and request rewriting were removed. The
Apache-2.0 license text is retained in `licenses/dsh-hindsight-Apache-2.0.txt`.

Nanocodex and nanocodex-tools remain external package artifacts. The accepted
nanocodex candidate is built from `a300831bade7ec2cbc57ec6efc0aed36a6759b3d`
and has SHA-256
`3f00c4ac89140417affe36d81cecfbcb841a76354223b436e7042d64ef8f3cd7`.
`nanocodex-tools` remains unchanged at `828099bab8a2ac6ad4a075e4c599013253a13abf`
with SHA-256
`27d984ecc36f00a74e7463a6985019ab2b56f852b202ad7b1cabb5c20d8ce25c`.
The cache preparation script verifies both SHA-256 values. They are not copied source modules or publicly published
release claims. The deferred dynamic credential changes are not included.

Noto Sans SC
is supplied through `@fontsource/noto-sans-sc` under SIL Open Font License 1.1.
The direct runtime is not yet included in the existing container release;
update release notices and SBOM when changing that assembly.

`apps/partner/runtime/tools/dice-core.ts` and `image-core.ts` preserve the
host-independent cores from `packages/dsh-tabletop/src/core.ts` and
`packages/dsh-imagegen/src/core.ts` at dsh-plugins `29ed11a`, under Apache-2.0.
Mail tool names and argument contracts are adapted from dsh-mail at that revision;
the standalone transport uses the official `@modelcontextprotocol/sdk` directly.
It does not import the DSH credential or OAuth lifecycle.

The Svelte Companion UI under `apps/partner/src/lib/companion` is imported from
`packages/dsh-companion/src` at the same dsh-plugins revision, under Apache-2.0:
Companion, Markdown, themes/artwork, locale, composer, image drafts, voice input,
relationship-history and the relevant pure domain/media/continuity definitions.
DSH controller and view-registry integrations are removed. Lamplit's page binds
the presentation to its own HTTP snapshot and naco-owned execution state.
The relationship tools reuse the original domain validation and persist records
in SQLite. This import does not add DSH as a runtime dependency.

`runtime/speech.ts` adapts the Qwen3-ASR-Flash request/response protocol from
`packages/dsh-speech/src/gateway.ts` and `constants.ts` at dsh-plugins `29ed11a`
(Apache-2.0). Only transcription is included; no TTS gateway, player, cache,
Host credential provider or connection RPC is imported. The existing Companion
recording controller is reused; successful transcription now fills a draft
instead of automatically sending a message.

Patch editing uses `applyPatch({ workspace })` from the Node SDK, backed by
naco's canonical Rust/WASM planner. `viewImage` and `updatePlan` are also reused
from naco. Lamplit no longer carries a separate patch parser or matcher.
