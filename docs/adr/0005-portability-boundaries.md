# Keep portability claims observable

Lamplit's first container release documents only the persistence and export
boundaries that are observable today. DSH state, the Partner workspace, Keet
identity, Hindsight PostgreSQL data, and Codex Bridge auth are separate mounts.
The tested Hindsight memory export/import unit is a PostgreSQL custom-format
dump restored into a disposable compatible database.

The release does not claim full hosted-account portability. A portable Keet
identity export/import flow and a separate Keet/mailbox portability contract
remain concrete deferred work; mailbox provider configuration and OAuth data
are operator-owned. This keeps the freedom-of-choice message accurate without
promising an unverified migration path.
