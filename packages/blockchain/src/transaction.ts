import { v4 as uuidv4 } from 'uuid';
import { canonicalize, signData, verifySignature, base64ToPublicKey } from '@bm/crypto';
import type { TransactionType } from '@bm/crypto';
import type { Transaction } from './types.js';

const encoder = new TextEncoder();

export interface CreateTransactionInput {
  type: TransactionType;
  sender: string;
  recipient?: string;
  payload: string;
  ttl?: number;
  signingKey: Uint8Array;
}

export function createTransaction(input: CreateTransactionInput): Transaction {
  const { type, sender, recipient, payload, ttl, signingKey } = input;
  const id = uuidv4();
  const timestamp = Date.now();

  const signable: Record<string, unknown> = {
    id,
    type,
    sender,
    payload,
    timestamp,
  };
  if (recipient !== undefined) signable.recipient = recipient;
  if (ttl !== undefined) signable.ttl = ttl;

  const canonical = canonicalize(signable);
  const signature = signData(encoder.encode(canonical), signingKey);

  return {
    id,
    type,
    sender,
    recipient,
    payload,
    timestamp,
    ttl,
    signature,
  };
}

export function validateTransaction(tx: Transaction): boolean {
  if (!tx.id || !tx.type || !tx.sender || !tx.payload || !tx.signature) {
    return false;
  }

  if (tx.ttl !== undefined && tx.ttl < Date.now()) {
    return false;
  }

  const signable: Record<string, unknown> = {
    id: tx.id,
    type: tx.type,
    sender: tx.sender,
    payload: tx.payload,
    timestamp: tx.timestamp,
  };
  if (tx.recipient !== undefined) signable.recipient = tx.recipient;
  if (tx.ttl !== undefined) signable.ttl = tx.ttl;

  const canonical = canonicalize(signable);
  const senderKey = base64ToPublicKey(tx.sender);

  return verifySignature(encoder.encode(canonical), tx.signature, senderKey);
}
