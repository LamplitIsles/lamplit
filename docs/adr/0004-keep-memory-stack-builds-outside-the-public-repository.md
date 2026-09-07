# Keep memory-stack builds outside the public repository

The public Lamplit repository builds and publishes only the Core and Full
DSH application images through Dagger. The already built Kosmos multilingual
Hindsight and PostgreSQL images are verified with disposable offline probes,
published unchanged as independent public GHCR packages, and consumed by Full
Compose at their returned immutable digests. Kepos Codex Bridge is likewise
consumed from its independently published GHCR digest. This keeps the
expensive, infrequently changed memory stack out of normal Lamplit checks and
releases, avoids exhausting local WSL resources, and keeps its private build
recipes outside this public repository.
