import { ClassicLevel } from 'classic-level';
import type { Block, Transaction, ChainState } from './types.js';

export class Store {
  private db: ClassicLevel<string, string>;

  constructor(dbPath: string) {
    this.db = new ClassicLevel(dbPath, { valueEncoding: 'utf8' });
  }

  async open(): Promise<void> {
    await this.db.open();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async putBlock(block: Block): Promise<void> {
    const batch = this.db.batch();
    batch.put(`block:${block.hash}`, JSON.stringify(block));
    batch.put(`block-by-index:${block.header.index}`, block.hash);

    for (const tx of block.transactions) {
      batch.put(`tx:${tx.id}`, JSON.stringify(tx));
      const recipientKey = tx.recipient || tx.sender;
      const listKey = `tx-list:${recipientKey}:${tx.timestamp}:${tx.id}`;
      batch.put(listKey, tx.id);

      if (tx.recipient && tx.recipient !== tx.sender) {
        const senderListKey = `tx-list:${tx.sender}:${tx.timestamp}:${tx.id}`;
        batch.put(senderListKey, tx.id);
      }
    }

    const state: ChainState = {
      height: block.header.index,
      latestHash: block.hash,
      latestTimestamp: block.header.timestamp,
    };
    batch.put('meta:chainState', JSON.stringify(state));

    await batch.write();
  }

  async getBlock(hash: string): Promise<Block | null> {
    try {
      const data = await this.db.get(`block:${hash}`);
      return JSON.parse(data) as Block;
    } catch {
      return null;
    }
  }

  async getBlockByIndex(index: number): Promise<Block | null> {
    try {
      const hash = await this.db.get(`block-by-index:${index}`);
      return this.getBlock(hash);
    } catch {
      return null;
    }
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    try {
      const data = await this.db.get(`tx:${id}`);
      return JSON.parse(data) as Transaction;
    } catch {
      return null;
    }
  }

  async getTransactionsByParticipant(
    participantId: string,
    limit = 50,
    before?: number
  ): Promise<Transaction[]> {
    const results: Transaction[] = [];
    const prefix = `tx-list:${participantId}:`;
    const endTimestamp = before || Date.now() + 1;

    for await (const [key, txId] of this.db.iterator({
      gte: prefix,
      lt: `tx-list:${participantId}:${endTimestamp}`,
      reverse: true,
      limit,
    })) {
      const tx = await this.getTransaction(txId);
      if (tx) results.push(tx);
    }

    return results;
  }

  async getChainState(): Promise<ChainState | null> {
    try {
      const data = await this.db.get('meta:chainState');
      return JSON.parse(data) as ChainState;
    } catch {
      return null;
    }
  }

  async pruneTransaction(id: string): Promise<boolean> {
    const tx = await this.getTransaction(id);
    if (!tx || tx.pruned) return false;

    tx.payload = '';
    tx.pruned = true;
    await this.db.put(`tx:${id}`, JSON.stringify(tx));
    return true;
  }

  async getExpiredTransactions(): Promise<Transaction[]> {
    const expired: Transaction[] = [];
    const now = Date.now();

    for await (const [key, value] of this.db.iterator({
      gte: 'tx:',
      lt: 'tx:\xFF',
    })) {
      const tx = JSON.parse(value) as Transaction;
      if (tx.ttl && tx.ttl < now && !tx.pruned) {
        expired.push(tx);
      }
    }

    return expired;
  }

  async getValidatorKey(): Promise<string | null> {
    try {
      return await this.db.get('meta:validatorKey');
    } catch {
      return null;
    }
  }

  async setValidatorKey(keyData: string): Promise<void> {
    await this.db.put('meta:validatorKey', keyData);
  }

  // --- User directory (populated from KEY_PUBLISH transactions) ---

  async putDirectoryEntry(entry: DirectoryEntry): Promise<void> {
    await this.db.put(`dir:${entry.signPublicKey}`, JSON.stringify(entry));
    await this.db.put(`dir-name:${entry.username.toLowerCase()}`, entry.signPublicKey);
  }

  async getDirectoryEntry(signPublicKey: string): Promise<DirectoryEntry | null> {
    try {
      const data = await this.db.get(`dir:${signPublicKey}`);
      return JSON.parse(data) as DirectoryEntry;
    } catch {
      return null;
    }
  }

  async searchDirectory(query: string): Promise<DirectoryEntry[]> {
    const results: DirectoryEntry[] = [];
    const q = query.toLowerCase();

    for await (const [key, value] of this.db.iterator({
      gte: 'dir:',
      lt: 'dir:\xFF',
    })) {
      const entry = JSON.parse(value) as DirectoryEntry;
      if (entry.username.toLowerCase().includes(q)) {
        results.push(entry);
      }
      if (results.length >= 20) break;
    }

    return results;
  }
}

export interface DirectoryEntry {
  username: string;
  encPublicKey: string;
  signPublicKey: string;
  timestamp: number;
}
