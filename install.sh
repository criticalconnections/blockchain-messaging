#!/usr/bin/env bash
set -euo pipefail

echo "=== BlockMsg - Blockchain Encrypted Messaging ==="
echo ""

# Check dependencies
for cmd in docker git openssl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is required but not installed."
    exit 1
  fi
done

# Check docker compose (v2 plugin or standalone)
if docker compose version &>/dev/null; then
  COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  echo "ERROR: 'docker compose' is required but not installed."
  exit 1
fi

echo "[1/3] Generating secrets..."
if [ ! -f .env ]; then
  echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
  echo "  Created .env with random JWT secret"
else
  echo "  .env already exists, skipping"
fi

echo "[2/3] Building Docker images (this may take a few minutes on first run)..."
$COMPOSE build --quiet

echo "[3/3] Starting services..."
$COMPOSE up -d

echo ""
echo "Waiting for services to become healthy..."
sleep 5

# Wait up to 60s for api-server to be running
for i in $(seq 1 12); do
  if curl -sf http://localhost/api/health &>/dev/null; then
    echo ""
    echo "=== BlockMsg is running! ==="
    echo ""
    echo "  Open http://localhost in your browser"
    echo ""
    echo "  1. Register two accounts (use two browser tabs)"
    echo "  2. Search for the other user and start a chat"
    echo "  3. Messages are end-to-end encrypted on a custom blockchain"
    echo "  4. Use the clock icon to send ephemeral (auto-expiring) messages"
    echo ""
    echo "Commands:"
    echo "  $COMPOSE logs -f          # view logs"
    echo "  $COMPOSE down             # stop all services"
    echo "  $COMPOSE down -v          # stop and delete all data"
    echo ""
    exit 0
  fi
  sleep 5
done

echo ""
echo "WARNING: Services started but health check didn't pass yet."
echo "Run '$COMPOSE logs' to check for errors."
exit 1
