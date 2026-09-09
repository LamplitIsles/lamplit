# External service image license inventory

This is Lamplit's publisher-side notice review for the two independently
published memory-service images used by `compose.yaml`. Hindsight 0.1.2 was
inspected on 2026-09-08; the unchanged PostgreSQL artifact was originally
inspected on 2026-09-07. The Codex Bridge section records its separately
verified public registry metadata.

## Hindsight

- Image: `ghcr.io/lamplitisles/lamplit-hindsight:0.1.2`
- Published digest:
  `sha256:c95b8c604824c778c3ec63105c8382f23e3561c7a56b5334a60777efd8b809dd`
- Upstream: Hindsight 0.9.2 (`vectorize-io/hindsight`), MIT
- Model and tokenizer: multilingual MiniLM, Apache-2.0
- Assembly: Lamplit, Elastic License 2.0
- Image notice: [`docker/hindsight/NOTICE.md`](../docker/hindsight/NOTICE.md)

The image contains the complete Hindsight MIT text, Apache-2.0 text, assembly
license, model card, notice, and installed Python distribution inventory under
`/usr/share/doc/lamplit-hindsight/`. Its Python and system dependencies also
retain their package-level notices. The Core/Full npm SBOM is separate from
this service's Python inventory. Reproducible model and dependency inputs are
recorded in [hindsight-onnx.md](hindsight-onnx.md).

## PostgreSQL memory store

- Image: `ghcr.io/lamplitisles/lamplit-hindsight-postgres:0.1.1`
- Published digest:
  `sha256:23f06f49ad9683bd601ac8fb4ed478d6361ad066b2d6c2777cb8f3f91b343a77`
- PostgreSQL: 18.4, PostgreSQL License
- PGroonga: 4.0.8, PostgreSQL License
- pgvector: 0.8.6, PostgreSQL License
- Groonga runtime: 16.0.8, primarily LGPL-2.1-or-later with separately
  identified bundled-component terms

The inspected Debian packages preserve their copyright and complete license
notices in the image, including:

- `/usr/share/doc/postgresql-18/copyright`
- `/usr/share/doc/postgresql-18-pgdg-pgroonga/copyright`
- `/usr/share/doc/postgresql-18-pgvector/copyright`
- `/usr/share/doc/libgroonga0/copyright`
- the corresponding `/usr/share/doc/*/copyright` files for the remaining
  installed Debian packages

These Debian copyright files are the authoritative package-level inventory;
they enumerate additional bundled works and their distinct terms instead of
flattening the whole image to a single license.

## Release handling

The immutable public digests above are also the Compose defaults and the
`publishedDigest` values in `config/memory-images.json`. A service-image update
requires repeating this inspection for the new digest and updating this
inventory, the configuration, and the Compose pin together.

<!-- BEGIN BRIDGE INVENTORY -->
## Codex Bridge

Compose follows the bridge's `latest` tag. The update command verifies the
matching source tag and records this immutable snapshot for reproducibility:

- Image: `ghcr.io/lamplitisles/kepos-codex-bridge:sha-13ed2c6d195d04f7ef475eacc8a92644c2c4f0f5`
- Digest: `sha256:06df8bb87934e3ee2414525a883852b4391bcc1dbf58604c7b0f6eac92555e60`
- Source revision: `13ed2c6d195d04f7ef475eacc8a92644c2c4f0f5`
- Declared image license: Apache-2.0
- Registry metadata verified: 2026-09-09

This records the published OCI metadata; it does not claim a package-level
license audit of the bridge's operating-system layers.
<!-- END BRIDGE INVENTORY -->
