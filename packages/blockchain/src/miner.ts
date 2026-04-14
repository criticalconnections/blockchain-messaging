import { EventEmitter } from 'events';
import { createBlock, createGenesisBlock } from './block.js';
import type { Block } from './types.js';
import type { Mempool } from './mempool.js';
import type { Store } from './store.js';
import type { Chain } from './chain.js';

export interface MinerConfig {
  blockIntervalMs: number;
  maxBlockSize: number;
  validatorSigningKey: Uint8Array;
  validatorPublicKey: string;
}

export class Miner extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private mining = false;

  constructor(
    private mempool: Mempool,
    private store: Store,
    private chain: Chain,
    private config: MinerConfig
  ) {
    super();
  }

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.tryMineBlock();
    }, this.config.blockIntervalMs);

    this.mempool.on('transaction:added', () => {
      if (this.mempool.size() >= this.config.maxBlockSize) {
        this.tryMineBlock();
      }
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tryMineBlock(): Promise<void> {
    if (this.mining) return;
    this.mining = true;

    try {
      const pending = this.mempool.getPending(this.config.maxBlockSize);
      const state = await this.store.getChainState();

      let block: Block;

      if (!state) {
        block = createGenesisBlock(
          this.config.validatorSigningKey,
          this.config.validatorPublicKey
        );
        if (pending.length > 0) {
          await this.store.putBlock(block);
          const nextBlock = createBlock(
            block.hash,
            pending,
            this.config.validatorSigningKey,
            this.config.validatorPublicKey,
            1
          );
          block = nextBlock;
        }
      } else {
        if (pending.length === 0) {
          this.mining = false;
          return;
        }

        block = createBlock(
          state.latestHash,
          pending,
          this.config.validatorSigningKey,
          this.config.validatorPublicKey,
          state.height + 1
        );
      }

      const valid = await this.chain.validateNewBlock(block);
      if (!valid) {
        console.error('Mined block failed validation');
        this.mining = false;
        return;
      }

      await this.store.putBlock(block);
      this.mempool.remove(pending.map((tx) => tx.id));

      this.emit('block:confirmed', block);
    } catch (err) {
      console.error('Mining error:', err);
    } finally {
      this.mining = false;
    }
  }
}
