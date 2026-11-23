const textEncoder = new TextEncoder();

const DEFAULT_VAPID_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_PUSH_TTL_SECONDS = 60;
const AES128GCM_RECORD_SIZE = 4096;

export interface PushSubscriptionKeys {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface SendWebPushResult {
  readonly status: number;
  readonly ok: boolean;
  readonly gone: boolean;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  const encoded = textEncoder.encode(value);
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);
  return copy;
}

function concatBytes(
  ...chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>
): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function hmacSha256(
  keyBytes: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return new Uint8Array(signature);
}

async function hkdfExpandSingleBlock(
  prk: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const one = new Uint8Array(new ArrayBuffer(1));
  one[0] = 0x01;
  const block = await hmacSha256(prk, concatBytes(info, one));
  const out = new Uint8Array(new ArrayBuffer(length));
  out.set(block.subarray(0, length));
  return out;
}

function assertUncompressedP256PublicKey(
  bytes: Uint8Array<ArrayBuffer>,
  label: string,
): void {
  if (bytes.byteLength !== 65 || bytes[0] !== 0x04) {
    throw new Error(
      `${label} must be a 65-byte uncompressed P-256 public key.`,
    );
  }
}

export async function createVapidAuthorizationHeader(params: {
  readonly endpoint: string;
  readonly subject: string;
  readonly vapidPublicKey: string;
  readonly vapidPrivateKey: string;
  readonly nowMs?: number;
  readonly ttlSeconds?: number;
}): Promise<string> {
  const url = new URL(params.endpoint);
  const publicBytes = base64UrlDecode(params.vapidPublicKey);
  assertUncompressedP256PublicKey(publicBytes, "VAPID public key");

  const privateBytes = base64UrlDecode(params.vapidPrivateKey);
  if (privateBytes.byteLength !== 32) {
    throw new Error("VAPID private key must be a 32-byte P-256 scalar.");
  }

  const signingKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(publicBytes.subarray(1, 33)),
      y: base64UrlEncode(publicBytes.subarray(33, 65)),
      d: base64UrlEncode(privateBytes),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const nowSeconds = Math.floor((params.nowMs ?? Date.now()) / 1000);
  const ttlSeconds = params.ttlSeconds ?? DEFAULT_VAPID_TTL_SECONDS;
  const headerPart = base64UrlEncode(
    encodeUtf8(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const payloadPart = base64UrlEncode(
    encodeUtf8(
      JSON.stringify({
        aud: url.origin,
        exp: nowSeconds + ttlSeconds,
        sub: params.subject,
      }),
    ),
  );
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      encodeUtf8(signingInput),
    ),
  );

  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;
  return `vapid t=${jwt}, k=${params.vapidPublicKey.trim()}`;
}

export async function encryptWebPushPayload(params: {
  readonly p256dh: string;
  readonly auth: string;
  readonly payload: string;
}): Promise<Uint8Array<ArrayBuffer>> {
  const clientPublicBytes = base64UrlDecode(params.p256dh);
  assertUncompressedP256PublicKey(clientPublicBytes, "Subscriber p256dh key");

  const authSecret = base64UrlDecode(params.auth);
  if (authSecret.byteLength !== 16) {
    throw new Error("Subscriber auth secret must be 16 bytes.");
  }

  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const serverPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey),
  );
  assertUncompressedP256PublicKey(serverPublicBytes, "Ephemeral server key");

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      serverKeyPair.privateKey,
      256,
    ),
  );

  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);

  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concatBytes(
    encodeUtf8("WebPush: info\0"),
    clientPublicBytes,
    serverPublicBytes,
  );
  const ikm = await hkdfExpandSingleBlock(prkKey, keyInfo, 32);

  const prk = await hmacSha256(salt, ikm);
  const cek = await hkdfExpandSingleBlock(
    prk,
    encodeUtf8("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdfExpandSingleBlock(
    prk,
    encodeUtf8("Content-Encoding: nonce\0"),
    12,
  );

  const delimiter = new Uint8Array(new ArrayBuffer(1));
  delimiter[0] = 0x02;
  const paddedPlaintext = concatBytes(encodeUtf8(params.payload), delimiter);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      paddedPlaintext,
    ),
  );

  const header = new Uint8Array(
    new ArrayBuffer(16 + 4 + 1 + serverPublicBytes.byteLength),
  );
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, AES128GCM_RECORD_SIZE, false);
  header[20] = serverPublicBytes.byteLength;
  header.set(serverPublicBytes, 21);

  return concatBytes(header, ciphertext);
}

export async function sendWebPushMessage(params: {
  readonly subscription: PushSubscriptionKeys;
  readonly payload: string;
  readonly vapidPublicKey: string;
  readonly vapidPrivateKey: string;
  readonly vapidSubject: string;
  readonly ttlSeconds?: number;
  readonly fetchImpl?: typeof fetch;
}): Promise<SendWebPushResult> {
  const ttlSeconds = params.ttlSeconds ?? DEFAULT_PUSH_TTL_SECONDS;
  const [authorization, body] = await Promise.all([
    createVapidAuthorizationHeader({
      endpoint: params.subscription.endpoint,
      subject: params.vapidSubject,
      vapidPublicKey: params.vapidPublicKey,
      vapidPrivateKey: params.vapidPrivateKey,
    }),
    encryptWebPushPayload({
      p256dh: params.subscription.p256dh,
      auth: params.subscription.auth,
      payload: params.payload,
    }),
  ]);

  const fetchFn = params.fetchImpl ?? fetch;
  const response = await fetchFn(params.subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: String(ttlSeconds),
      Urgency: "high",
      Authorization: authorization,
    },
    body,
  });

  return {
    status: response.status,
    ok: response.ok,
    gone: response.status === 404 || response.status === 410,
  };
}
