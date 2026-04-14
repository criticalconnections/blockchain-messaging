FROM node:20-alpine AS builder
WORKDIR /app

# Copy all package.json files for full workspace resolution
COPY package.json package-lock.json ./
COPY packages/crypto/package.json packages/crypto/
COPY packages/blockchain/package.json packages/blockchain/
# Stub remaining workspaces so npm ci resolves the lockfile
RUN mkdir -p packages/server packages/client && \
    echo '{"name":"@bm/server","version":"1.0.0","private":true}' > packages/server/package.json && \
    echo '{"name":"@bm/client","version":"1.0.0","private":true}' > packages/client/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/crypto/ packages/crypto/
COPY packages/blockchain/ packages/blockchain/

RUN npm run build -w packages/crypto && npm run build -w packages/blockchain

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/crypto/dist ./packages/crypto/dist
COPY --from=builder /app/packages/crypto/package.json ./packages/crypto/
COPY --from=builder /app/packages/blockchain/dist ./packages/blockchain/dist
COPY --from=builder /app/packages/blockchain/package.json ./packages/blockchain/
COPY --from=builder /app/package.json ./

RUN mkdir -p /app/data/blockchain && chown -R appuser:appgroup /app/data

USER appuser

ENV PORT=8001
ENV DATA_DIR=/app/data/blockchain
EXPOSE 8001

CMD ["node", "packages/blockchain/dist/node.js"]
