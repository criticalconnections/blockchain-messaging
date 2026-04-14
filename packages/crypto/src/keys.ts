import nacl from 'tweetnacl';
import tweetnacl_util from 'tweetnacl-util';
const { encodeBase64, decodeBase64 } = tweetnacl_util;
import type { KeyPair, SigningKeyPair } from './types.js';

export function generateEncryptionKeyPair(): KeyPair {
  return nacl.box.keyPair();
}

export function generateSigningKeyPair(): SigningKeyPair {
  return nacl.sign.keyPair();
}

export function deriveSharedSecret(
  mySecretKey: Uint8Array,
  theirPublicKey: Uint8Array
): Uint8Array {
  return nacl.box.before(theirPublicKey, mySecretKey);
}

export function publicKeyToBase64(key: Uint8Array): string {
  return encodeBase64(key);
}

export function base64ToPublicKey(b64: string): Uint8Array {
  return decodeBase64(b64);
}

export { encodeBase64, decodeBase64 };
