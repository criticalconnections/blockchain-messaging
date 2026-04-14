import WebSocket from 'ws';
import { config } from './config.js';
import type { Transaction, ChainState, Block, BlockchainEvent } from '@bm/blockchain';

export class BlockchainClient {
  private ws: WebSocket | null = null;
  private eventHandlers: Array<(event: BlockchainEvent) => void> = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  async submitTransaction(tx: Transaction): Promise<{ txId: string }> {
    const res = await fetch(`${config.blockchainNodeUrl}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tx),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Blockchain error: ${(err as { error: string }).error}`);
    }
    return res.json() as Promise<{ txId: string }>;
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    const res = await fetch(`${config.blockchainNodeUrl}/tx/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch transaction');
    return res.json() as Promise<Transaction>;
  }

  async getTransactionsByParticipant(
    participantId: string,
    limit = 50,
    before?: number
  ): Promise<Transaction[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', String(before));
    const res = await fetch(
      `${config.blockchainNodeUrl}/txs/${participantId}?${params}`
    );
    if (!res.ok) throw new Error('Failed to fetch transactions');
    return res.json() as Promise<Transaction[]>;
  }

  async getChainState(): Promise<ChainState> {
    const res = await fetch(`${config.blockchainNodeUrl}/chain/state`);
    if (!res.ok) throw new Error('Failed to fetch chain state');
    return res.json() as Promise<ChainState>;
  }

  async getBlock(hash: string): Promise<Block | null> {
    const res = await fetch(`${config.blockchainNodeUrl}/block/${hash}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch block');
    return res.json() as Promise<Block>;
  }

  subscribeToEvents(handler: (event: BlockchainEvent) => void): () => void {
    this.eventHandlers.push(handler);
    this.ensureWsConnection();

    return () => {
      this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
    };
  }

  private ensureWsConnection(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(`${config.blockchainWsUrl}/events`);

    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString()) as BlockchainEvent;
        for (const handler of this.eventHandlers) {
          handler(event);
        }
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.on('close', () => {
      this.scheduleReconnect();
    });

    this.ws.on('error', () => {
      this.ws?.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.eventHandlers.length > 0) {
        this.ensureWsConnection();
      }
    }, 3000);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.eventHandlers = [];
  }
}

export const blockchainClient = new BlockchainClient();
