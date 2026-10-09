# Build context must be repositories/ (sibling cueai-* packages for file: deps).
# docker compose in cueai-infra sets context: ..
FROM node:20-bookworm-slim AS builder

WORKDIR /workspace

COPY cueai-ai-orchestrator ./cueai-ai-orchestrator
COPY cueai-export-service ./cueai-export-service
COPY cueai-gateway ./cueai-gateway
COPY cueai-knowledge-service ./cueai-knowledge-service
COPY cueai-notification-service ./cueai-notification-service
COPY cueai-resume-service ./cueai-resume-service
COPY cueai-screen-context-service ./cueai-screen-context-service
COPY cueai-shared-libraries ./cueai-shared-libraries
COPY cueai-transcription-service ./cueai-transcription-service
COPY cueai-translation-service ./cueai-translation-service
COPY cueai-web ./cueai-web

WORKDIR /workspace/cueai-web

ARG AUTH_SECRET=<change-me>
ENV AUTH_SECRET=$AUTH_SECRET
ENV NODE_OPTIONS=--dns-result-order=ipv4first

RUN npm install
# Next 16 defaults to Turbopack; this repo has a webpack xenova stub alias.
RUN npx next build --webpack

# Official standalone layout: public + static sit next to server.js.
# Do not copy the builder node_modules tree — only NFT-traced standalone files.
RUN node scripts/assemble-standalone.cjs /out

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ARG AUTH_SECRET=<change-me>
ENV AUTH_SECRET=$AUTH_SECRET

COPY --from=builder /out ./

EXPOSE 3000

CMD ["node", "server.js"]
