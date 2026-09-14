# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public

RUN sed -i \
      -e 's|deb.debian.org/debian|mirrors.cloud.tencent.com/debian|g' \
      -e 's|security.debian.org/debian-security|mirrors.cloud.tencent.com/debian-security|g' \
      /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable && \
    corepack prepare pnpm@10.15.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma

RUN --mount=type=cache,id=h5-vote-pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server

RUN pnpm build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=4173
ENV HOST=0.0.0.0
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN sed -i \
      -e 's|deb.debian.org/debian|mirrors.cloud.tencent.com/debian|g' \
      -e 's|security.debian.org/debian-security|mirrors.cloud.tencent.com/debian-security|g' \
      /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg openssl && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable && \
    corepack prepare pnpm@10.15.1 --activate

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data/uploads

EXPOSE 4173

CMD ["sh", "-c", "pnpm prisma:migrate:deploy && exec node dist/server/index.js"]
