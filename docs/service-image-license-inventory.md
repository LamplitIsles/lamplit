# Memory service image license inventory

This is Lamplit's publisher-side notice review for the two independently
published memory-service images used by `compose.yaml`. It records the public
manifest inspected on 2026-09-07. This inventory does not require publishing
the private build definitions, which remain outside this repository.

## Hindsight

- Image: `ghcr.io/lamplitisles/lamplit-hindsight:0.1.1`
- Published digest:
  `sha256:69462bc7a30d0b280843eaf0cea674e45b9d07f6d8d53f9bfc158127a06e8386`
- Upstream: Hindsight 0.9.2 (`vectorize-io/hindsight`)
- License: MIT, declared in `/app/api/pyproject.toml`
- Preserved text:
  [`licenses/hindsight-0.9.2-MIT.txt`](../licenses/hindsight-0.9.2-MIT.txt)

The inspected image contains the license files shipped with its Python and
system dependencies, but not the complete Hindsight MIT text. Lamplit's
Compose distribution therefore supplies that text alongside the image pin.
The next Hindsight image rebuild should also copy the text into the image so
the service image is independently self-describing.

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
