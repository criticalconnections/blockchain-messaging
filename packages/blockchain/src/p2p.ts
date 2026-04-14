import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import type http from 'http';
import { validateTransaction } from './transaction.js';
import type { Block, Transaction } from './types.js';
import type { Store } from './store.js';
import type { Chain } from './chain.js';
import type { Mempool } from './mempool.js';

// --- P2P Protocol ---

interface P2PRegister {
  type: 'REGISTER';
  peerId: string;
  publicKey: string;
}

interface P2PPeers {
  type: 'PEERS';
  peers: Array<{ id: string; publicKey: string }>;
}

interface P2PTxForward {
  type: 'TX_FORWARD';
  transaction: Transaction;
}

interface P2PBlockBroadcast {
  type: 'BLOCK_BROADCAST';
  block: Block;
}

interface P2PSyncRequest {
  type: 'SYNC_REQUEST';
  fromHeight: number;
}

interface P2PSyncResponse {
  type: 'SYNC_RESPONSE';
  blocks: Block[];
}

interface P2PValidatorInfo {
  type: 'VALIDATOR_INFO';
  publicKey: string;
}

interface P2PPing {
  type: 'PING';
}

interface P2PPong {
  type: 'PONG';
}

type P2PMessage =
  | P2PRegister
  | P2PPeers
  | P2PTxForward
  | P2PBlockBroadcast
  | P2PSyncRequest
  | P2PSyncResponse
  | P2PValidatorInfo
  | P2PPing
  | P2PPong;

interface PeerInfo {
  ws: WebSocket;
  peerId: string;
  publicKey: string;
  alive: boolean;
}

const SYNC_BATCH_SIZE = 50;

// --- Relay Server ---

