FROM node:20.20.2-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json vitest.*.config.ts eslint.config.mjs ./
COPY apps ./apps
COPY packages ./packages
COPY adapters ./adapters
COPY config ./config
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:20.20.2-bookworm-slim AS runtime
ENV NODE_ENV=production AGENT_FABRIC_HOST=0.0.0.0 AGENT_FABRIC_PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/server ./apps/server
COPY --from=build --chown=node:node /workspace/packages ./packages
COPY --from=build --chown=node:node /workspace/adapters ./adapters
COPY --from=build --chown=node:node /workspace/package.json ./package.json
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=6 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/server/dist/bin.js"]
