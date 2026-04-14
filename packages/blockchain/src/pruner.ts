import { EventEmitter } from 'events';
import type { Store } from './store.js';

export interface PrunerConfig {
  intervalMs: number;
}

export class Pruner extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: Store,
    private config: PrunerConfig
  ) {
    super();
  }

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.pruneExpired();
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pruneExpired(): Promise<number> {
    let pruned = 0;

    try {
      const expired = await this.store.getExpiredTransactions();

      for (const tx of expired) {
        const didPrune = await this.store.pruneTransaction(tx.id);
        if (didPrune) {
          pruned++;
          this.emit('message:pruned', {
            transactionId: tx.id,
            recipient: tx.recipient,
          });
        }
      }
    } catch (err) {
      console.error('Pruner error:', err);
    }

    return pruned;
  }
}
