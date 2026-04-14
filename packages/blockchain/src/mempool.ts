import { EventEmitter } from 'events';
import { validateTransaction } from './transaction.js';
import type { Transaction } from './types.js';

export class Mempool extends EventEmitter {
  private pool: Map<string, Transaction> = new Map();

  add(tx: Transaction): boolean {
    if (this.pool.has(tx.id)) return false;
    if (!validateTransaction(tx)) return false;

    this.pool.set(tx.id, tx);
    this.emit('transaction:added', tx);
    return true;
  }

  remove(ids: string[]): void {
    for (const id of ids) {
      this.pool.delete(id);
    }
  }

  getPending(maxCount: number): Transaction[] {
    const txs = Array.from(this.pool.values());
    txs.sort((a, b) => a.timestamp - b.timestamp);
    return txs.slice(0, maxCount);
  }

  has(id: string): boolean {
    return this.pool.has(id);
  }

  size(): number {
    return this.pool.size;
  }

  clear(): void {
    this.pool.clear();
  }
}
