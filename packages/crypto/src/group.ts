import nacl from 'tweetnacl';
import tweetnacl_util from 'tweetnacl-util';
const { encodeBase64, decodeBase64 } = tweetnacl_util;
import { encryptForRecipient, decryptFromSender, encryptSymmetric, decryptSymmetric } from './encryption.js';
import type { EncryptedPayload, GroupKey, WrappedGroupKey } from './types.js';

export function generateGroupKey(groupId: string): GroupKey {
  return {
    groupId,
    symmetricKey: nacl.randomBytes(nacl.secretbox.keyLength),
  };
}

export function wrapGroupKeyForMember(
  groupKey: GroupKey,
  memberPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): WrappedGroupKey {
  const encryptedKey = encryptForRecipient(
    encodeBase64(groupKey.symmetricKey),
    memberPublicKey,
    senderSecretKey
  );
  return {
    recipientPublicKey: encodeBase64(memberPublicKey),
    encryptedKey,
  };
}

export function unwrapGroupKey(
  wrapped: WrappedGroupKey,
  mySecretKey: Uint8Array,
  senderPublicKey: Uint8Array
): GroupKey {
  const keyBase64 = decryptFromSender(wrapped.encryptedKey, senderPublicKey, mySecretKey);
  return {
    groupId: '',
    symmetricKey: decodeBase64(keyBase64),
  };
}

export function encryptGroupMessage(
  plaintext: string,
  groupKey: GroupKey
): EncryptedPayload {
  return encryptSymmetric(plaintext, groupKey.symmetricKey);
}

export function decryptGroupMessage(
  payload: EncryptedPayload,
  groupKey: GroupKey
): string {
  return decryptSymmetric(payload, groupKey.symmetricKey);
}
