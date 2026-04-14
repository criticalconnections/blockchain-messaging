import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { generateSigningKeyPair, publicKeyToBase64 } from '@bm/crypto';
import { encodeBase64, decodeBase64 } from '@bm/crypto';
import { Store } from './store.js';
import { Mempool } from './mempool.js';
import { Chain } from './chain.js';
import { Miner } from './miner.js';
import { Pruner } from './pruner.js';
import { RelayServer, PeerClient } from './p2p.js';
import { validateTransaction } from './transaction.js';
import type { Transaction, Block } from './types.js';
import type { DirectoryEntry } from './store.js';

export type NodeMode = 'standalone' | 'relay' | 'peer';

export interface NodeConfig {
  port: number;
  dataDir: string;
  blockIntervalMs: number;
  maxBlockSize: number;
  pruneIntervalMs: number;
  mode: NodeMode;
  relayUrl?: string;
}

const DEFAULT_CONFIG: NodeConfig = {
  port: 8001,
  dataDir: './data/blockchain',
  blockIntervalMs: 5000,
  maxBlockSize: 100,
  pruneIntervalMs: 60000,
  mode: 'standalone',
};

export class BlockchainNode {
  private store: Store;
  private mempool: Mempool;
  private chain: Chain;
  private miner: Miner | null = null;
  private pruner: Pruner;
  private config: NodeConfig;
  private eventClients: Set<WebSocket> = new Set();
  private server: http.Server | null = null;
  private relayServer: RelayServer | null = null;
  private peerClient: PeerClient | null = null;

  constructor(config?: Partial<NodeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = new Store(this.config.dataDir);
    this.mempool = new Mempool();
    this.chain = new Chain(this.store);
    this.pruner = new Pruner(this.store, {
      intervalMs: this.config.pruneIntervalMs,
    });
  }

  async start(): Promise<void> {
    await this.store.open();
    const { signingKey, publicKey } = await this.initValidator();

    this.chain.addValidator(publicKey);

    if (this.config.mode === 'peer') {
      // Peer mode: no miner, connect to relay
      await this.startRpcServer();
      this.pruner.start();

      if (!this.config.relayUrl) {
        throw new Error('RELAY_URL is required in peer mode');
      }

      this.peerClient = new PeerClient(
        this.config.relayUrl,
        this.store,
        this.chain,
        publicKey.slice(0, 16),
        publicKey
      );

      this.peerClient.on('block:confirmed', (block: Block) => {
        this.indexBlockDirectory(block);
        this.broadcast({ type: 'BLOCK_CONFIRMED', data: { block } });
      });

      this.peerClient.connect();

      console.log(`Blockchain PEER node running on port ${this.config.port}`);
      console.log(`Relay: ${this.config.relayUrl}`);
      console.log(`Peer ID: ${publicKey.slice(0, 16)}...`);
    } else {
      // Relay or standalone mode: run miner
      this.miner = new Miner(this.mempool, this.store, this.chain, {
        blockIntervalMs: this.config.blockIntervalMs,
        maxBlockSize: this.config.maxBlockSize,
        validatorSigningKey: signingKey,
        validatorPublicKey: publicKey,
      });

      this.miner.on('block:confirmed', (block: Block) => {
        this.indexBlockDirectory(block);
        this.broadcast({ type: 'BLOCK_CONFIRMED', data: { block } });
        // In relay mode, also broadcast to P2P peers
        this.relayServer?.broadcastBlock(block);
      });

      this.pruner.on('message:pruned', (data: { transactionId: string; recipient?: string }) => {
        this.broadcast({ type: 'MESSAGE_PRUNED', data });
      });

      this.miner.start();
      this.pruner.start();
      await this.startRpcServer();

      // In relay mode, attach P2P relay server
      if (this.config.mode === 'relay' && this.server) {
        this.relayServer = new RelayServer(this.store, this.mempool, publicKey);
        this.relayServer.attach(this.server);
      }

      const modeLabel = this.config.mode === 'relay' ? 'RELAY' : 'STANDALONE';
      console.log(`Blockchain ${modeLabel} node running on port ${this.config.port}`);
      console.log(`Validator: ${publicKey.slice(0, 16)}...`);
    }
  }

  async stop(): Promise<void> {
    this.miner?.stop();
    this.pruner.stop();
    this.relayServer?.stop();
    this.peerClient?.disconnect();
    for (const ws of this.eventClients) ws.close();
    if (this.server) this.server.close();
    await this.store.close();
  }

