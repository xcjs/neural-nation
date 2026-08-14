# GitHub Repository Link — Design Spec

**Date:** 2026-08-14
**Branch:** `update/minor-frontend-fixes`

## Summary

Add a fixed-position link to the GitHub repository (`https://github.com/xcjs/neural-nation`) with the GitHub mark logo in the bottom-right corner of the main landing page.

## Context

The main landing page (`pages/index.vue`) is a centered flex layout on a black background with a cyberpunk cyan-on-black aesthetic (Tailwind CSS, `font-mono`, `text-cyan-*` palette). The bottom of the content block contains the version number and a "What's new?" changelog button, both centered. There is no icon library installed; the project uses Tailwind CSS only.

## Requirements

- A GitHub mark logo links to `https://github.com/xcjs/neural-nation`
- Opens in a new tab (`target="_blank"`, `rel="noopener noreferrer"`)
- Positioned in the bottom-right corner of the viewport
- Appears only on the main landing page (`pages/index.vue`), not on `/play` or `/watch`
- Visual style matches the existing cyberpunk cyan theme
- Subtle by default, brightens on hover

## Design

### Asset: `public/github-mark.svg`

A static SVG file containing the official GitHub mark logo path. The path uses `fill="#22d3ee"` (Tailwind `cyan-400`) to match the theme's accent color. Served as a static asset at `/github-mark.svg`.

### Link element in `pages/index.vue`

An `<a>` tag added near the end of the template, before the closing `</div>` of the root container:

```html
<a
  href="https://github.com/xcjs/neural-nation"
  target="_blank"
  rel="noopener noreferrer"
  class="fixed bottom-4 right-4 opacity-50 hover:opacity-100 transition-opacity duration-200"
  aria-label="View source on GitHub"
>
  <img src="/github-mark.svg" alt="GitHub" class="w-7 h-7">
</a>
```

- `fixed bottom-4 right-4`: pins to the viewport bottom-right corner, independent of the centered flex content flow
- `opacity-50 hover:opacity-100`: subtle at rest, full visibility on hover
- `transition-opacity duration-200`: smooth fade
- `w-7 h-7` (28px): unobtrusive but visible
- `aria-label`: accessible label for screen readers

## Files

| File                       | Change                                                        |
| -------------------------- | ------------------------------------------------------------- |
| `public/github-mark.svg`   | New file — GitHub mark SVG, `fill="#22d3ee"`                  |
| `pages/index.vue`          | Add fixed-position `<a>` with `<img>` before closing `</div>`  |

## Out of Scope

- Changes to `layouts/default.vue`
- Changes to `/play` or `/watch` pages
- New dependencies (no icon library)
- Tests (static visual element)