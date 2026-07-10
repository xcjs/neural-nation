# ADR-0001: Project Architecture

| Field    | Value         |
| -------- | ------------- |
| Status   | Proposed      |
| Date     | 2026-07-08    |
| Deciders | Project owner |

## Context

Neural Nation is a browser game where players watch an LLM autonomously build an
industrial economy on a 3D earth. The system needs: a 3D rendering layer, a
server-side game state manager, a token-based MCP server, and per-game SQLite
databases — all in a single cohesive codebase deployable as one process.

## Decision

Use **Nuxt 3** as the unified application framework with the following stack:

- **Nuxt 3** — full-stack Vue framework; Nitro server hosts both the web UI and
  the MCP server in a single process.
- **Vue 3 + TypeScript** — UI components and shared type definitions; strict
  typing across client and server.
- **TresJS** (`@tresjs/core`) — declarative Vue wrapper around Three.js for 3D
  earth rendering (see ADR-0002).
- **SQLite via `better-sqlite3`** — per-game databases stored on the server
  filesystem (see ADR-0005).
- **MCP SDK (`@modelcontextprotocol/sdk`)** — HTTP/SSE transport for LLM client
  connectivity (see ADR-0004).
- **Pinia** — client-side state management for game state mirrored from the
  server.
- **Tailwind CSS** — UI styling for non-3D elements (panels, HUD, overlays).

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  Nuxt 3 / Nitro (single process)                     │
│                                                      │
│  ┌─────────────────┐    ┌──────────────────────────┐ │
│  │  Web UI (Vue)    │    │  MCP Server (HTTP/SSE)    │ │
│  │  TresJS earth    │    │  Token-scoped tools       │ │
│  │  HUD / panels    │    │  LLM connects externally  │ │
│  └────────┬────────┘    └───────────┬──────────────┘ │
│           │                         │                │
│           └──────────┬──────────────┘                │
│                      ▼                               │
│           ┌───────────────────────┐                  │
│           │  Game Engine (Nitro)   │                  │
│           │  Simulation tick loop  │                  │
│           │  Resource/facility mgr │                  │
│           └───────────┬───────────┘                  │
│                       ▼                               │
│           ┌───────────────────────┐                  │
│           │  SQLite (per-game DB)  │                  │
│           │  data/games/{token}.db │                  │
│           └───────────────────────┘                  │
└──────────────────────────────────────────────────────┘
```

## Consequences

**Positive:**

- Single deployable artifact; no separate services to coordinate.
- Shared TypeScript types between client, server, and MCP tools.
- Nitro handles routing for both web routes and MCP endpoints.
- Nuxt's plugin/middleware system gives clean extension points.

**Negative:**

- Single-process means MCP tool execution shares the event loop with web
  requests. Long-running simulations must yield or use worker threads.
- `better-sqlite3` is a native module; adds build complexity vs pure-JS
  alternatives. Chosen for performance and synchronous API ergonomics.

## Alternatives Considered

- **Separate MCP service**: More deployment complexity, inter-process
  communication overhead. Rejected — Nitro can host both cleanly.
- **Bun + vanilla server**: Faster runtime but loses Vue/Nuxt ecosystem
  integration and SSR for the UI.
- **PostgreSQL instead of SQLite**: Overkill for per-game ephemeral databases;
  SQLite's file-per-database model maps perfectly to one-game-per-token.
