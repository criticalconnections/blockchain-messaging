import type { TransactionType } from '@bm/crypto';

export type { TransactionType };

export interface Transaction {
  id: string;
  type: TransactionType;
  sender: string;
  recipient?: string;
  payload: string;
  timestamp: number;
  ttl?: number;
  signature: string;
  pruned?: boolean;
}

export interface BlockHeader {
  index: number;
  previousHash: string;
  merkleRoot: string;
  timestamp: number;
  validator: string;
  signature: string;
}

export interface Block {
  header: BlockHeader;
  transactions: Transaction[];
  hash: string;
}

export interface ChainState {
  height: number;
  latestHash: string;
  latestTimestamp: number;
}

export interface BlockchainEvent {
  type: 'BLOCK_CONFIRMED' | 'TX_ADDED' | 'MESSAGE_PRUNED';
  data: unknown;
}

export interface BlockConfirmedEvent {
  type: 'BLOCK_CONFIRMED';
  data: {
    block: Block;
  };
}

export interface TxAddedEvent {
  type: 'TX_ADDED';
  data: {
    transaction: Transaction;
  };
}

export interface MessagePrunedEvent {
  type: 'MESSAGE_PRUNED';
  data: {
    transactionId: string;
    recipient?: string;
  };
}
