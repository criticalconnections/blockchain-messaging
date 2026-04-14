FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

# Copy all package.json files for full workspace resolution
COPY package.json package-lock.json ./
COPY packages/crypto/package.json packages/crypto/
COPY packages/blockchain/package.json packages/blockchain/
COPY packages/server/package.json packages/server/
# Stub client workspace so npm ci resolves the lockfile
RUN mkdir -p packages/client && \
    echo '{"name":"@bm/client","version":"1.0.0","private":true}' > packages/client/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/crypto/ packages/crypto/
COPY packages/blockchain/ packages/blockchain/
COPY packages/server/ packages/server/

RUN npx -w packages/server prisma generate
RUN npm run build -w packages/crypto
RUN npm run build -w packages/blockchain
RUN npm run build -w packages/server

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/crypto/dist ./packages/crypto/dist
COPY --from=builder /app/packages/crypto/package.json ./packages/crypto/
COPY --from=builder /app/packages/blockchain/dist ./packages/blockchain/dist
COPY --from=builder /app/packages/blockchain/package.json ./packages/blockchain/
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/packages/server/prisma ./packages/server/prisma
COPY --from=builder /app/package.json ./

ENV PORT=3001
ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "-c", "cd packages/server && npx prisma migrate deploy && cd /app && node packages/server/dist/index.js"]
