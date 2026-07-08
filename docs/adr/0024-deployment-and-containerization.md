# ADR-0024: Deployment & Containerization

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0001, ADR-0005, ADR-0020 |

## Context

The application is a single Nuxt 3 / Nitro process hosting both the web UI and
the MCP server (ADR-0001). It uses file-based SQLite databases for per-game
state (ADR-0005), requiring persistent filesystem access. The game cleanup
scheduler (ADR-0020) uses Nitro scheduled tasks. Deployment is via a private
GitLab CI/CD instance with Docker runners.

## Decision

Deploy the application as a **Docker container** orchestrated by **docker
compose**, built and pushed via **GitLab CI/CD pipelines** with Docker runners.

### Container Image

- **Base image**: `node:22-slim` (or `node:22-alpine` for smaller size if
  `better-sqlite3` native compilation works cleanly; otherwise use `slim` for
  glibc compatibility).
- **Multi-stage build**:
  1. **Builder stage**: Install all deps, run `nuxt build`, produce `.output/`
     (Nitro server bundle).
  2. **Runtime stage**: Copy `.output/` + production deps only. No dev deps,
     no source, no `.nuxt/` dev artifacts.
- **Native module**: `better-sqlite3` requires native compilation. Use
  `node-gyp` in the builder stage with build-essential tools installed. The
  compiled `.node` binary is copied to the runtime stage.
- **Image size target**: <200 MB (slim base + Nitro output + node_modules prod
  deps).

### Dockerfile

```dockerfile
# Builder
FROM node:22-slim AS builder
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime
FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", ".output/server/index.mjs"]
```

### docker-compose.yml

```yaml
version: "3.9"
services:
  neural-nation:
    build: .
    image: registry.gitlab.example.com/neural-nation:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data          # Persistent SQLite game DBs + registry
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=3000
      - GAME_CLEANUP_ENABLED=true
      - GAME_CLEANUP_AGE_DAYS=7
      - GAME_CLEANUP_GRACE_DAYS=1
      - GAME_CLEANUP_INTERVAL_HOURS=6
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- **Volume mount**: `./data:/app/data` persists all SQLite game databases,
  the template DB, and `registry.json` across container restarts.
- **Health check**: Nitro exposes `GET /api/health` returning 200 when the
  server is ready. Used by Docker for restart/health monitoring.

### GitLab CI/CD Pipeline

`.gitlab-ci.yml` with stages: `build`, `test`, `deploy`.

```yaml
stages:
  - test
  - build
  - deploy

variables:
  IMAGE_TAG: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA
  IMAGE_LATEST: $CI_REGISTRY_IMAGE:latest

test:
  stage: test
  image: node:22-slim
  script:
    - npm ci
    - npm run test:coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d.]+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

build-image:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $IMAGE_TAG -t $IMAGE_LATEST .
    - docker push $IMAGE_TAG
    - docker push $IMAGE_LATEST
  only:
    - master

deploy:
  stage: deploy
  image: docker:24
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker pull $IMAGE_LATEST
    - docker compose down
    - docker compose up -d
  only:
    - master
  when: manual   # Manual deploy trigger for v1; can switch to auto later
  tags:
    - production-runner
```

- **Test stage**: Runs Vitest with coverage (ADR-0022) before any image build.
- **Build stage**: Builds Docker image, tags with commit SHA + `latest`, pushes
  to GitLab container registry.
- **Deploy stage**: Pulls latest image, restarts compose stack. Manual trigger
  for v1 (can automate later).
- **Runners**: Use Docker runners with Docker-in-Docker (dind) for image builds.
  Deploy job runs on a production-runner tagged runner with Docker socket access.

### Environment Variables

All game configuration via environment variables (no config files in v1):

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Node environment |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `3000` | HTTP port |
| `GAME_CLEANUP_ENABLED` | `true` | Enable automatic cleanup (ADR-0020) |
| `GAME_CLEANUP_AGE_DAYS` | `7` | Stale game age threshold |
| `GAME_CLEANUP_GRACE_DAYS` | `1` | Grace period before deletion |
| `GAME_CLEANUP_INTERVAL_HOURS` | `6` | Cleanup check frequency |

### Persistent Data

- **`data/` directory** is a bind-mounted volume — survives container
  recreation. Contains:
  - `data/games/_template.db` — template database (built once, read-only)
  - `data/games/{token}.db` — per-game databases
  - `data/games/registry.json` — game registry
  - `data/geological/` — cached geological/terrain raw data (if downloaded
    separately during build)
- **Backup**: Simple filesystem backup of `data/` directory. No database dump
  needed — SQLite files are self-contained.
- **Migration**: Template DB is rebuilt in the image build step. Existing game
  DBs get Drizzle migrations applied on first open after upgrade (ADR-0005).

### Nitro Scheduled Tasks in Docker

- Nitro's `server/plugins/` mechanism handles the cleanup scheduler
  (ADR-0020). This runs within the same Node process — no separate cron
  container needed.
- The scheduler is resilient to restarts: it checks `last_active_at` on each
  game in the registry, so a container restart doesn't miss cleanup windows.

### Health Endpoint

`GET /api/health` returns:
```json
{ "status": "ok", "uptime": 12345, "games": 12 }
```

Used by Docker healthcheck and external monitoring. Does not expose any
sensitive data (no tokens, no game details).

## Consequences

**Positive:**
- Docker image is self-contained and reproducible — same artifact in CI and
  production.
- docker compose provides simple single-host orchestration with volume
  persistence.
- GitLab CI pipeline automates test → build → deploy with coverage gating.
- No external database server — SQLite files on a mounted volume keep
  infrastructure minimal.
- Health endpoint enables Docker auto-restart on failure.

**Negative:**
- Single-host deployment — no horizontal scaling without shared filesystem
  (NFS/POSIX volumes). Acceptable for v1; user deferred scalability concerns.
- `better-sqlite3` native compilation adds build complexity. Mitigated by
  multi-stage build with build tools in builder only.
- Container must have persistent volume — ephemeral container deployments
  (serverless, Fargate without EFS) won't work. docker compose volume mount
  handles this.
- Manual deploy trigger for v1 — risk of forgetting to deploy after merge.
  Can switch to auto-deploy later.
- Registry credentials and runner tags must be configured in GitLab project
  settings.

## Alternatives Considered

- **Bare VPS with systemd**: Simpler but no CI automation, manual deploys,
  no health checks. Docker + compose + GitLab CI is more automated and
  reproducible.
- **Kubernetes**: Overkill for a single-process app with file-based storage.
  Kubernetes adds operational complexity (kubectl, manifests, ingress, PVCs)
  with no benefit at v1 scale.
- **Serverless (Cloud Run, Lambda)**: Rejected — SQLite file-per-game requires
  persistent filesystem access, which serverless platforms don't provide
  cleanly. Also, Nitro's SSE connections and scheduled tasks don't fit
  serverless execution models.
- **PostgreSQL + serverless**: Would enable serverless but adds a database
  server dependency, loses file-per-game isolation, and contradicts ADR-0005.
- **Nginx reverse proxy in compose**: Could add for TLS termination and
  static caching, but Nitro handles both adequately for v1. Add later if
  needed.