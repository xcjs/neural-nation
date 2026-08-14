# Dynamic Umami Analytics Script Inclusion — Design Spec

**Date:** 2026-08-14
**Status:** Approved
**Branch:** `update/minor-frontend-fixes` (or successor)

## Goal

Inject the Umami analytics tracking script into all pages of the Neural Nation site, with the Umami domain and website ID configurable at runtime via environment variables. When the env vars are not set, the script is silently omitted — local development is unaffected.

## Requirements

- **Runtime env-driven:** The Umami domain and website ID must be read from environment variables at runtime (not baked in at build time).
- **Site-wide:** Analytics tracks all pages, not just the landing page.
- **Silent opt-out:** When either env var is unset, no script tag is injected and no warning is emitted.
- **No new dependencies:** Uses Nuxt's built-in `runtimeConfig` and `useHead` composable.
- **Script loading:** `defer` attribute (non-blocking, fires after HTML parse).

## Environment Variables

| Env var | Maps to | Example | Purpose |
|---|---|---|---|
| `NUXT_PUBLIC_UMAMI_DOMAIN` | `runtimeConfig.public.umami.domain` | `analytics.example.com` | Umami instance host (no scheme, no trailing slash) |
| `NUXT_PUBLIC_UMAMI_WEBSITE_ID` | `runtimeConfig.public.umami.websiteId` | `d4e5f6a7-b8c9-...` | Umami website/tracking ID |

Nuxt 4 auto-maps `NUXT_PUBLIC_*` env vars to `runtimeConfig.public.*` keys by name.

## Architecture

A client-side Nuxt plugin reads `runtimeConfig.public.umami` at app init and calls `useHead()` to inject the Umami `<script defer>` tag into `<head>`. The plugin is client-only (`.client.ts` suffix) to avoid running the injection logic on the server, while `useHead` ensures the tag still renders in the SSR output.

### Data Flow

```
.env / environment
  →  NUXT_PUBLIC_UMAMI_DOMAIN, NUXT_PUBLIC_UMAMI_WEBSITE_ID
  →  Nuxt runtimeConfig.public.umami.{domain, websiteId}
  →  plugins/analytics.client.ts reads config
  →  useHead() injects <script defer> into <head>
  →  Umami script.js loads, begins tracking
```

## Components

### 1. `nuxt.config.ts` — runtimeConfig extension

Add an `umami` object to the existing `runtimeConfig.public` block (currently lines 82-90):

```ts
runtimeConfig: {
  public: {
    version: pkg.version,
    umami: {
      domain: '',
      websiteId: '',
    },
  },
  gameCleanupEnabled: true,
  gameCleanupAgeDays: 7,
  gameCleanupGraceDays: 1,
  gameCleanupIntervalHours: 6,
},
```

The empty-string defaults mean the plugin's falsy check fails and no script is injected when the env vars are absent.

### 2. `plugins/analytics.client.ts` — new file

```ts
export default defineNuxtPlugin(() => {
  const { umami } = useRuntimeConfig().public

  if (!umami.domain || !umami.websiteId)
    return

  useHead({
    script: [
      {
        src: `https://${umami.domain}/script.js`,
        defer: true,
        'data-website-id': umami.websiteId,
      },
    ],
  })
})
```

- **Consumes:** `runtimeConfig.public.umami.domain` and `.websiteId`
- **Produces:** A `<script defer src="https://<domain>/script.js" data-website-id="<id>">` tag in `<head>`, or nothing if either value is empty
- **Scope:** Client-only plugin (`.client.ts` suffix) — the injection logic runs client-side, but `useHead` ensures the tag is present in SSR-rendered HTML

### 3. `.env.example` — documentation

Append to the existing file:

```
# Umami analytics (optional — leave empty to disable)
NUXT_PUBLIC_UMAMI_DOMAIN=
NUXT_PUBLIC_UMAMI_WEBSITE_ID=
```

## Error Handling

- **Missing env vars (both unset or either unset):** Plugin returns early — no script tag injected. No console warning, no error. Local dev is unaffected.
- **Malformed domain (e.g. missing scheme, trailing slash):** Not validated. The plugin constructs `https://<domain>/script.js` — a misconfigured domain results in a 404 from the Umami script URL, which is a deployment misconfiguration, not an app concern. No validation logic is added (YAGNI).
- **Empty string vs unset:** Both treated identically via falsy check (`!umami.domain`). No distinction needed.

## Testing

- No unit test for the plugin itself — it is ~10 lines of glue reading config and calling `useHead`. The existing test suite (117 tests) must remain green. Lint and typecheck must pass on the new file.
- Manual verification: set `NUXT_PUBLIC_UMAMI_DOMAIN` and `NUXT_PUBLIC_UMAMI_WEBSITE_ID`, run `npm run dev`, inspect `<head>` in the browser for the Umami `<script defer>` tag with the correct `src` and `data-website-id` attributes. Unset the vars, restart, and confirm the tag is absent.

## Out of Scope

- Domain/ID validation or normalization
- Console warnings when env vars are missing
- Event tracking calls (e.g. `umami.trackEvent`) — only the script inclusion
- Per-page or per-route analytics configuration
- Excluding specific routes (e.g. the game screen) from tracking