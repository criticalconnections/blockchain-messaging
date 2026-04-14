import { openDB, type IDBPDatabase } from 'idb';

interface BMKeyStoreSchema {
  identity: {
    key: string;
    value: {
      id: string;
      encPublicKey: ArrayBuffer;
      encSecretKey: ArrayBuffer;
      signPublicKey: ArrayBuffer;
      signSecretKey: ArrayBuffer;
    };
  };
  sharedSecrets: {
    key: string;
    value: {
      recipientPublicKey: string;
      secret: ArrayBuffer;
    };
  };
  groupKeys: {
    key: string;
    value: {
      groupId: string;
      symmetricKey: ArrayBuffer;
    };
  };
}

let db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (db) return db;
  db = await openDB('bm-keystore', 1, {
    upgrade(database) {
      database.createObjectStore('identity', { keyPath: 'id' });
      database.createObjectStore('sharedSecrets', { keyPath: 'recipientPublicKey' });
      database.createObjectStore('groupKeys', { keyPath: 'groupId' });
    },
  });
  return db;
}

export async function storeIdentity(
  encPublicKey: Uint8Array,
  encSecretKey: Uint8Array,
  signPublicKey: Uint8Array,
  signSecretKey: Uint8Array
): Promise<void> {
  const store = await getDB();
  await store.put('identity', {
    id: 'self',
    encPublicKey: encPublicKey.buffer.slice(encPublicKey.byteOffset, encPublicKey.byteOffset + encPublicKey.byteLength),
    encSecretKey: encSecretKey.buffer.slice(encSecretKey.byteOffset, encSecretKey.byteOffset + encSecretKey.byteLength),
    signPublicKey: signPublicKey.buffer.slice(signPublicKey.byteOffset, signPublicKey.byteOffset + signPublicKey.byteLength),
    signSecretKey: signSecretKey.buffer.slice(signSecretKey.byteOffset, signSecretKey.byteOffset + signSecretKey.byteLength),
  });
}

export async function getIdentity(): Promise<{
  encPublicKey: Uint8Array;
  encSecretKey: Uint8Array;
  signPublicKey: Uint8Array;
  signSecretKey: Uint8Array;
} | null> {
  const store = await getDB();
  const record = await store.get('identity', 'self');
  if (!record) return null;
  return {
    encPublicKey: new Uint8Array(record.encPublicKey),
    encSecretKey: new Uint8Array(record.encSecretKey),
    signPublicKey: new Uint8Array(record.signPublicKey),
    signSecretKey: new Uint8Array(record.signSecretKey),
  };
}

export async function storeSharedSecret(
  recipientPublicKey: string,
  secret: Uint8Array
): Promise<void> {
  const store = await getDB();
  await store.put('sharedSecrets', {
    recipientPublicKey,
    secret: secret.buffer.slice(secret.byteOffset, secret.byteOffset + secret.byteLength),
  });
}

export async function getSharedSecret(
  recipientPublicKey: string
): Promise<Uint8Array | null> {
  const store = await getDB();
  const record = await store.get('sharedSecrets', recipientPublicKey);
  if (!record) return null;
  return new Uint8Array(record.secret);
}

export async function storeGroupKey(
  groupId: string,
  symmetricKey: Uint8Array
): Promise<void> {
  const store = await getDB();
  await store.put('groupKeys', {
    groupId,
    symmetricKey: symmetricKey.buffer.slice(symmetricKey.byteOffset, symmetricKey.byteOffset + symmetricKey.byteLength),
  });
}

export async function getGroupKey(groupId: string): Promise<Uint8Array | null> {
  const store = await getDB();
  const record = await store.get('groupKeys', groupId);
  if (!record) return null;
  return new Uint8Array(record.symmetricKey);
}

export async function clearKeyStore(): Promise<void> {
  const store = await getDB();
  await store.clear('identity');
  await store.clear('sharedSecrets');
  await store.clear('groupKeys');
}
