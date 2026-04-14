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

# Check docker compose
if docker compose version &>/dev/null; then
  COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  echo "ERROR: 'docker compose' is required but not installed."
  exit 1
fi

# Ask install mode
echo "Install as relay server or peer node?"
echo "  relay - Central server that peers connect to (run this first)"
echo "  peer  - Connects to an existing relay server"
echo ""
read -rp "Mode [relay/peer] (default: relay): " INSTALL_MODE
INSTALL_MODE="${INSTALL_MODE:-relay}"

if [ "$INSTALL_MODE" = "relay" ]; then
  echo ""
  echo "[1/3] Generating secrets..."
  if [ ! -f .env ]; then
    echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
    echo "  Created .env with random JWT secret"
  else
    echo "  .env already exists, skipping"
  fi

  echo "[2/3] Building Docker images (this may take a few minutes)..."
  $COMPOSE -f docker-compose.yml build --quiet

  echo "[3/3] Starting relay services..."
  $COMPOSE -f docker-compose.yml up -d

  echo ""
  echo "Waiting for services..."
  sleep 5

  for i in $(seq 1 12); do
    if curl -sf http://localhost/api/health &>/dev/null; then
      RELAY_IP=$(curl -sf ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
      echo ""
      echo "=== BlockMsg RELAY is running! ==="
      echo ""
      echo "  Web UI:    http://localhost"
      echo "  Relay URL: ws://${RELAY_IP}/p2p"
      echo ""
      echo "  Give peers this relay URL to connect:"
      echo "    ws://${RELAY_IP}/p2p"
      echo ""
      echo "  On each peer computer, run:"
      echo "    git clone https://github.com/criticalconnections/blockchain-messaging.git"
      echo "    cd blockchain-messaging"
      echo "    bash install.sh    # choose 'peer' and enter the relay URL above"
      echo ""
      echo "Commands:"
      echo "  $COMPOSE -f docker-compose.yml logs -f    # view logs"
      echo "  $COMPOSE -f docker-compose.yml down        # stop"
      echo "  $COMPOSE -f docker-compose.yml down -v     # stop and delete data"
      echo ""
      exit 0
    fi
    sleep 5
  done

  echo "WARNING: Services started but health check didn't pass."
  echo "Run '$COMPOSE -f docker-compose.yml logs' to check for errors."
  exit 1

elif [ "$INSTALL_MODE" = "peer" ]; then
  echo ""
  read -rp "Enter relay URL (e.g. ws://1.2.3.4/p2p): " RELAY_URL
  if [ -z "$RELAY_URL" ]; then
    echo "ERROR: Relay URL is required for peer mode."
    exit 1
  fi

  echo ""
  echo "[1/3] Generating secrets..."
  if [ ! -f .env ]; then
    {
      echo "JWT_SECRET=$(openssl rand -hex 32)"
      echo "RELAY_URL=${RELAY_URL}"
    } > .env
    echo "  Created .env"
  else
    if ! grep -q "RELAY_URL" .env; then
      echo "RELAY_URL=${RELAY_URL}" >> .env
    fi
    echo "  .env updated with RELAY_URL"
  fi

  echo "[2/3] Building Docker images (this may take a few minutes)..."
  $COMPOSE -f peer-compose.yml build --quiet

  echo "[3/3] Starting peer services..."
  $COMPOSE -f peer-compose.yml up -d

  echo ""
  echo "Waiting for services..."
  sleep 5

  for i in $(seq 1 12); do
    if curl -sf http://localhost/api/health &>/dev/null; then
      echo ""
      echo "=== BlockMsg PEER is running! ==="
      echo ""
      echo "  Web UI:  http://localhost"
      echo "  Relay:   ${RELAY_URL}"
      echo ""
      echo "  Open http://localhost in your browser to register and start messaging."
      echo "  Your node syncs with the relay automatically."
      echo ""
      echo "Commands:"
      echo "  $COMPOSE -f peer-compose.yml logs -f    # view logs"
      echo "  $COMPOSE -f peer-compose.yml down        # stop"
      echo "  $COMPOSE -f peer-compose.yml down -v     # stop and delete data"
      echo ""
      exit 0
    fi
    sleep 5
  done

  echo "WARNING: Services started but health check didn't pass."
  echo "Run '$COMPOSE -f peer-compose.yml logs' to check for errors."
  exit 1

else
  echo "ERROR: Unknown mode '$INSTALL_MODE'. Use 'relay' or 'peer'."
  exit 1
fi
