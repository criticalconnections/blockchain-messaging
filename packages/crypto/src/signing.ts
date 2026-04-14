import nacl from 'tweetnacl';
import tweetnacl_util from 'tweetnacl-util';
const { encodeBase64, decodeBase64 } = tweetnacl_util;

export function signData(data: Uint8Array, secretKey: Uint8Array): string {
  const signature = nacl.sign.detached(data, secretKey);
  return encodeBase64(signature);
}

export function verifySignature(
  data: Uint8Array,
  signature: string,
  publicKey: Uint8Array
): boolean {
  const sigBytes = decodeBase64(signature);
  return nacl.sign.detached.verify(data, sigBytes, publicKey);
}

function toHex(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return hex.join('');
}

const encoder = new TextEncoder();

export function hashData(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  const hash = nacl.hash(bytes);
  return toHex(hash);
}

export function canonicalize(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}