export class RelayServer {
  private wss: WebSocketServer | null = null;
  private peers: Map<string, PeerInfo> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: Store,
    private mempool: Mempool,
    private validatorPublicKey: string
  ) {}

  attach(server: http.Server): void {
    this.wss = new WebSocketServer({ server, path: '/p2p' });

    this.wss.on('connection', (ws) => {
      let peerId: string | null = null;

      // Send validator info immediately so peer can validate our blocks
      this.send(ws, { type: 'VALIDATOR_INFO', publicKey: this.validatorPublicKey });

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString()) as P2PMessage;
          await this.handleMessage(ws, msg, peerId, (id) => {
            peerId = id;
          });
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        if (peerId) {
          this.peers.delete(peerId);
          console.log(`Peer disconnected: ${peerId}`);
        }
      });

      ws.on('error', () => {
        if (peerId) this.peers.delete(peerId);
      });
    });

    // Heartbeat every 30s
    this.heartbeatTimer = setInterval(() => {
      for (const [id, peer] of this.peers) {
        if (!peer.alive) {
          peer.ws.terminate();
          this.peers.delete(id);
          continue;
        }
        peer.alive = false;
        this.send(peer.ws, { type: 'PING' });
      }
    }, 30000);

    console.log('P2P relay server listening on /p2p');
  }

  private async handleMessage(
    ws: WebSocket,
    msg: P2PMessage,
    currentPeerId: string | null,
    setPeerId: (id: string) => void
  ): Promise<void> {
    switch (msg.type) {
      case 'REGISTER': {
        setPeerId(msg.peerId);
        this.peers.set(msg.peerId, {
          ws,
          peerId: msg.peerId,
          publicKey: msg.publicKey,
          alive: true,
        });

        // Send peer list
        const peerList = Array.from(this.peers.values())
          .filter((p) => p.peerId !== msg.peerId)
          .map((p) => ({ id: p.peerId, publicKey: p.publicKey }));
        this.send(ws, { type: 'PEERS', peers: peerList });

        console.log(`Peer registered: ${msg.peerId}`);
        break;
      }

      case 'TX_FORWARD': {
        if (validateTransaction(msg.transaction)) {
          this.mempool.add(msg.transaction);
        }
        break;
      }

      case 'SYNC_REQUEST': {
        const state = await this.store.getChainState();
        if (!state) {
          this.send(ws, { type: 'SYNC_RESPONSE', blocks: [] });
          break;
        }

        let currentHeight = msg.fromHeight;
        while (currentHeight <= state.height) {
          const batch: Block[] = [];
          const endHeight = Math.min(currentHeight + SYNC_BATCH_SIZE - 1, state.height);

          for (let i = currentHeight; i <= endHeight; i++) {
            const block = await this.store.getBlockByIndex(i);
            if (block) batch.push(block);
          }

          this.send(ws, { type: 'SYNC_RESPONSE', blocks: batch });
          currentHeight = endHeight + 1;
        }

        // Send empty batch to signal sync complete
        if ((state.height - msg.fromHeight + 1) % SYNC_BATCH_SIZE === 0) {
          this.send(ws, { type: 'SYNC_RESPONSE', blocks: [] });
        }
        break;
      }

      case 'PONG': {
        if (currentPeerId) {
          const peer = this.peers.get(currentPeerId);
          if (peer) peer.alive = true;
        }
        break;
      }
    }
  }

  broadcastBlock(block: Block): void {
    const msg: P2PBlockBroadcast = { type: 'BLOCK_BROADCAST', block };
    const data = JSON.stringify(msg);
    for (const peer of this.peers.values()) {
      if (peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(data);
      }
    }
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const peer of this.peers.values()) {
      peer.ws.close();
    }
    this.peers.clear();
    this.wss?.close();
  }

  private send(ws: WebSocket, msg: P2PMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

// --- Peer Client ---

export class PeerClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private synced = false;
  private pendingBroadcasts: Block[] = [];

  constructor(
    private relayUrl: string,
    private store: Store,
    private chain: Chain,
    private peerId: string,
    private publicKey: string
  ) {
    super();
  }

  connect(): void {
    this.shouldReconnect = true;

    try {
      this.ws = new WebSocket(this.relayUrl);
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', async () => {
      console.log(`Connected to relay: ${this.relayUrl}`);
      this.reconnectDelay = 1000;

      // Register with relay
      this.send({ type: 'REGISTER', peerId: this.peerId, publicKey: this.publicKey });

      // Request sync from last known height
      const state = await this.store.getChainState();
      const fromHeight = state ? state.height + 1 : 0;
      this.synced = false;
      this.pendingBroadcasts = [];
      this.send({ type: 'SYNC_REQUEST', fromHeight });
    });

    this.ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as P2PMessage;
        await this.handleMessage(msg);
      } catch {
        // ignore
      }
    });

    this.ws.on('close', () => {
      console.log('Disconnected from relay');
      this.synced = false;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      console.error('Relay connection error:', (err as Error).message);
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  forwardTransaction(tx: Transaction): void {
    this.send({ type: 'TX_FORWARD', transaction: tx });
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get isSynced(): boolean {
    return this.synced;
  }

  private async handleMessage(msg: P2PMessage): Promise<void> {
    switch (msg.type) {
      case 'VALIDATOR_INFO': {
        this.chain.addValidator(msg.publicKey);
        console.log(`Relay validator key received: ${msg.publicKey.slice(0, 16)}...`);
        break;
      }

      case 'PEERS': {
        console.log(`Network has ${msg.peers.length} other peer(s)`);
        break;
      }

      case 'SYNC_RESPONSE': {
        if (msg.blocks.length === 0) {
          // Sync complete — replay buffered broadcasts
          this.synced = true;
          console.log('Initial sync complete');
          await this.drainPendingBroadcasts();
          break;
        }

        for (const block of msg.blocks) {
          await this.storeBlock(block);
        }

        // If fewer than batch size, sync is done
        if (msg.blocks.length < SYNC_BATCH_SIZE) {
          this.synced = true;
          console.log('Initial sync complete');
          await this.drainPendingBroadcasts();
        }
        break;
      }

      case 'BLOCK_BROADCAST': {
        if (!this.synced) {
          this.pendingBroadcasts.push(msg.block);
          return;
        }
        await this.storeBlock(msg.block);
        break;
      }

      case 'PING': {
        this.send({ type: 'PONG' });
        break;
      }
    }
  }

  private async storeBlock(block: Block): Promise<void> {
    // Skip if already stored
    const existing = await this.store.getBlock(block.hash);
    if (existing) return;

    const valid = await this.chain.validateNewBlock(block);
    if (!valid) {
      console.error(`Invalid block received: index=${block.header.index} hash=${block.hash.slice(0, 16)}`);
      return;
    }

    await this.store.putBlock(block);
    this.emit('block:confirmed', block);
  }

  private async drainPendingBroadcasts(): Promise<void> {
    const blocks = this.pendingBroadcasts.sort(
      (a, b) => a.header.index - b.header.index
    );
    this.pendingBroadcasts = [];

    for (const block of blocks) {
      await this.storeBlock(block);
    }
  }

  private send(msg: P2PMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.log(`Reconnecting in ${this.reconnectDelay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this.connect();
    }, this.reconnectDelay);
  }
}