  private async initValidator(): Promise<{ signingKey: Uint8Array; publicKey: string }> {
    const stored = await this.store.getValidatorKey();
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        signingKey: decodeBase64(parsed.secretKey),
        publicKey: parsed.publicKey,
      };
    }

    const keyPair = generateSigningKeyPair();
    const publicKey = publicKeyToBase64(keyPair.publicKey);
    const keyData = JSON.stringify({
      publicKey,
      secretKey: encodeBase64(keyPair.secretKey),
    });
    await this.store.setValidatorKey(keyData);

    return { signingKey: keyPair.secretKey, publicKey };
  }

  private async indexBlockDirectory(block: Block): Promise<void> {
    for (const tx of block.transactions) {
      if (tx.type === 'KEY_PUBLISH' && tx.payload && !tx.pruned) {
        try {
          const data = JSON.parse(tx.payload);
          const entry: DirectoryEntry = {
            username: data.username,
            encPublicKey: data.encPublicKey,
            signPublicKey: tx.sender,
            timestamp: tx.timestamp,
          };
          await this.store.putDirectoryEntry(entry);
        } catch {
          // skip malformed payloads
        }
      }
    }
  }

  private broadcast(event: unknown): void {
    const msg = JSON.stringify(event);
    for (const ws of this.eventClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  private async startRpcServer(): Promise<void> {
    const app = express();
    app.use(express.json({ limit: '1mb' }));

    // In peer mode, forward transactions to relay instead of local mempool
    if (this.config.mode === 'peer') {
      app.post('/tx', (req, res) => {
        const tx = req.body as Transaction;
        if (!validateTransaction(tx)) {
          res.status(400).json({ success: false, error: 'Invalid transaction' });
          return;
        }
        if (!this.peerClient?.isConnected) {
          res.status(503).json({ success: false, error: 'Not connected to relay' });
          return;
        }
        this.peerClient.forwardTransaction(tx);
        res.json({ success: true, txId: tx.id });
      });
    } else {
      app.post('/tx', (req, res) => {
        const tx = req.body as Transaction;
        const added = this.mempool.add(tx);
        if (added) {
          res.json({ success: true, txId: tx.id });
        } else {
          res.status(400).json({ success: false, error: 'Invalid or duplicate transaction' });
        }
      });
    }

    app.get('/tx/:id', async (req, res) => {
      const tx = await this.store.getTransaction(req.params.id);
      if (tx) {
        res.json(tx);
      } else {
        res.status(404).json({ error: 'Transaction not found' });
      }
    });

    app.get('/txs/:participantId', async (req, res) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const before = req.query.before ? parseInt(req.query.before as string) : undefined;
      const txs = await this.store.getTransactionsByParticipant(
        req.params.participantId,
        limit,
        before
      );
      res.json(txs);
    });

    app.get('/chain/state', async (_req, res) => {
      const state = await this.store.getChainState();
      res.json(state || { height: -1, latestHash: '', latestTimestamp: 0 });
    });

    app.get('/block/:hash', async (req, res) => {
      const block = await this.store.getBlock(req.params.hash);
      if (block) {
        res.json(block);
      } else {
        res.status(404).json({ error: 'Block not found' });
      }
    });

    app.get('/directory/search', async (req, res) => {
      const q = req.query.q as string;
      if (!q || q.length < 2) {
        res.json([]);
        return;
      }
      const results = await this.store.searchDirectory(q);
      res.json(results);
    });

    app.get('/directory/:key', async (req, res) => {
      const entry = await this.store.getDirectoryEntry(req.params.key);
      if (entry) {
        res.json(entry);
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    });

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', mode: this.config.mode });
    });

    this.server = http.createServer(app);
    const wss = new WebSocketServer({ server: this.server, path: '/events' });

    wss.on('connection', (ws) => {
      this.eventClients.add(ws);
      ws.on('close', () => this.eventClients.delete(ws));
      ws.on('error', () => this.eventClients.delete(ws));
    });

    return new Promise((resolve) => {
      this.server!.listen(this.config.port, () => resolve());
    });
  }
}

// Entry point when run directly
const isMainModule = process.argv[1]?.endsWith('node.js') || process.argv[1]?.endsWith('node.ts');
if (isMainModule) {
  const node = new BlockchainNode({
    port: parseInt(process.env.PORT || '8001'),
    dataDir: process.env.DATA_DIR || './data/blockchain',
    blockIntervalMs: parseInt(process.env.BLOCK_INTERVAL_MS || '5000'),
    maxBlockSize: parseInt(process.env.MAX_BLOCK_SIZE || '100'),
    pruneIntervalMs: parseInt(process.env.PRUNE_INTERVAL_MS || '60000'),
    mode: (process.env.NODE_MODE as NodeMode) || 'standalone',
    relayUrl: process.env.RELAY_URL,
  });

  node.start().catch((err) => {
    console.error('Failed to start blockchain node:', err);
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    await node.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await node.stop();
    process.exit(0);
  });
}
