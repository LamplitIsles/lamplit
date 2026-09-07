# Lamplit website

The public homepage and user guides live in `apps/web/`. The site addresses
people building a romantic relationship with an AI Partner. Its warm, dark
visuals and language centre on everyday companionship, shared memories, and a
home the user can run. Capability details belong in the guides; the homepage
should describe real capabilities without interrupting the experience with
unprompted disclaimers.

## Develop and verify

Use the repository's Node 24 and pnpm 11.22.0 baseline:

```bash
pnpm install --frozen-lockfile
pnpm run web:dev
pnpm run web:check
```

`web:check` runs Svelte/TypeScript diagnostics, a production build, and static
artifact tests. `pnpm run check` includes it alongside the repository checks.
The website tests read only generated files: they do not open a real Partner,
contact a model, or execute the deployment examples in the guides.

The Dagger interface builds the same artifact in the pinned Node toolchain:

```bash
dagger call -m dagger website --source=. entries
dagger call -m dagger website --source=. export --path=.build/website
```

Woodpecker runs this website check on pull requests and pushes to main. The
existing Core/Full image check and publication retain their own Dagger calls.
Website files and host build outputs stay out of the application Docker context.

## Static hosting

The production artifact is `apps/web/build/`. Serve that entire directory,
including `_app/`, font assets, `favicon.svg`, and generated `licenses.txt`,
with a static file host that resolves directory URLs to `index.html`.

No custom Worker handler, Node server, database, or browser JavaScript runtime is required.
The server load functions and HTML language hook execute during prerendering.
All page navigation, the language switch, and FAQ disclosure use native HTML.
Cloudflare Workers Static Assets hosts these files directly, using the same
assets-only model as the Kepos website. `wrangler.json` configures
`lamplit.guion.io` in the existing Guion account, keeps trailing slashes, and
returns the static `404.html` for unknown paths with HTTP 404. No SPA fallback
or custom Worker script is configured.

The hostname in `wrangler.json` is the single source for the deployment route,
absolute canonical/alternate URLs, Open Graph URLs, sitemap, and robots file.
Change that custom-domain route and rebuild when the permanent domain arrives.

Deployment is an operator action. These commands run from the repository root:

```bash
# Verify the site and validate the upload locally; does not publish.
pnpm run web:deploy:dry-run

# With your authorized Cloudflare session, verify and publish.
pnpm run web:deploy
```

The deploy command uploads the complete verified static build. It also applies
the configured custom domain, so the operator needs access to the Guion account
and its DNS zone. Woodpecker verifies the website but does not deploy it or
receive Cloudflare credentials. After publishing, check both `/docs/start/`
and `/zh/docs/start/`, their language switch, and an unknown URL's HTTP 404.

## Two languages, one set of templates

English is served at `/` and `/docs/`; Chinese at `/zh/` and `/zh/docs/`.
SvelteKit's optional `[[lang=locale]]` route matches the Chinese prefix, while
unprefixed routes render English. Other language prefixes are not published.

`src/lib/content/zh-CN/` and `src/lib/content/en/` contain short site copy,
the guide registry, and the Markdown guides. English copy satisfies the
Chinese content shape in TypeScript. Templates receive the selected content
from layout data; they never read mutable global language state.

The language switch points to the equivalent page. A visit to a Chinese
URL always renders Chinese, regardless of cookies or browser preferences.
Navigation and Markdown links beginning with `/` are language-neutral in
source; the renderer adds the active language prefix. External URLs remain
unchanged. Each static document carries its language and alternate links.

For this editorial site, typed content objects and Markdown are the complete
i18n implementation. [Paraglide](https://github.com/opral/paraglide-js/blob/main/docs/static-site-generation.md)
also supports URL-based static generation and would be useful if interactive
messages, interpolation, or plural rules become substantial. We do not need a
message compiler for the current pages.

Svelte supplies components; SvelteKit supplies file routes, build-time data
loading, and [static prerendering](https://svelte.dev/docs/kit/adapter-static).
That is why this repository uses SvelteKit even though the deployed result is
ordinary static files.

## Add the real screenshots

The two homepage slots are deliberately unfilled. They use visible placeholder
labels instead of invented conversations or a fabricated memory graph.

1. Put the selected, publication-ready captures in `apps/web/static/images/`.
2. Set `keet` and `memory` in `src/lib/media.ts` to `{ src, width, height }`.
   `src` is a root-relative path such as `/images/keet-mobile.webp`; use the
   image's real pixel dimensions.
3. Update both languages' alt text to describe the actual capture, then run
   `pnpm run web:check` and inspect desktop and mobile layouts.

The Keet slot is a portrait frame, approximately 9:18.5. The Hindsight slot is
landscape, approximately 16:10 on desktop. Both display the complete capture
with `object-fit: contain`, so graph labels and conversation text are not
cropped away. A single capture is shared across both languages unless the
operator provides separate localized captures in a future change.

The candle is authored CSS, including the restrained flame animation. Reduced
motion preferences disable the animation. Fonts are self-hosted through
Fontsource. The build generates a license file from the installed packages;
retain it with the static artifact.
