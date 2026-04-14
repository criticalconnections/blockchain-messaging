import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { generateSigningKeyPair, publicKeyToBase64, base64ToPublicKey } from '@bm/crypto';
import { encodeBase64, decodeBase64 } from '@bm/crypto';
import { Store } from './store.js';
import { Mempool } from './mempool.js';
import { Chain } from './chain.js';
import { Miner } from './miner.js';
import { Pruner } from './pruner.js';
import type { Transaction, Block } from './types.js';

export interface NodeConfig {
  port: number;
  dataDir: string;
  blockIntervalMs: number;
  maxBlockSize: number;
  pruneIntervalMs: number;
}

const DEFAULT_CONFIG: NodeConfig = {
  port: 8001,
  dataDir: './data/blockchain',
  blockIntervalMs: 5000,
  maxBlockSize: 100,
  pruneIntervalMs: 60000,
};

export class BlockchainNode {
  private store: Store;
  private mempool: Mempool;
  private chain: Chain;
  private miner!: Miner;
  private pruner: Pruner;
  private config: NodeConfig;
  private eventClients: Set<WebSocket> = new Set();
  private server: http.Server | null = null;

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

    this.miner = new Miner(this.mempool, this.store, this.chain, {
      blockIntervalMs: this.config.blockIntervalMs,
      maxBlockSize: this.config.maxBlockSize,
      validatorSigningKey: signingKey,
      validatorPublicKey: publicKey,
    });

    this.chain.addValidator(publicKey);

    this.miner.on('block:confirmed', (block: Block) => {
      this.broadcast({
        type: 'BLOCK_CONFIRMED',
        data: { block },
      });
    });

    this.pruner.on('message:pruned', (data: { transactionId: string; recipient?: string }) => {
      this.broadcast({
        type: 'MESSAGE_PRUNED',
        data,
      });
    });

    this.miner.start();
    this.pruner.start();
    await this.startRpcServer();

    console.log(`Blockchain node running on port ${this.config.port}`);
    console.log(`Validator: ${publicKey.slice(0, 16)}...`);
  }

  async stop(): Promise<void> {
    this.miner.stop();
    this.pruner.stop();
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

    app.post('/tx', (req, res) => {
      const tx = req.body as Transaction;
      const added = this.mempool.add(tx);
      if (added) {
        res.json({ success: true, txId: tx.id });
      } else {
        res.status(400).json({ success: false, error: 'Invalid or duplicate transaction' });
      }
    });

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

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
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
