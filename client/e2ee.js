// End-to-end encryption primitives, WebCrypto only (browsers and Node >= 20).
//
// Each device holds a non-extractable ECDH P-256 identity key. An encrypted
// conversation has one random AES-256-GCM key per epoch; it is wrapped
// separately for every device of every member with a key derived from
// ECDH(wrapper, device) + HKDF. The server stores only wrapped keys and
// ciphertext. When someone leaves, the next sender starts a new epoch that the
// person who left is never given.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Keeps the identity key in IndexedDB as a non-extractable CryptoKey; falls back to memory. */
export function defaultKeyStore() {
  if (!globalThis.indexedDB) {
    const mem = new Map();
    return { get: async (k) => mem.get(k), set: async (k, v) => void mem.set(k, v) };
  }
  const open = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('plugchat', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('keys');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const op = async (mode, fn) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const req = fn(db.transaction('keys', mode).objectStore('keys'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    get: (k) => op('readonly', (s) => s.get(k)),
    set: (k, v) => op('readwrite', (s) => s.put(v, k)),
  };
}

/** Load this device's identity for a user, creating it on first use. */
export async function loadIdentity(keyStore, slot) {
  let identity = await keyStore.get(slot);
  if (!identity) {
    const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    identity = { deviceId: crypto.randomUUID(), privateKey: pair.privateKey, publicKey: b64(await subtle.exportKey('raw', pair.publicKey)) };
    await keyStore.set(slot, identity);
  } else if (!identity.deviceId) {
    identity.deviceId = crypto.randomUUID();
    await keyStore.set(slot, identity);
  }
  return identity;
}

async function wrappingKey(privateKey, peerPublicKey, conversationId) {
  const peer = await subtle.importKey('raw', unb64(peerPublicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const base = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(conversationId), info: enc.encode('plugchat-wrap-v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key, plain, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, plain));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

const open = (key, data, aad) =>
  subtle.decrypt({ name: 'AES-GCM', iv: data.subarray(0, 12), additionalData: enc.encode(aad) }, key, data.subarray(12));

const importConversationKey = (raw) => subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** A fresh conversation key. `raw` is kept only in memory, to wrap for members added later. */
export async function newConversationKey() {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return { raw, key: await importConversationKey(raw) };
}

export async function wrapKey(identity, myUserId, memberPublicKey, conversationId, raw) {
  const k = await wrappingKey(identity.privateKey, memberPublicKey, conversationId);
  return { by: myUserId, byKey: identity.publicKey, data: b64(await seal(k, raw, conversationId)) };
}

export async function unwrapKey(identity, wrapped, conversationId) {
  const k = await wrappingKey(identity.privateKey, wrapped.byKey, conversationId);
  const raw = new Uint8Array(await open(k, unb64(wrapped.data), conversationId));
  return { raw, key: await importConversationKey(raw) };
}

// The conversation id is bound in as associated data, so ciphertext can't be
// replayed into a different conversation.
// Wire format: "e1.<key epoch>.<base64>". The epoch says which conversation key
// was used; it goes up each time the key is replaced.
export const encryptText = async (key, text, conversationId, epoch) => `e1.${epoch}.` + b64(await seal(key, enc.encode(text), conversationId));
export const decryptText = async (key, body, conversationId) => dec.decode(await open(key, unb64(body.slice(body.indexOf('.', 3) + 1)), conversationId));
export const epochOf = (body) => Number(/^e1\.(\d+)\./.exec(body ?? '')?.[1] ?? 0);
export const encryptBytes = (key, bytes, conversationId) => seal(key, bytes, conversationId);
export const decryptBytes = (key, bytes, conversationId) => open(key, new Uint8Array(bytes), conversationId);

/**
 * A short code two people compare out-of-band to confirm nobody swapped
 * their keys in transit. Same members + same keys => same code.
 */
export async function safetyCode(publicKeys) {
  const digest = new Uint8Array(await subtle.digest('SHA-256', enc.encode([...publicKeys].sort().join('|'))));
  let digits = '';
  for (let i = 0; i < 12; i += 2) digits += String(((digest[i] << 8) | digest[i + 1]) % 100000).padStart(5, '0') + ' ';
  return digits.trim();
}
