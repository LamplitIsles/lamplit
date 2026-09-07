# Lamplit-owned code uses Elastic License 2.0

Lamplit-owned repository code and Lamplit-authored image assembly use Elastic
License 2.0 (`Elastic-2.0`). Core and Full source/images remain publicly
available and free for compliant self-hosting, while Lamplit is described as
source-available rather than OSI open source. The Elastic License hosted or
managed-service restriction keeps the hosted control plane and its service
terms outside this repository.

The distribution keeps upstream terms separate. Hindsight 0.9.2 remains MIT
and `@lamplitisles/kepos-hindsight` 0.2.0 remains Apache-2.0; their license
texts are preserved under `licenses/` and indexed by
`THIRD_PARTY_NOTICES.md`. Every released image carries those notices and an
SPDX SBOM under `/usr/share/doc/lamplit/`, and release automation uploads the
same machine-readable and human-readable files as downloadable artifacts.

This decision leaves users free to choose public self-hosting, BYOK provider
keys, or official managed hosting where offered. Provider choice and
model-token costs remain with a BYOK user; Lamplit Points cover only
Lamplit-provided hosted resources and value. The repository does not claim full
account portability: a PostgreSQL custom-format dump is the observable
Hindsight memory backup unit, while tested Keet and mailbox portability remain
deferred.
