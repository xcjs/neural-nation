# node:24-slim floats and currently resolves to Node 24.19+, which carries a V8 cleanup
# hook regression (nodejs/node#65446) that aborts the process when GC finalizes any
# node::ObjectWrap — a class better-sqlite3's Statement uses heavily. Every game-scoped
# request allocates statements; under load GC collects them and the runtime asserts
# `RemoveEnvironmentCleanupHook (env) != nullptr` and dies mid-request (observed in
# production as gateway 5xx bursts with rapid container restarts). Addons built against
# Node 24.18.x headers are unaffected and run cleanly even on newer 24.x runtimes
# (see the mitigation matrix in nodejs/node#65446), so pin the image until #65943
# backports the registry fix; revisit with the next LTS roll.
# 2026-10-19 second root-cause: mismatched pair. The builder's node-gyp fetched Node
# 24.22.0 HEADERS even on a 24.18.1 base (verified: shipped addon's build/config.gypi
# has nodedir=/root/.cache/node-gyp/24.22.0), so the addon compiled against 24.22
# headers ran on a 24.18.1 runtime — the 24.19+ ObjectWrap cleanup-hook registration
# needs BOTH sides on the fixed pair. v24.22.0 (2026-10-14, LTS Krypton) contains the
# complete fix set: 452e7/5468337-era backports including
# abe1b673e9 'src: keep global list of addon-provided cleanup hooks' (the registry,
# nodejs/node#63985/#65446 fix) and 5570a84048 'src: fix use-after-free in
# CleanupHookThunkRun' (#65630). Pin BOTH stages to 24.22.0-slim so headers and runtime
# are the same, fixed, matched pair. Supersedes the 24.18.1 pin from !9.
FROM node:24.22.0-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# npm ci (not install) = lockfile-exact AND, critically, a DIFFERENT command string than
# the cached `RUN npm install` layer: the builder's persistent build cache reused the
# old layer after the FROM pin (job 86151 trace shows `RUN npm install CACHED`), which
# shipped better-sqlite3 still compiled against Node 24.19.0 headers — per the upstream
# mitigation matrix, the crash follows the addon's BUILD HEADERS, not the runtime
# (24.19-headers addon aborts even on a 24.18.1 runtime). This line forces a fresh
# compile against the pinned base's 24.18.1 headers.
RUN npm ci

COPY . .
RUN npm run build

# Runtime must MATCH the builder's headers version (the v0.4.1 crash = 24.22-headers
# addon on a 24.18.1 runtime). See the builder-stage comment for the full root cause.
FROM node:24.22.0-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y libsqlite3-0 curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/package.json ./
COPY --from=builder /app/CHANGELOG.json ./
COPY --from=builder /app/data/games/_template.db /app/seed/_template.db
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/data/games

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV GAME_CLEANUP_ENABLED=true
ENV GAME_CLEANUP_AGE_DAYS=7
ENV GAME_CLEANUP_GRACE_DAYS=1
ENV GAME_CLEANUP_INTERVAL_HOURS=6

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]