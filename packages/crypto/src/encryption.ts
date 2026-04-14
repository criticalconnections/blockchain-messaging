import nacl from 'tweetnacl';
import tweetnacl_util from 'tweetnacl-util';
const { encodeBase64, decodeBase64 } = tweetnacl_util;
import type { EncryptedPayload } from './types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encryptForRecipient(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): EncryptedPayload {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageBytes = encoder.encode(plaintext);
  const ciphertext = nacl.box(messageBytes, nonce, recipientPublicKey, senderSecretKey);
  if (!ciphertext) {
    throw new Error('Encryption failed');
  }
  return {
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext),
  };
}

export function decryptFromSender(
  payload: EncryptedPayload,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): string {
  const nonce = decodeBase64(payload.nonce);
  const ciphertext = decodeBase64(payload.ciphertext);
  const decrypted = nacl.box.open(ciphertext, nonce, senderPublicKey, recipientSecretKey);
  if (!decrypted) {
    throw new Error('Decryption failed — invalid key or tampered message');
  }
  return decoder.decode(decrypted);
}

export function encryptSymmetric(
  plaintext: string,
  sharedKey: Uint8Array
): EncryptedPayload {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageBytes = encoder.encode(plaintext);
  const ciphertext = nacl.secretbox(messageBytes, nonce, sharedKey);
  return {
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext),
  };
}

export function decryptSymmetric(
  payload: EncryptedPayload,
  sharedKey: Uint8Array
): string {
  const nonce = decodeBase64(payload.nonce);
  const ciphertext = decodeBase64(payload.ciphertext);
  const decrypted = nacl.secretbox.open(ciphertext, nonce, sharedKey);
  if (!decrypted) {
    throw new Error('Decryption failed — invalid key or tampered message');
  }
  return decoder.decode(decrypted);
}
