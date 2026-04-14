FROM node:20-alpine AS builder
WORKDIR /app

# Copy all package.json files for full workspace resolution
COPY package.json package-lock.json ./
COPY packages/crypto/package.json packages/crypto/
COPY packages/client/package.json packages/client/
# Stub remaining workspaces so npm ci resolves the lockfile
RUN mkdir -p packages/blockchain packages/server && \
    echo '{"name":"@bm/blockchain","version":"1.0.0","private":true}' > packages/blockchain/package.json && \
    echo '{"name":"@bm/server","version":"1.0.0","private":true}' > packages/server/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/crypto/ packages/crypto/
COPY packages/client/ packages/client/
COPY docker/ docker/

RUN npm run build -w packages/crypto
RUN npm run build -w packages/client

FROM nginx:alpine AS runner

COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
