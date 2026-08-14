# GitHub Repository Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed-position GitHub repository link with the GitHub mark logo in the bottom-right corner of the main landing page.

**Architecture:** A static SVG file in `public/` serves the GitHub mark logo. A fixed-position `<a>` tag in `pages/index.vue` pins the logo to the viewport's bottom-right corner, styled with Tailwind opacity transitions to match the cyberpunk cyan theme.

**Tech Stack:** Nuxt 3, Vue 3, Tailwind CSS

## Global Constraints

- No new dependencies (no icon library)
- GitHub mark SVG must use `fill="#22d3ee"` (Tailwind cyan-400)
- Link opens in new tab with `rel="noopener noreferrer"`
- Link appears only on `pages/index.vue`, not in the layout or other pages
- Follow existing code style: no semicolons in TS, Tailwind utility classes, `font-mono` aesthetic

---

## File Structure

| File | Responsibility |
| --- | --- |
| `public/github-mark.svg` | New static asset — official GitHub mark logo path, monochrome, `fill="#22d3ee"` |
| `pages/index.vue` | Add fixed-position `<a>` element with `<img>` before closing root `</div>` |

---

### Task 1: Add the GitHub mark SVG asset

**Files:**
- Create: `public/github-mark.svg`

**Interfaces:**
- Produces: A static SVG file served at `/github-mark.svg`, containing the official GitHub mark logo path with `fill="#22d3ee"`, viewBox `0 0 16 16`, no width/height attributes (sized via CSS in the consumer).

- [ ] **Step 1: Create the SVG file**

Create `public/github-mark.svg` with this content:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="#22d3ee" aria-hidden="true">
  <path d="M8 0c4.42 0 8 3.58 8 8a8.13 8.13 0 0 1-5.45 7.66c-.6.11-.82-.26-.82-.57 0-.28.01-1.02.02-2-3.33.72-4.03-1.61-4.03-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.08-.73.08-.73 1.2.09 1.83 1.24 1.83 1.24 1.08 1.83 2.81 1.3 3.5.99.1-.78.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.42.36.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .31.21.69.82.57A8.13 8.13 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
</svg>
```

- [ ] **Step 2: Verify the file exists and is valid XML**

Run: `Test-Path public/github-mark.svg`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add public/github-mark.svg
git commit -m "feat: add GitHub mark SVG asset"
```

---

### Task 2: Add the GitHub link to the main page

**Files:**
- Modify: `pages/index.vue` (insert before the closing `</div>` on line 200, after the `ChangelogPanel` on line 199)

**Interfaces:**
- Consumes: `/github-mark.svg` static asset from Task 1

- [ ] **Step 1: Add the link element to the template**

In `pages/index.vue`, replace this block (lines 199–200):

```html
    <ChangelogPanel v-if="changelog.length" v-model:open="changelogOpen" :data="changelog" />
  </div>
```

with:

```html
    <ChangelogPanel v-if="changelog.length" v-model:open="changelogOpen" :data="changelog" />

    <a
      href="https://github.com/xcjs/neural-nation"
      target="_blank"
      rel="noopener noreferrer"
      class="fixed bottom-4 right-4 opacity-50 hover:opacity-100 transition-opacity duration-200"
      aria-label="View source on GitHub"
    >
      <img src="/github-mark.svg" alt="GitHub" class="w-7 h-7">
    </a>
  </div>
```

- [ ] **Step 2: Verify the page renders without errors**

Run: `npm run dev` (start dev server, navigate to `http://localhost:3000`, confirm the GitHub logo appears in the bottom-right corner and links to `https://github.com/xcjs/neural-nation`)

Expected: Logo visible bottom-right, cyan-400 colored, opacity increases on hover, clicking opens the GitHub repo in a new tab.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint`
Run: `npm run typecheck`
Expected: Both pass with no errors

- [ ] **Step 4: Commit**

```bash
git add pages/index.vue
git commit -m "feat: add GitHub repository link to main page"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ GitHub mark SVG file in `public/` → Task 1
- ✅ `fill="#22d3ee"` (cyan-400) → Task 1 SVG content
- ✅ Fixed bottom-right positioning (`fixed bottom-4 right-4`) → Task 2
- ✅ Link to `https://github.com/xcjs/neural-nation` → Task 2
- ✅ `target="_blank"`, `rel="noopener noreferrer"` → Task 2
- ✅ Only on main page (`pages/index.vue`) → Task 2
- ✅ Opacity hover transition (`opacity-50 hover:opacity-100 transition-opacity duration-200`) → Task 2
- ✅ `w-7 h-7` (28px) sizing → Task 2
- ✅ `aria-label` for accessibility → Task 2

**2. Placeholder scan:** No TBDs, TODOs, or vague instructions. All code blocks contain complete content.

**3. Type consistency:** N/A — no shared functions or types across tasks. Task 2 consumes the static asset path `/github-mark.svg` produced by Task 1.