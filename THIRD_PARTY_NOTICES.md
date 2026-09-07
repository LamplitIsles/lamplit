# Lamplit third-party notices

Lamplit-owned repository code and Lamplit-authored image assembly are licensed
under the Elastic License 2.0 (`Elastic-2.0`), in [`LICENSE`](LICENSE). This
file records the separate notices that travel with the Core and Full images;
it does not relicense any upstream component. The complete machine-readable
inventory is [`sbom/lamplit.spdx.json`](sbom/lamplit.spdx.json), and released
images install both this file and the `licenses/` directory at
`/usr/share/doc/lamplit/` (including the short `NOTICE` index).

## Required upstream notices

| Component | Version or source | License | Preserved text |
| --- | --- | --- | --- |
| Hindsight | 0.9.2, `vectorize-io/hindsight` | MIT | [`licenses/hindsight-0.9.2-MIT.txt`](licenses/hindsight-0.9.2-MIT.txt) |
| `@lamplitisles/kepos-hindsight` | 0.2.0 | Apache-2.0 | [`licenses/kepos-hindsight-0.2.0-Apache-2.0.txt`](licenses/kepos-hindsight-0.2.0-Apache-2.0.txt) |

Hindsight is retained as its own MIT-licensed upstream service. The
`kepos-hindsight` adapter is retained as an Apache-2.0-licensed package in the
Full profile. Neither license is replaced by the Lamplit repository license.

## Other bundled components

The DSH runtime and its transitive npm dependencies are resolved by
`docker/lamplit/runtime-package-lock.json`; the SPDX SBOM records each locked
package and its declared license. The directly assembled plugin packages use
their upstream package licenses and immutable inputs:

- `@guionai/dsh-web@0.6.2` — Apache-2.0.
- `@lamplitisles/dsh-companion@0.2.3` — Apache-2.0.
- `@lamplitisles/kepos-speech@0.2.4` — Apache-2.0.
- `@lamplitisles/dsh-imagegen@0.4.0` — Apache-2.0 (Full only).
- `@lamplitisles/dsh-mail@0.1.2` — Apache-2.0, resolved from its public npm
  package with npm provenance. Published tarball integrity is
  `sha512-pXEpQv6g2LM6rtKej5KemXlO1wc8zFDkzuycEJXNXo8ItAZzHPAMJG4jSbV51OyyCNfftkaTBhHvtbDv7sDwdA==`.
- `@lamplitisles/dsh-keet@0.1.0` — Apache-2.0, built from commit
  `1741c5e7ada7919db4a6b241db23ceefa39d875d`.

The independently published Kosmos service images retain the licenses and
notices supplied by their upstream bases: PostgreSQL 18 with PGroonga 4.0.8
and pgvector 0.8.6, and the Hindsight base image. Their source, version, and
published-digest inputs are recorded in `config/memory-images.json`; Lamplit
does not rebuild those images in this repository. The publisher-side review
of their notices is recorded in
[`docs/service-image-license-inventory.md`](docs/service-image-license-inventory.md).
The application SBOM intentionally does not represent these external
service-image components as npm packages.

## Public website

The separately built static website uses Svelte/SvelteKit, Tailwind CSS, and
daisyUI under their MIT licenses. Its self-hosted Noto Sans SC, Noto Serif SC,
Newsreader, and IBM Plex Sans fonts retain SIL Open Font License 1.1 terms.
`apps/web/scripts/generate-notices.mjs` preserves those package license texts
alongside Lamplit's Elastic License in the website artifact's `licenses.txt`.
Website dependency versions are locked in the root `pnpm-lock.yaml`; the
container SBOM above describes the application images, not the separate site.

## Distribution rule

Lamplit releases keep [`NOTICE`](NOTICE), this notice file,
[`LICENSE`](LICENSE), the `licenses/` directory, and the SBOM together. The
Compose distribution also carries the full Hindsight MIT text while the
current Hindsight service image carries only its upstream license declaration;
a future rebuild will place the full text in that service image as well.
