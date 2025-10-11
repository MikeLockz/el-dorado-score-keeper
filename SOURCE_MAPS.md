# Source Map Enablement Plan

## Objectives

- Emit JavaScript and CSS source maps for local, preview, and staging builds so engineers and observability tooling can de-obfuscate stack traces.
- Keep production bundles free of public source map references unless explicitly enabled.
- Deliver a repeatable workflow that uploads source maps to the observability vendor(s) used by this project.

## Requirements & Guardrails

- Non-production only: source maps must only ship when an explicit toggle is set (e.g. local dev, preview deploys, dedicated staging). Production builds should remain unchanged by default.
- Coverage: browser JavaScript (client + edge/runtime chunks) and all CSS outputs (global styles, CSS modules, Tailwind/PostCSS outputs).
- Observability readiness: generated maps must include stable `sourcesContent` so they can be uploaded and consumed by New Relic / HyperDX (present in repo) or any other APM without needing the original filesystem.
- Automation-friendly: CI builds should be able to opt-in and persist artifacts for upload without manual steps.
- Security: ensure the public bundles do not advertise `.map` URLs when we intend the maps to stay private; rely on artifact upload instead of shipping the files with the deploy.

## Current State Highlights

- Next.js 15 project (`next.config.mjs`) with custom webpack hook and static export mode for GitHub Pages.
- PostCSS pipeline present (`postcss.config.mjs`) but no explicit map configuration; Next defaults to disabling maps in production.
- Observability scripts (`scripts/observability/*`) already exist, indicating integrations with New Relic and HyperDX; no source map upload workflow today.

## Implementation Steps

### 1. Add Explicit Source Map Toggle

- Introduce an env flag such as `ENABLE_SOURCE_MAPS=1` (and optionally `NEXT_SOURCE_MAP_UPLOAD_TOKEN`) respected in all build contexts.
- Centralize a helper (e.g. `config/source-maps.mjs`) that resolves `shouldEmitSourceMaps` based on `process.env.NODE_ENV`, and the new flag to avoid drift across scripts and CI configs.
- Implementation lives at `config/source-maps.mjs` exporting `resolveSourceMapSettings()` and `shouldEmitSourceMaps()`.
- Document expected values for local dev (`ENABLE_SOURCE_MAPS=1 pnpm dev:next`) and preview/staging pipelines.

### 2. Update Next.js Build Configuration

- In `next.config.mjs`, compute `const { shouldEmitSourceMaps: enableSourceMaps } = resolveSourceMapSettings()` and:
  - Set `productionBrowserSourceMaps: enableSourceMaps`.
  - Override `webpack` `config.devtool` to `'hidden-source-map'` for the client bundles (and `'source-map'` for server) when enabled so source map files are generated without embedding `//# sourceMappingURL=` in delivered assets.
- Gate the logic behind the toggle so production builds stay untouched unless the flag is passed.

```ts
// next.config.mjs (excerpt)
const { shouldEmitSourceMaps: enableSourceMaps } = resolveSourceMapSettings();

const nextConfig = {
  productionBrowserSourceMaps: enableSourceMaps,
  webpack: (config, { dev, isServer }) => {
    if (!dev && enableSourceMaps) {
      config.devtool = isServer ? 'source-map' : 'hidden-source-map';
      config.experiments = {
        ...(config.experiments || {}),
        buildSourceMaps: true,
      };
    }
    // existing aliases ...
    return config;
  },
};
```

### 3. Ensure CSS Loaders Emit Maps

- Hook into the webpack config when `enableSourceMaps` is true to set `sourceMap: true` on `css-loader`, `postcss-loader`, and `sass-loader` (if applicable) rules that Next injects. Implemented via `enableStyleSourceMaps()` in `next.config.mjs`.
- For PostCSS, `postcss.config.mjs` now imports the shared helper and sets `map: { inline: false, annotation: false }` when the flag is on.
- Validate that generated CSS files in `.next/static/css/` include matching `.map` companions during a staged build.

### 4. Observability Artifact Workflow

- Archiving implemented: `scripts/observability/upload-source-maps.ts` walks `.next/**/*.map` (or `out/`) and writes `artifacts/source-maps-<channel>-<sha>.tar.gz` plus a JSON manifest when the flag is enabled.
- The script derives release metadata (channel + git sha) and skips runtime when `ENABLE_SOURCE_MAPS` was not set for the build.
- New Relic uploads implemented: set `SOURCE_MAP_UPLOAD_PROVIDER=newrelic` with `NEW_RELIC_USER_API_KEY`, `NEW_RELIC_BROWSER_APP_ID`, and `NEW_RELIC_SOURCE_MAP_BASE_URL` (plus optional `NEW_RELIC_SOURCE_MAP_RELEASE`, `NEW_RELIC_REGION`).
- HyperDX branch remains TODO once API requirements are finalized.
- GitHub Pages deploy workflow (`.github/workflows/deploy.yml`) enables source maps during the build and invokes the uploader automatically when the required secrets are present.
- Store auth tokens securely (CI secrets) and document required env vars (`NEW_RELIC_USER_API_KEY`, `HYPERDX_API_KEY`).

### 5. Local & Preview Verification

- Add a `pnpm build:with-source-maps` convenience script that sets the flag and prints the location of the generated maps.
- Provide instructions for using Chrome DevTools & HyperDX to confirm human-readable stack traces in a preview build.
- Update existing observability smoke test (`scripts/observability/smoke.ts`) to assert that sourcemap lookups resolve when the flag is on.

### 6. Rollout & Safety Nets

- Default the flag off in production pipelines; require an explicit opt-in for any new environment.
- Monitor bundle sizes in preview builds to ensure the hidden source maps do not regress performance (maps are uploaded, not served).
- Add automated checks that fail CI if the flag is on but no `.map` files were produced (protects against future regressions when upgrading Next).
- Document remediation: how to purge outdated maps and re-upload if a release is rolled back.

## Open Questions / Follow-Ups

- Confirm which observability platform(s) need the upload flow first (New Relic vs HyperDX) and validate their API requirements.
- Decide whether server-side (Node) stack traces also require source maps; if so expand plan to include `next.config.sourcemap` for server bundles.
- Evaluate storage/retention for generated artifacts (e.g. S3 bucket, vendor-provided storage).
- Determine if any compliance constraints restrict retaining sourcesContent in the maps; adjust configuration accordingly.
