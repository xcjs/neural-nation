# Umami Analytics Script Inclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject the Umami analytics tracking script into all pages of the Neural Nation site, with the domain and website ID configurable at runtime via environment variables.

**Architecture:** A client-side Nuxt plugin reads `runtimeConfig.public.umami` (populated from `NUXT_PUBLIC_UMAMI_DOMAIN` and `NUXT_PUBLIC_UMAMI_WEBSITE_ID` env vars) and calls `useHead()` to inject a `<script defer>` tag into `<head>`. When either env var is unset, the plugin silently skips injection.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, `useRuntimeConfig`, `useHead`, `defineNuxtPlugin`

## Global Constraints

- No new dependencies — uses Nuxt built-ins only (`runtimeConfig`, `useHead`, `defineNuxtPlugin`)
- Env var names: `NUXT_PUBLIC_UMAMI_DOMAIN` and `NUXT_PUBLIC_UMAMI_WEBSITE_ID` (exact)
- `runtimeConfig.public.umami` object shape: `{ domain: string, websiteId: string }` (exact key names)
- Default values for both keys: empty string `''` (exact)
- Script tag attributes: `src` = `https://<domain>/script.js`, `defer: true`, `data-website-id: <websiteId>` (exact)
- Plugin file must be named `plugins/analytics.client.ts` (client-only, `.client.ts` suffix)
- When either `umami.domain` or `umami.websiteId` is falsy, the plugin returns early — no script tag, no warning
- Site-wide scope (all pages)
- Follow existing code style (ESLint with `@antfu/eslint-config`)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `nuxt.config.ts` | Modify (lines 82-90) | Add `umami: { domain: '', websiteId: '' }` to `runtimeConfig.public` |
| `plugins/analytics.client.ts` | Create | Client-only Nuxt plugin: reads `runtimeConfig.public.umami`, injects Umami `<script defer>` via `useHead` when both values are present |
| `.env.example` | Modify (append) | Document the two new env vars |

---

### Task 1: Add Umami config to runtimeConfig and document env vars

**Files:**
- Modify: `nuxt.config.ts:82-90` (the `runtimeConfig` block)
- Modify: `.env.example` (append after line 12)

**Interfaces:**
- Produces: `runtimeConfig.public.umami` with shape `{ domain: string, websiteId: string }`, accessible via `useRuntimeConfig().public.umami` in any Nuxt plugin/composable/component. Default values are empty strings when env vars are unset.

- [ ] **Step 1: Add the `umami` object to `runtimeConfig.public` in `nuxt.config.ts`**

In `nuxt.config.ts`, the current `runtimeConfig` block (lines 82-90) is:

```ts
  runtimeConfig: {
    public: {
      version: pkg.version,
    },
    gameCleanupEnabled: true,
    gameCleanupAgeDays: 7,
    gameCleanupGraceDays: 1,
    gameCleanupIntervalHours: 6,
  },
```

Replace it with:

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

- [ ] **Step 2: Append the env var documentation to `.env.example`**

The current `.env.example` (12 lines) ends with:

```
GAME_CLEANUP_INTERVAL_HOURS=6
```

Append after that line:

```

# Umami analytics (optional — leave empty to disable)
NUXT_PUBLIC_UMAMI_DOMAIN=
NUXT_PUBLIC_UMAMI_WEBSITE_ID=
```

- [ ] **Step 3: Run lint and typecheck to verify config is valid**

Run: `npm run lint`
Expected: PASS (no errors)

Run: `npm run typecheck`
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add nuxt.config.ts .env.example
git commit -m "feat: add Umami analytics config to runtimeConfig"
```

---

### Task 2: Create the analytics plugin

**Files:**
- Create: `plugins/analytics.client.ts`

**Interfaces:**
- Consumes: `runtimeConfig.public.umami` from Task 1 — shape `{ domain: string, websiteId: string }`, accessed via `useRuntimeConfig().public.umami`
- Produces: A `<script defer src="https://<domain>/script.js" data-website-id="<id>">` tag in `<head>` when both values are present; nothing when either is falsy

- [ ] **Step 1: Create the plugin file**

Create `plugins/analytics.client.ts` with this content:

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

- [ ] **Step 2: Run lint and typecheck**

Run: `npm run lint`
Expected: PASS (no errors)

Run: `npm run typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Run the full test suite to verify no regressions**

Run: `npm test`
Expected: 117/117 passing (same as before — the plugin has no unit tests, but the suite must remain green)

- [ ] **Step 4: Commit**

```bash
git add plugins/analytics.client.ts
git commit -m "feat: add Umami analytics script injection plugin"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Runtime env-driven: `runtimeConfig.public.umami` reads from `NUXT_PUBLIC_UMAMI_*` env vars at runtime — Task 1
- ✅ Site-wide: Plugin runs at app init, injects into global `<head>` — Task 2
- ✅ Silent opt-out: Falsy check returns early, no warning — Task 2
- ✅ No new dependencies: Uses only Nuxt built-ins — both tasks
- ✅ Script loading with `defer`: `defer: true` in `useHead` script config — Task 2
- ✅ Env var names exact: `NUXT_PUBLIC_UMAMI_DOMAIN`, `NUXT_PUBLIC_UMAMI_WEBSITE_ID` — Task 1
- ✅ `.env.example` documentation: Appended in Task 1
- ✅ Plugin file name: `plugins/analytics.client.ts` — Task 2

**2. Placeholder scan:** No TBD/TODO/vague items. All code blocks contain exact content. All file paths and line numbers specified.

**3. Type consistency:** `runtimeConfig.public.umami` shape `{ domain: string, websiteId: string }` is consistent between Task 1 (config definition) and Task 2 (plugin consumption). Key names `domain` and `websiteId` match exactly. Env var names `NUXT_PUBLIC_UMAMI_DOMAIN` and `NUXT_PUBLIC_UMAMI_WEBSITE_ID` match between `.env.example` and the Nuxt auto-mapping convention.