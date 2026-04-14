import { canonicalize, signData, verifySignature, hashData, base64ToPublicKey } from '@bm/crypto';
import { computeMerkleRoot } from './merkle.js';
import type { Block, BlockHeader, Transaction } from './types.js';

const encoder = new TextEncoder();

export function createBlock(
  previousHash: string,
  transactions: Transaction[],
  validatorSigningKey: Uint8Array,
  validatorPublicKey: string,
  index: number
): Block {
  const merkleRoot = computeMerkleRoot(transactions.map((tx) => tx.id));
  const timestamp = Date.now();

  const headerData: Record<string, unknown> = {
    index,
    previousHash,
    merkleRoot,
    timestamp,
    validator: validatorPublicKey,
  };

  const canonical = canonicalize(headerData);
  const signature = signData(encoder.encode(canonical), validatorSigningKey);

  const header: BlockHeader = {
    index,
    previousHash,
    merkleRoot,
    timestamp,
    validator: validatorPublicKey,
    signature,
  };

  const hash = hashBlock(header);

  return { header, transactions, hash };
}

export function hashBlock(header: BlockHeader): string {
  const canonical = canonicalize(header as unknown as Record<string, unknown>);
  return hashData(canonical);
}

export function validateBlock(
  block: Block,
  previousBlock: Block | null,
  authorizedValidators: string[]
): boolean {
  if (!authorizedValidators.includes(block.header.validator)) {
    return false;
  }

  if (previousBlock) {
    if (block.header.previousHash !== previousBlock.hash) return false;
    if (block.header.index !== previousBlock.header.index + 1) return false;
  } else {
    if (block.header.index !== 0) return false;
  }

  const expectedMerkle = computeMerkleRoot(block.transactions.map((tx) => tx.id));
  if (block.header.merkleRoot !== expectedMerkle) return false;

  const headerData: Record<string, unknown> = {
    index: block.header.index,
    previousHash: block.header.previousHash,
    merkleRoot: block.header.merkleRoot,
    timestamp: block.header.timestamp,
    validator: block.header.validator,
  };
  const canonical = canonicalize(headerData);
  const validatorKey = base64ToPublicKey(block.header.validator);

  if (!verifySignature(encoder.encode(canonical), block.header.signature, validatorKey)) {
    return false;
  }

  const expectedHash = hashBlock(block.header);
  if (block.hash !== expectedHash) return false;

  return true;
}

export function createGenesisBlock(
  validatorSigningKey: Uint8Array,
  validatorPublicKey: string
): Block {
  return createBlock(
    '0'.repeat(64),
    [],
    validatorSigningKey,
    validatorPublicKey,
    0
  );
}
