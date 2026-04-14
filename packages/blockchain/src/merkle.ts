import { hashData } from '@bm/crypto';

export function computeMerkleRoot(transactionIds: string[]): string {
  if (transactionIds.length === 0) {
    return hashData('');
  }

  let leaves = transactionIds.map((id) => hashData(id));

  while (leaves.length > 1) {
    if (leaves.length % 2 !== 0) {
      leaves.push(leaves[leaves.length - 1]);
    }
    const next: string[] = [];
    for (let i = 0; i < leaves.length; i += 2) {
      next.push(hashData(leaves[i] + leaves[i + 1]));
    }
    leaves = next;
  }

  return leaves[0];
}
