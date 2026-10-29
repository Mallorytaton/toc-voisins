// Web Push chiffré (RFC 8291, aes128gcm) et signé (VAPID, RFC 8292), avec WebCrypto seulement :
// le même code tourne dans le Worker Cloudflare et dans les tests (Node).
const enc = new TextEncoder();

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface Vapid {
  /** Clé publique brute (65 octets) en base64url */
  publicKey: string;
  /** Partie privée « d » de la clé, en base64url */
  privateKey: string;
  /** Contact du service (https:// ou mailto:) */
  subject: string;
}

export const b64u = {
  encode(buf: ArrayBuffer | Uint8Array): string {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Uint8Array {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** HKDF-SHA256 (extraction puis expansion) : `len` octets. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

/**
 * Chiffre un message pour un abonnement : un seul enregistrement aes128gcm.
 * `salt` et `local` (clé éphémère du serveur) ne se fixent que pour les tests.
 */
export async function encrypt(sub: PushSub, payload: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16)), local?: CryptoKeyPair) {
  const uaPub = b64u.decode(sub.keys.p256dh);
  const auth = b64u.decode(sub.keys.auth);
  const as = local ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Le délimiteur 0x02 marque le dernier (et unique) enregistrement.
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/** En-tête Authorization VAPID pour le service de push de l'abonnement (valable 12 h). */
export async function vapidAuth(endpoint: string, v: Vapid) {
  const aud = new URL(endpoint).origin;
  const part = (o: object) => b64u.encode(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.subject })}`;
  const pub = b64u.decode(v.publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64u.encode(sig)}, k=${v.publicKey}`;
}

export interface PushOptions {
  /** Durée de vie (s) si le téléphone est injoignable */
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  /** Un message en attente du même sujet remplace le précédent */
  topic?: string;
}

/** Envoie un message ; renvoie le statut HTTP du service de push (404 ou 410 : abonnement expiré). */
export async function sendPush(sub: PushSub, data: object, v: Vapid, o: PushOptions = {}) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, v),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(o.ttl ?? 86_400),
      Urgency: o.urgency ?? 'normal',
      ...(o.topic ? { Topic: o.topic } : {}),
    },
    body: await encrypt(sub, enc.encode(JSON.stringify(data))),
  });
  return res.status;
}
