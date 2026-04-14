export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SigningKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface EncryptedPayload {
  nonce: string;
  ciphertext: string;
  ephemeralPublicKey?: string;
}

export interface GroupKey {
  groupId: string;
  symmetricKey: Uint8Array;
}

export interface WrappedGroupKey {
  recipientPublicKey: string;
  encryptedKey: EncryptedPayload;
}

export type TransactionType =
  | 'MESSAGE'
  | 'KEY_PUBLISH'
  | 'GROUP_CREATE'
  | 'GROUP_INVITE'
  | 'CHANNEL_CREATE'
  | 'CHANNEL_POST';
