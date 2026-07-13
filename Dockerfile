FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y libsqlite3-0 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/package.json ./

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
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", ".output/server/index.mjs"]