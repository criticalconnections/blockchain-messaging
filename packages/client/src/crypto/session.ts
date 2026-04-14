import {
  deriveSharedSecret,
  encryptSymmetric,
  decryptSymmetric,
  base64ToPublicKey,
  publicKeyToBase64,
  type EncryptedPayload,
} from '@bm/crypto';
import * as keystore from './keystore.js';

const secretCache = new Map<string, Uint8Array>();

export async function getOrDeriveSharedSecret(
  recipientPublicKeyB64: string
): Promise<Uint8Array> {
  const cached = secretCache.get(recipientPublicKeyB64);
  if (cached) return cached;

  const stored = await keystore.getSharedSecret(recipientPublicKeyB64);
  if (stored) {
    secretCache.set(recipientPublicKeyB64, stored);
    return stored;
  }

  const identity = await keystore.getIdentity();
  if (!identity) throw new Error('No identity keys found');

  const recipientKey = base64ToPublicKey(recipientPublicKeyB64);
  const secret = deriveSharedSecret(identity.encSecretKey, recipientKey);

  await keystore.storeSharedSecret(recipientPublicKeyB64, secret);
  secretCache.set(recipientPublicKeyB64, secret);

  return secret;
}

export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyB64: string
): Promise<EncryptedPayload> {
  const sharedSecret = await getOrDeriveSharedSecret(recipientPublicKeyB64);
  return encryptSymmetric(plaintext, sharedSecret);
}

export async function decryptMessage(
  payload: EncryptedPayload,
  senderPublicKeyB64: string
): Promise<string> {
  const sharedSecret = await getOrDeriveSharedSecret(senderPublicKeyB64);
  return decryptSymmetric(payload, sharedSecret);
}

export async function encryptGroupMsg(
  plaintext: string,
  groupId: string
): Promise<EncryptedPayload> {
  const key = await keystore.getGroupKey(groupId);
  if (!key) throw new Error('No group key found');
  return encryptSymmetric(plaintext, key);
}

export async function decryptGroupMsg(
  payload: EncryptedPayload,
  groupId: string
): Promise<string> {
  const key = await keystore.getGroupKey(groupId);
  if (!key) throw new Error('No group key found');
  return decryptSymmetric(payload, key);
}

export function clearSessionCache(): void {
  secretCache.clear();
}
