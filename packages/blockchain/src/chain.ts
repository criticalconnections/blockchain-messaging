import { validateBlock } from './block.js';
import type { Block } from './types.js';
import type { Store } from './store.js';

export class Chain {
  private authorizedValidators: string[] = [];

  constructor(
    private store: Store,
    validators?: string[]
  ) {
    if (validators) this.authorizedValidators = validators;
  }

  addValidator(publicKey: string): void {
    if (!this.authorizedValidators.includes(publicKey)) {
      this.authorizedValidators.push(publicKey);
    }
  }

  getValidators(): string[] {
    return [...this.authorizedValidators];
  }

  async validateNewBlock(block: Block): Promise<boolean> {
    const state = await this.store.getChainState();

    if (!state) {
      return validateBlock(block, null, this.authorizedValidators);
    }

    const previousBlock = await this.store.getBlock(state.latestHash);
    if (!previousBlock) return false;

    return validateBlock(block, previousBlock, this.authorizedValidators);
  }

  async getHeight(): Promise<number> {
    const state = await this.store.getChainState();
    return state?.height ?? -1;
  }

  async getLatestBlock(): Promise<Block | null> {
    const state = await this.store.getChainState();
    if (!state) return null;
    return this.store.getBlock(state.latestHash);
  }
}
