# AGENTS.md

Guidance for coding agents working in this repository. Humans should read
`README.md` first — this file only covers what an agent needs to not break
things.

## What this is

`particle-charts` — a zero-dependency JavaScript charting library that renders
data as particles on a `<canvas>`. The repository holds both the library
(`src/`) and the landing page served at <https://particlecharts.com>
(`index.html` plus `site/`).

## Setup

```bash
npm ci
npm start      # builds, then serves the demo on http://localhost:4173
```

No framework, no bundler config, no test runner dependency. Node 18+.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Bundles `src/` into `dist/` with esbuild. Output is reproducible — no timestamps. |
| `npm test` | Runs `scripts/test.js` against a DOM stub. No browser needed. |
| `npm run typecheck` | Type-checks `index.d.ts` with `tsc --strict`. |
| `npm start` | Build, then serve the landing page. |

Run all three before proposing a change. CI runs them on Node 18, 20 and 22.

## Rules that are easy to get wrong

- **`dist/` is committed.** The demo and the CDN serve it straight from the
  repo. CI fails if a fresh `npm run build` produces a diff, so rebuild and
  commit `dist/` in the same change as any `src/` edit.
- **Never hand-edit the version.** `src/index.js` carries a literal version
  string that must match `package.json`; a test asserts it. Use
  `npm version <major|minor|patch>`, which syncs and rebuilds via
  `scripts/sync-version.js`.
- **Publishing happens in CI only.** `publishConfig.provenance` is `true`, so
  `npm publish` from a laptop fails with `provider: null`. Releases go through
  `.github/workflows/release.yml`, which publishes over OIDC trusted publishing
  with no token. Tag with `v*` or run the workflow manually.
- **The landing page has a Content-Security-Policy in a `<meta>` tag** with
  SHA-256 hashes for each inline `<script>`. Editing an inline script without
  updating the hash breaks the page; `npm test` catches it.
- **Accessibility is a tested property, not a nicety.** The page targets WCAG
  2.2 AA: colour tokens are chosen to clear 4.5:1 on every surface they land
  on, every focusable control has a visible focus ring, and the charts expose a
  hidden data table. Do not introduce a colour without checking its contrast.

## Layout

```
src/core/      chart base class, options, renderer, particles, axis, legend, tooltip
src/charts/    per-type subclasses (line, bar, pie, bubble, radar)
src/index.js   public entry; ParticleChart is a factory that picks a subclass by type
dist/          committed build output
index.html     the landing page
site/          landing page CSS and JS (a consumer of the public API only)
scripts/       build, test, serve, version sync
```

`ParticleChart` is a **factory**, not a class — `new ParticleChart(el, {type})`
returns a per-type subclass. Changing `type` via `setOptions` does not morph
between chart types; the caller has to rebuild.

## Style

Match the surrounding code: two-space indent, semicolons, single quotes, no
TypeScript in `src/`. Comments explain *why*, not *what* — the existing ones
set the bar. British or American spelling, whichever the nearby file uses.
