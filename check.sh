#!/usr/bin/env bash
set -euo pipefail

echo "=== BlockMsg Diagnostics ==="
echo ""

# Detect compose command
if docker compose version &>/dev/null; then
  COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  echo "ERROR: docker compose not found"
  exit 1
fi

# Detect which compose file is in use
if docker ps --format '{{.Names}}' | grep -q "bm-peer"; then
  COMPOSE_FILE="peer-compose.yml"
  MODE="peer"
else
  COMPOSE_FILE="docker-compose.yml"
  MODE="relay"
fi

echo "Mode: $MODE"
echo "Compose file: $COMPOSE_FILE"
echo ""

# 1. Check containers
echo "--- Containers ---"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "blockchain|bm-peer" || echo "No containers found!"
echo ""

# 2. Check blockchain node health
echo "--- Blockchain Node Health ---"
HEALTH=$(docker exec $(docker ps -q -f name=blockchain-node) wget -qO- http://localhost:8001/health 2>/dev/null || echo "FAILED")
echo "$HEALTH"
echo ""

# 3. Check blockchain node logs (last 20 lines)
echo "--- Blockchain Node Logs (last 20) ---"
docker logs $(docker ps -q -f name=blockchain-node) 2>&1 | tail -20
echo ""

# 4. Check chain state
echo "--- Chain State ---"
docker exec $(docker ps -q -f name=blockchain-node) wget -qO- http://localhost:8001/chain/state 2>/dev/null || echo "FAILED"
echo ""

# 5. Check user directory
echo ""
echo "--- User Directory (all published users) ---"
docker exec $(docker ps -q -f name=blockchain-node) wget -qO- "http://localhost:8001/directory/search?q=." 2>/dev/null || echo "FAILED"
echo ""

# 6. Check API server
echo ""
echo "--- API Server Health ---"
curl -sf http://localhost/api/health 2>/dev/null || echo "FAILED"
echo ""

# 7. If peer mode, check relay connectivity
if [ "$MODE" = "peer" ]; then
  echo ""
  echo "--- Relay URL ---"
  RELAY_URL=$(grep RELAY_URL .env 2>/dev/null | cut -d= -f2-)
  echo "RELAY_URL=$RELAY_URL"
  echo ""
  echo "--- Peer Relay Connection Logs ---"
  docker logs $(docker ps -q -f name=blockchain-node) 2>&1 | grep -iE "relay|connect|peer|validator|sync|error" | tail -20
fi

echo ""
echo "=== Done ==="
