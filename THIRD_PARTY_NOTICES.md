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
| `@lamplitisles/dsh-hindsight` | See inventory below | Apache-2.0 | [`licenses/dsh-hindsight-Apache-2.0.txt`](licenses/dsh-hindsight-Apache-2.0.txt) |

Hindsight is retained as its own MIT-licensed upstream service. The
`dsh-hindsight` adapter is retained as an Apache-2.0-licensed package in the
Full profile. Neither license is replaced by the Lamplit repository license.

## Other bundled components

The DSH runtime and its transitive npm dependencies are resolved by
`docker/lamplit/runtime-package-lock.json`; the SPDX SBOM records each locked
package and its declared license. The directly assembled plugin packages use
their upstream package licenses and immutable inputs:

<!-- BEGIN PLUGIN INVENTORY -->
| Plugin | Version | License | Images |
| --- | --- | --- | --- |
| [`@guionai/dsh-web`](https://www.npmjs.com/package/@guionai/dsh-web/v/0.7.1) | 0.7.1 | Apache-2.0 | Core / Full |
| [`@lamplitisles/dsh-companion`](https://www.npmjs.com/package/@lamplitisles/dsh-companion/v/0.3.2) | 0.3.2 | Apache-2.0 | Core / Full |
| [`@lamplitisles/dsh-speech`](https://www.npmjs.com/package/@lamplitisles/dsh-speech/v/0.1.2) | 0.1.2 | Apache-2.0 | Core / Full |
| [`@lamplitisles/dsh-mail`](https://www.npmjs.com/package/@lamplitisles/dsh-mail/v/0.1.5) | 0.1.5 | Apache-2.0 | Core / Full |
| [`@lamplitisles/dsh-hindsight`](https://www.npmjs.com/package/@lamplitisles/dsh-hindsight/v/0.1.1) | 0.1.1 | Apache-2.0 | Full |
| [`@lamplitisles/dsh-imagegen`](https://www.npmjs.com/package/@lamplitisles/dsh-imagegen/v/0.6.0) | 0.6.0 | Apache-2.0 | Full |
| `@lamplitisles/dsh-keet` | 0.1.0 | Apache-2.0 | Core / Full |

Keet is built from [`e5e90c145b5dfd16b4e88d3154f672a310b35235`](https://github.com/lamplitisles/keet-for-agent/tree/e5e90c145b5dfd16b4e88d3154f672a310b35235).
The npm tarball URLs and SHA-512 integrity values are recorded in
[`config/plugin-inputs.json`](config/plugin-inputs.json) and the SPDX SBOM.
<!-- END PLUGIN INVENTORY -->

The independently published memory images retain their upstream licenses and
notices. PostgreSQL 18 with PGroonga 4.0.8 and pgvector 0.8.6 remains an external
artifact. The default ONNX Hindsight image is built from
`docker/hindsight/Dockerfile`; its
model card, upstream licenses, assembly notice, and Python package inventory
are carried in `/usr/share/doc/lamplit-hindsight/`. See
[`docs/hindsight-onnx.md`](docs/hindsight-onnx.md). Version and published-digest
inputs are recorded in `config/memory-images.json`. The publisher-side review
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
